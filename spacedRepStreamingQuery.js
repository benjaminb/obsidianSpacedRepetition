// DataviewJS Block

const daysAgo = 1;
dv.header(2, `${daysAgo} days ago:`);

async function sendToAPI(prompt, placeholder) {
  const url = 'http://localhost:11434/api/generate';
  const payload = {
    model: 'llama3.2:1b',
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
  let currentParagraph = placeholder;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const json = JSON.parse(chunk);
    result += json.response;

    // Remove the old paragraph
    if (currentParagraph && currentParagraph.parentNode) {
      currentParagraph.parentNode.removeChild(currentParagraph);
    }

    // Create a new paragraph with the accumulated result
    currentParagraph = dv.paragraph(result);
  }
}

function createPrompt(title, content) {
  return `You will ask me a question on the topic of ${title}. Refer to the following notes if they help:\n\n<notes>${content}</notes>\n\nYour question:\n`;
}

function getNotes(daysOld) {
  const today = new Date();
  const targetDay = new Date(today);
  targetDay.setDate(today.getDate() - daysOld);

  // Set the time to the start of the day for both dates
  targetDay.setHours(0, 0, 0, 0);
  const targetCutoff = new Date(targetDay);
  targetCutoff.setDate(targetDay.getDate() - 1);

  // Query for notes modified exactly 4 days ago
  return dv.pages().where(p => p.file.mtime >= targetCutoff && p.file.mtime < targetDay);
}

const notes = getNotes(daysAgo);

if (!notes || notes.length === 0) {
  dv.paragraph('No notes');
}

async function processNotes() {
  for (let note of notes) {
    const filePath = note.file.path;

    // Read the content of the note
    const fileContent = await dv.io.load(filePath);
    const noteText = fileContent.replace(/^---\n.*?\n---\n/s, '').trim();

    // Display placeholder text
    dv.header(4, note.file.name);
    let placeholder = dv.paragraph('Loading response...');

    // Send the content to the API and stream the response
    const prompt = createPrompt(note.file.name, noteText);
    await sendToAPI(prompt, placeholder);

    dv.el('hr', '');
    dv.el('hr', '');
    dv.el('hr', '');
  }
}

processNotes();
