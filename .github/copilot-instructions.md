# Obsidian Spaced Repetition AI Instructions

## Project Overview

This is an **Obsidian DataviewJS plugin script** that automatically generates spaced repetition quiz questions from vault notes using a local Ollama LLM. The script runs inside Obsidian markdown files as DataviewJS blocks.

## Architecture

**Core file:** [spacedRepStreamingQuery.js](../spacedRepStreamingQuery.js)

- Executes as a DataviewJS block (not standalone Node.js)
- Queries notes by modification time using Dataview API
- Streams responses from local Ollama API endpoint
- Renders interactive quiz UI directly into the Obsidian DOM

**Data Flow:**

1. `getNotes()` filters vault notes by last activity (ctime/mtime)
2. For each note, creates a prompt with its content
3. Streams to `http://localhost:11434/api/generate` (Ollama API)
4. Parses streamed JSON chunks for quiz data
5. Renders quiz UI with radio buttons and validation

## Critical Context

### Obsidian Environment

- Code runs in Obsidian's sandboxed JavaScript context, not Node.js
- Access Obsidian APIs via `dv` (DataviewJS) global object
- DOM manipulation creates quiz UI elements inside the note preview
- File I/O uses `dv.io.load()` instead of `fs` module

### LLM Integration

- Uses **local Ollama server** on port 11434 (not cloud APIs)
- Model selection via note tags: first tag becomes model name (e.g., `#gpt-oss-20b`)
- Streaming enabled to show progressive responses
- Temperature set to 0.01 for consistent quiz generation

### Quiz Generation Pattern

- Prompt template in `createPrompt()` emphasizes testing specific note content
- Response must be valid JSON: `{question, options, correct_index}`
- Robust JSON extraction handles wrapped/malformed LLM output
- Sequential processing prevents DOM conflicts when rendering multiple quizzes

## Key Conventions

### DOM Manipulation

- Always use Dataview element creators: `dv.el()`, `dv.paragraph()`, `dv.header()`
- Store placeholder references before async operations
- Insert quiz elements before placeholder, then remove placeholder
- Use unique IDs (timestamp-based) to avoid radio button conflicts across multiple quizzes

### Error Handling

- Skip malformed JSON chunks during streaming (don't fail entire response)
- Extract JSON from response text using first `{` to last `}` boundaries
- Validate JSON structure before rendering: check `question`, `options`, `correct_index` exist

### State Management

- Radio button selection managed via explicit array of references (not DOM queries)
- Event listeners on both radio and label for better UX
- Result div shows feedback after user submits answer

## Running the Code

1. Ensure Ollama is running: `ollama serve` (or already running as service)
2. In Obsidian, create a DataviewJS block:
   ````
   ```dataviewjs
   // Paste spacedRepStreamingQuery.js content here
   ```
   ````
3. Set `daysAgo` variable to filter notes by age
4. Tag notes with desired model (e.g., `#llama2`, `#mistral`)

## Common Modifications

**Change time filter:** Adjust `daysAgo` constant (line 4) or date calculation in `getNotes()`

**Customize prompt:** Edit template in `createPrompt()` to change question style/difficulty

**Switch models:** Add/remove model tag from notes, or change `DEFAULT_MODEL` constant

**API endpoint:** Update `url` in `sendToAPI()` for different Ollama host/port

## Dependencies

- **Obsidian** with Dataview plugin enabled
- **Ollama** running locally with at least one model pulled
- No npm packages or build process required (runs directly in Obsidian)
