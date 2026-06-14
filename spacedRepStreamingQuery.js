// DataviewJS Block

const MODEL = 'gpt-oss:20b';
const daysAgo = 1;
dv.header(2, `${daysAgo} days ago:`);

async function sendToAPI(prompt, placeholder) {
  const url = 'http://localhost:11434/api/generate';
  const payload = {
    model: MODEL,
    prompt: prompt,
    temperature: 0.01,
    stream: true, // Enable streaming
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    console.error('Network error contacting Ollama:', networkError);
    if (placeholder) {
      placeholder.innerText = 'Failed to reach Ollama at http://localhost:11434. Is it running?';
    }
    return;
  }

  if (!response.ok) {
    let errorText = '';
    try {
      errorText = await response.text();
    } catch (_) {}
    console.error('Failed to send data:', response.status, response.statusText, errorText);
    if (placeholder) {
      placeholder.innerText = `Failed to load response (${response.status}). ${
        errorText || response.statusText
      }`;
    }
    return;
  }

  // Update placeholder to show request was sent
  if (placeholder && placeholder.innerText !== undefined) {
    placeholder.innerText = 'Request sent...waiting for response';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let rawText = '';
  let chunkCount = 0;
  let totalResponseLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    rawText += chunk;

    // Handle multiple JSON objects per chunk
    const lines = chunk.split('\n').filter(line => line.trim());

    for (let line of lines) {
      // Handle potential Server-Sent Events style prefix
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        line = trimmed.slice(5).trim(); // remove 'data:' prefix
      }
      try {
        const json = JSON.parse(line);
        chunkCount++;

        // Debug logging for each chunk
        console.log(`Chunk ${chunkCount}:`, {
          hasResponse: !!json.response,
          responseLength: json.response?.length || 0,
          isDone: json.done,
          keys: Object.keys(json),
        });

        if (json.response) {
          result += json.response;
          totalResponseLength += json.response.length;
        }
      } catch (parseError) {
        // Skip malformed JSON chunks
        console.warn('Skipping malformed JSON chunk:', line);
      }
    }

    // Update the specific placeholder's text content instead of creating new paragraphs
    if (placeholder && placeholder.innerText !== undefined) {
      placeholder.innerText = 'Loading...';
      placeholder.classList.add('quiz-loading');
    }
  }

  // Log final stats
  console.log('Streaming complete:', {
    totalChunks: chunkCount,
    totalResponseLength: totalResponseLength,
    resultLength: result.length,
    rawTextLength: rawText.length,
  });

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
      const parent = placeholder.parentNode;
      const container = document.createElement('div');
      container.classList.add('quiz-error');

      const msg = document.createElement('div');
      msg.classList.add('quiz-error-title');
      msg.textContent = 'Received non-JSON output. Showing raw response below.';

      const pre = document.createElement('pre');
      pre.classList.add('quiz-error-content');
      const MAX_LEN = 10000;
      const toShow = result && result.length > 0 ? result : rawText;
      const isTruncated = toShow.length > MAX_LEN;
      pre.textContent = isTruncated ? toShow.slice(0, MAX_LEN) + '\n... [truncated]' : toShow;

      container.appendChild(msg);
      container.appendChild(pre);

      if (parent) {
        parent.insertBefore(container, placeholder);
        parent.removeChild(placeholder);
      } else {
        placeholder.innerText = msg.textContent + '\n\n' + (pre.textContent || '[no content]');
      }
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

  // Fix unescaped backslashes (common with LaTeX output)
  // Replace \ not followed by valid JSON escape chars with \\
  jsonStr = jsonStr.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

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
  const parentContainer = placeholder.parentNode;
  const uniqueId = Date.now();

  // Inline styles for guaranteed rendering
  const styles = {
    container: `
      margin: 1.5rem 0;
      padding: 1.5rem;
      background: var(--background-secondary);
      border-radius: 16px;
      border: 1px solid var(--background-modifier-border);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    `,
    question: `
      font-size: 1.15em;
      font-weight: 600;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    `,
    optionsContainer: `
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    `,
    option: `
      display: flex;
      flex-direction: row;
      align-items: center;
      padding: 1rem 1.25rem;
      background: var(--background-primary);
      border: 2px solid var(--background-modifier-border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.25s ease;
      user-select: none;
    `,
    optionHover: `
      border-color: var(--interactive-accent);
      transform: translateX(8px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `,
    optionSelected: `
      border-color: var(--interactive-accent);
      background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-primary));
      transform: translateX(8px);
      box-shadow: 0 4px 16px color-mix(in srgb, var(--interactive-accent) 30%, transparent);
    `,
    radioHidden: `
      display: none;
    `,
    radioIndicator: `
      width: 24px;
      height: 24px;
      min-width: 24px;
      border: 2px solid var(--text-muted);
      border-radius: 50%;
      margin-right: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      flex-shrink: 0;
      position: relative;
    `,
    radioIndicatorSelected: `
      border-color: var(--interactive-accent);
      background: color-mix(in srgb, var(--interactive-accent) 20%, transparent);
    `,
    radioIndicatorCorrect: `
      border-color: #22c55e;
      background: #22c55e;
    `,
    radioIndicatorIncorrect: `
      border-color: #ef4444;
      background: #ef4444;
    `,
    optionText: `
      flex: 1;
      line-height: 1.5;
    `,
    button: `
      padding: 0.875rem 2rem;
      font-size: 1em;
      font-weight: 600;
      color: var(--text-on-accent);
      background: var(--interactive-accent);
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s ease;
    `,
    buttonDisabled: `
      opacity: 0.5;
      cursor: default;
    `,
    result: `
      margin-top: 1.25rem;
      padding: 1.25rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1.05em;
      text-align: center;
    `,
    resultCorrect: `
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
      border: 2px solid #22c55e;
    `,
    resultIncorrect: `
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border: 2px solid #ef4444;
    `,
    resultWarning: `
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      border: 2px solid #f59e0b;
    `,
    optionCorrect: `
      border-color: #22c55e;
      background: rgba(34, 197, 94, 0.15);
      box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
    `,
    optionIncorrect: `
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.15);
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
    `,
    optionFaded: `
      opacity: 0.4;
      filter: grayscale(50%);
    `,
  };

  // Create main quiz container
  const quizContainer = document.createElement('div');
  quizContainer.style.cssText = styles.container;
  parentContainer.insertBefore(quizContainer, placeholder);

  // Create question element
  const questionEl = dv.el('div', quizData.question);
  questionEl.style.cssText = styles.question;
  quizContainer.appendChild(questionEl);

  // Create options container
  const optionsContainer = document.createElement('div');
  optionsContainer.style.cssText = styles.optionsContainer;
  quizContainer.appendChild(optionsContainer);

  // Store references
  const optionElements = [];
  const radioIndicators = [];
  const radioButtons = [];

  quizData.options.forEach((option, index) => {
    // Option container - FORCE HORIZONTAL LAYOUT
    const optionDiv = document.createElement('div');
    optionDiv.style.cssText = styles.option;
    optionsContainer.appendChild(optionDiv);
    optionElements.push(optionDiv);

    // Hidden radio button
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `quiz-option-${uniqueId}`;
    radio.value = String(index);
    radio.style.cssText = styles.radioHidden;
    optionDiv.appendChild(radio);
    radioButtons.push(radio);

    // Custom radio indicator
    const radioIndicator = document.createElement('div');
    radioIndicator.style.cssText = styles.radioIndicator;
    optionDiv.appendChild(radioIndicator);
    radioIndicators.push(radioIndicator);

    // Option text
    const optionText = document.createElement('span');
    optionText.style.cssText = styles.optionText;
    optionText.textContent = option;
    optionDiv.appendChild(optionText);

    // Hover effects
    optionDiv.addEventListener('mouseenter', () => {
      if (!optionsContainer.dataset.answered) {
        optionDiv.style.cssText = styles.option + styles.optionHover;
      }
    });
    optionDiv.addEventListener('mouseleave', () => {
      if (!optionsContainer.dataset.answered) {
        if (radio.checked) {
          optionDiv.style.cssText = styles.option + styles.optionSelected;
        } else {
          optionDiv.style.cssText = styles.option;
        }
      }
    });

    // Click handler
    optionDiv.addEventListener('click', () => {
      if (optionsContainer.dataset.answered) return;

      // Deselect all
      optionElements.forEach((el, i) => {
        el.style.cssText = styles.option;
        radioIndicators[i].style.cssText = styles.radioIndicator;
        radioButtons[i].checked = false;
      });
      // Select this one
      optionDiv.style.cssText = styles.option + styles.optionSelected;
      radioIndicator.style.cssText = styles.radioIndicator + styles.radioIndicatorSelected;
      radio.checked = true;
    });
  });

  // Check button
  const checkButton = document.createElement('button');
  checkButton.type = 'button';
  checkButton.textContent = 'Check Answer';
  checkButton.style.cssText = styles.button;
  quizContainer.appendChild(checkButton);

  // Result div
  const resultDiv = document.createElement('div');
  resultDiv.style.cssText = styles.result;
  resultDiv.style.display = 'none';
  quizContainer.appendChild(resultDiv);

  // Check button handler
  checkButton.addEventListener('click', event => {
    event.preventDefault();

    let selectedIndex = -1;
    for (let i = 0; i < radioButtons.length; i++) {
      if (radioButtons[i].checked) {
        selectedIndex = i;
        break;
      }
    }

    if (selectedIndex === -1) {
      resultDiv.textContent = 'Please select an answer!';
      resultDiv.style.cssText = styles.result + styles.resultWarning;
      resultDiv.style.display = 'block';
      return;
    }

    // Mark as answered
    optionsContainer.dataset.answered = 'true';
    checkButton.style.cssText = styles.button + styles.buttonDisabled;
    checkButton.disabled = true;

    // Fade non-selected options
    optionElements.forEach((el, i) => {
      if (i !== selectedIndex && i !== quizData.correctIndex) {
        el.style.cssText = styles.option + styles.optionFaded;
      }
    });

    if (selectedIndex === quizData.correctIndex) {
      // Correct!
      optionElements[selectedIndex].style.cssText = styles.option + styles.optionCorrect;
      radioIndicators[selectedIndex].style.cssText =
        styles.radioIndicator + styles.radioIndicatorCorrect;
      resultDiv.textContent = 'Correct!';
      resultDiv.style.cssText = styles.result + styles.resultCorrect;
    } else {
      // Incorrect
      optionElements[selectedIndex].style.cssText = styles.option + styles.optionIncorrect;
      radioIndicators[selectedIndex].style.cssText =
        styles.radioIndicator + styles.radioIndicatorIncorrect;
      optionElements[quizData.correctIndex].style.cssText = styles.option + styles.optionCorrect;
      radioIndicators[quizData.correctIndex].style.cssText =
        styles.radioIndicator + styles.radioIndicatorCorrect;
      resultDiv.textContent = `Incorrect. The correct answer was: ${quizData.options[quizData.correctIndex]}`;
      resultDiv.style.cssText = styles.result + styles.resultIncorrect;
    }
    resultDiv.style.display = 'block';
  });
}

