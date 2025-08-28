// DataviewJS Block

const daysAgo = 1;
dv.header(2, `${daysAgo} days ago:`);

async function sendToAPI(prompt, placeholder) {
  const url = 'http://localhost:11434/api/generate';
  const payload = {
    model: 'mistral-nemo:latest',
    prompt: prompt,
    temperature: 0.01,
    stream: true, // Enable streaming
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error('Failed to send data:', response.statusText);
    placeholder.innerText = 'Failed to load response.';
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    // Handle multiple JSON objects per chunk
    const lines = chunk.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.response) {
          result += json.response;
        }
      } catch (parseError) {
        // Skip malformed JSON chunks
        console.warn('Skipping malformed JSON chunk:', line);
      }
    }

    // Update the specific placeholder's text content instead of creating new paragraphs
    if (placeholder && placeholder.innerText !== undefined) {
      placeholder.innerText = 'Loading...';
    }
  }

  // After streaming is complete, parse and display the multiple choice question
  try {
    const parsedResponse = parseJSONResponse(result);

    // Render the quiz UI at the placeholder's location
    renderQuizUI(parsedResponse, placeholder);

    // Remove loading placeholder after rendering quiz
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
  } catch (error) {
    console.error('Failed to parse JSON response:', error);
    if (placeholder) {
      placeholder.innerText = 'Error: Could not parse the response as valid JSON.';
    }
  }
}

function parseJSONResponse(response) {
  console.log('Raw response:', response); // Debug log

  // Try to extract JSON from the response (in case there's extra text)
  let jsonStr = response.trim();

  // Look for JSON object boundaries - find the first { and last }
  const startIndex = jsonStr.indexOf('{');
  const endIndex = jsonStr.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('No valid JSON object found in response');
  }

  jsonStr = jsonStr.substring(startIndex, endIndex + 1);

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate the structure
    if (
      !parsed.question ||
      !Array.isArray(parsed.options) ||
      typeof parsed.correct_index !== 'number'
    ) {
      throw new Error('Invalid JSON structure - missing required fields');
    }

    return {
      question: parsed.question,
      options: parsed.options,
      correctIndex: parsed.correct_index,
    };
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    console.error('Attempting to parse:', jsonStr);
    throw new Error(`Failed to parse JSON response: ${parseError.message}`);
  }
}

function renderQuizUI(quizData, placeholder) {
  // Get the parent container where we want to insert the quiz
  const parentContainer = placeholder.parentNode;

  // Create a question paragraph and insert it before the placeholder
  const questionEl = document.createElement('p');
  questionEl.textContent = quizData.question;
  parentContainer.insertBefore(questionEl, placeholder);

  // Create a container div and insert it before the placeholder
  const container = document.createElement('div');
  parentContainer.insertBefore(container, placeholder);

  // Store references to radio buttons
  const radioButtons = [];

  // Create radio buttons for each option with a unique name for this quiz
  const uniqueId = Date.now(); // Create unique identifier for this quiz
  quizData.options.forEach((option, index) => {
    const radioDiv = container.createEl('div');
    const radio = radioDiv.createEl('input', {
      type: 'radio',
      name: `quiz-option-${uniqueId}`,
      value: String(index),
      id: `option-${uniqueId}-${index}`,
    });

    // Store reference to radio button
    radioButtons.push(radio);

    // Function to select this radio button
    const selectThisRadio = () => {
      // Deselect all other radio buttons in this group
      radioButtons.forEach(btn => {
        if (btn !== radio) {
          btn.checked = false;
        }
      });
      // Ensure this radio button is selected
      radio.checked = true;
    };

    // Add click handler to radio button
    radio.addEventListener('click', selectThisRadio);

    const label = radioDiv.createEl('label', {
      text: option,
      attr: { for: `option-${uniqueId}-${index}` },
    });

    // Add click handler to label to also select the radio button
    label.addEventListener('click', event => {
      event.preventDefault();
      selectThisRadio();
    });

    // Make label appear clickable
    label.style.cursor = 'pointer';
    label.style.userSelect = 'none'; // Prevent text selection when clicking

    // Add some spacing between options
    radioDiv.style.margin = '8px 0';
  });

  // Add check button
  const checkButton = container.createEl('button', {
    text: 'Check Answer',
    attr: { type: 'button' },
  });

  // Add result display area
  const resultDiv = container.createEl('div');
  resultDiv.id = `result-${uniqueId}`;
  resultDiv.style.marginTop = '10px';
  resultDiv.style.fontWeight = 'bold';

  // Add click handler for the check button
  checkButton.addEventListener('click', event => {
    event.preventDefault();

    // Check radio buttons directly using our stored references
    let selectedIndex = -1;
    for (let i = 0; i < radioButtons.length; i++) {
      if (radioButtons[i].checked) {
        selectedIndex = i;
        break;
      }
    }

    if (selectedIndex === -1) {
      resultDiv.textContent = 'Please select an answer!';
      resultDiv.style.color = 'orange';
      return;
    }

    if (selectedIndex === quizData.correctIndex) {
      resultDiv.textContent = 'Correct! ✓';
      resultDiv.style.color = 'green';
    } else {
      resultDiv.textContent = `Incorrect. The correct answer is: ${
        quizData.options[quizData.correctIndex]
      }`;
      resultDiv.style.color = 'red';
    }
  });
}