function createPrompt(title, content) {
  const hasContent = content && content.trim().length > 50;

  return `You are a skilled educator creating a spaced repetition question on the topic "${title}".

${
  hasContent
    ? `The student's notes on this topic:
<notes>
${content}
</notes>`
    : `The student has a note titled "${title}" with minimal content. Use your knowledge of this subject.`
}

QUESTION DESIGN — pick ONE of these styles (whichever fits best):
1. **"Why" question**: Ask why something works the way it does, not just what it is.
2. **Contrast**: "What distinguishes X from Y?" where Y is a commonly confused concept.
3. **Application**: Present a concrete scenario and ask what happens or what approach applies.
4. **Implication**: "If X were changed/removed, what consequence would follow?"
5. **Connection**: Link this topic to a related concept from another area.

RULES:
- The question must be ANSWERABLE by someone who understands the topic — no trick questions.
- Distractors must be plausible (common misconceptions or adjacent truths) but clearly wrong.
- If the topic involves math or formal notation, use LaTeX where it helps clarity.
- Do NOT produce a question that is just a definition lookup ("What is X?"). Push deeper.
- The correct answer must be unambiguously correct. Verify before responding.
- Do NOT include any text outside the JSON object.

OUTPUT FORMAT (strict JSON, nothing else):
{"question":"...","options":["A","B","C","D"],"correct_index":0}

- 4 options exactly
- correct_index is 0-based
- No markdown, no explanation, no preamble — ONLY the JSON object.`;
}

function getNotes(daysOld) {
  const target = new Date();
  target.setDate(target.getDate() - daysOld);
  const lower = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const upper = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

  return dv.pages().where(p => {
    const name = p.file.name.toUpperCase();
    if (name.includes('DAYS AGO') || name.includes('DAY AGO')) return false; // Exclude files with "Days Old" in the name

    const mtime = new Date(p.file.mtime).getTime();
    return mtime >= lower && mtime <= upper;
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
    let placeholder = dv.paragraph('Waiting to send request...');
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