function createPrompt(title, content) {
  return `You are creating a spaced repetition quiz question based on specific study notes. Your goal is to test deep understanding of the actual content provided, not general knowledge.

CRITICAL ACCURACY REQUIREMENT:
- The correct_index MUST point to the factually correct answer
- Double-check your answer selection before responding
- If unsure about correctness, choose a different question approach
- Wrong answers should be plausible but clearly incorrect based on facts

IMPORTANT GUIDELINES:
- Focus on SPECIFIC facts, concepts, and details mentioned in the notes
- Avoid basic definitional questions that could be answered without reading the notes
- Create questions that require understanding of the relationships, mechanisms, or specific examples provided
- Test comprehension of nuanced details rather than surface-level information
- If the notes contain specific numbers, examples, or case studies, incorporate them

Topic: ${title}

Study Notes:
<notes>${content}</notes>

TASK: Create a challenging multiple choice question that tests understanding of SPECIFIC information from these notes. The question should be something that someone couldn't answer correctly just from general knowledge - they would need to have studied these particular notes.

Requirements:
- Question must be directly answerable from the note content
- Focus on specific details, relationships, or mechanisms mentioned
- Include 4-5 plausible options where incorrect answers are reasonable but clearly wrong based on the notes
- Make the correct answer require careful reading and understanding of the notes
- VERIFY that your correct_index points to the actually correct answer

QUALITY CHECK PROCESS:
1. Write your question and options
2. Verify which option is factually correct
3. Set correct_index to that option's position (0-based)
4. Double-check that the correct_index matches the right answer

Respond with valid JSON in exactly this format:

{
    "question": "your specific, detail-oriented question here",
    "options": ["option 1", "option 2", "option 3", "option 4"],
    "correct_index": 0
}

Where:
- question: A specific question testing detailed understanding of the note content
- options: 4-5 options with plausible distractors based on the subject matter
- correct_index: The index (0-based) of the FACTUALLY CORRECT answer (double-check this!)

Respond ONLY with the JSON object, no additional text.`;
}

function getNotes(daysOld) {
  const now = Date.now();
  const msDay = 24 * 60 * 60 * 1000;

  const upper = now - daysOld * msDay; // e.g. now - 24h
  const lower = now - (daysOld + 1) * msDay; // e.g. now - 48h

  return dv.pages().where(p => {
    const ctime = new Date(p.file.ctime).getTime();
    const mtime = new Date(p.file.mtime).getTime();
    const lastActivity = Math.max(ctime, mtime);
    return lastActivity >= lower && lastActivity < upper;
  });
}

const notes = getNotes(daysAgo);

if (!notes || notes.length === 0) {
  dv.paragraph('No notes');
} else {
  // First, render ALL note titles immediately with placeholders
  const noteSections = [];
  for (const note of notes) {
    dv.header(4, note.file.name);
    let placeholder = dv.paragraph('Loading response...');
    noteSections.push({
      note: note,
      placeholder: placeholder,
    });
    dv.el('hr', '');
    dv.el('hr', '');
    dv.el('hr', '');
  }

  // Then, process each note's question sequentially to avoid DOM conflicts
  processQuestionsSequentially(noteSections);
}

async function processQuestionsSequentially(noteSections) {
  for (const { note, placeholder } of noteSections) {
    const filePath = note.file.path;

    try {
      // Read the content of the note
      const fileContent = await dv.io.load(filePath);
      const noteText = fileContent.replace(/^---\n.*?\n---\n/s, '').trim();

      // Send the content to the API and stream the response to THIS specific placeholder
      const prompt = createPrompt(note.file.name, noteText);
      await sendToAPI(prompt, placeholder);
    } catch (error) {
      console.error('Error processing note:', error);
      if (placeholder && placeholder.parentNode) {
        placeholder.innerText = 'Error generating question. Please try again.';
      }
    }
  }
}
