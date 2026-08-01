export const JARVIS_INSTRUCTIONS = `You are Jarvis, a personal AI operator for Trey. You speak with a calm, concise British tone — like a smart chief of staff, not a chatbot.

You have FULL ACCESS to help Trey. Act autonomously — do not ask permission for normal tasks. Just do the work.

Capabilities:
- Files: read, write, move, copy, delete, list, search anywhere on the machine (use ~ for home folder)
- Browser: open_url for any link, google_search to search Google in the default browser
- Web: web_search for EXA results (falls back to Google)
- Appearance: set_appearance to change colors, accent, face color, title
- Windows: window_control to move/resize companion or artifact windows, toggle always-on-top
- Computer: open apps, click, type, scroll, hotkeys, read screen — execute immediately
- Notes, database, images, mermaid diagrams, artifacts panel

Behavior:
- Keep replies SHORT — one or two sentences for voice. Explain briefly while running tools.
- Ask one clarifying question only when the task is genuinely ambiguous.
- User can interrupt anytime — adapt immediately.
- Only use request_confirmation for: sending messages to others, purchases, changing account passwords, or sharing private data externally.
- When output is visual or structured, use show_artifact or the relevant tool so it appears in the artifact panel.
- For "search google" or "look this up", use google_search or web_search.
- For "change your colors" or "make yourself blue", use set_appearance.
- For file tasks, use file_* tools with full paths or ~ paths.

Personality: useful, calm, slightly dry wit. Never sycophantic.`;

const RAW_TOOLS = [
  { name: 'web_search', description: 'Search the web via EXA for current information.', parameters: { type: 'object', properties: { query: { type: 'string' }, num_results: { type: 'number' } }, required: ['query'] } },
  { name: 'generate_image', description: 'Generate an image with DALL-E and show it in the artifact panel.', parameters: { type: 'object', properties: { prompt: { type: 'string' }, size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'] } }, required: ['prompt'] } },
  { name: 'show_mermaid', description: 'Render a mermaid diagram in the artifact panel.', parameters: { type: 'object', properties: { title: { type: 'string' }, code: { type: 'string' } }, required: ['code'] } },
  { name: 'show_artifact', description: 'Display structured content in the artifact panel.', parameters: { type: 'object', properties: { type: { type: 'string', enum: ['code', 'table', 'note', 'menu', 'task_progress', 'text', 'markdown'] }, title: { type: 'string' }, content: { type: 'string' }, language: { type: 'string' } }, required: ['type', 'title', 'content'] } },
  { name: 'note_create', description: 'Create a note in the fun notes list.', parameters: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, emoji: { type: 'string' } }, required: ['title', 'body'] } },
  { name: 'note_search', description: 'Search notes by keyword.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'note_edit', description: 'Edit an existing note by id.', parameters: { type: 'object', properties: { id: { type: 'number' }, title: { type: 'string' }, body: { type: 'string' }, emoji: { type: 'string' } }, required: ['id'] } },
  { name: 'note_delete', description: 'Delete a note by id.', parameters: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] } },
  { name: 'db_query', description: 'Run a read-only SQL SELECT on the local Jarvis database.', parameters: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
  { name: 'db_execute', description: 'Insert, update, or delete database records.', parameters: { type: 'object', properties: { sql: { type: 'string' }, description: { type: 'string' } }, required: ['sql', 'description'] } },
  { name: 'request_confirmation', description: 'Ask the user to confirm a risky action before proceeding.', parameters: { type: 'object', properties: { action_id: { type: 'string' }, message: { type: 'string' }, action_type: { type: 'string', enum: ['send_message', 'delete_data', 'purchase', 'account_change', 'share_private', 'computer_control', 'other'] } }, required: ['action_id', 'message', 'action_type'] } },
  { name: 'open_app', description: 'Open an application on the computer.', parameters: { type: 'object', properties: { app_name: { type: 'string' } }, required: ['app_name'] } },
  { name: 'computer_action', description: 'Perform computer control: click, type, scroll, hotkey, or screenshot.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['click', 'type', 'scroll', 'hotkey', 'screenshot'] }, x: { type: 'number' }, y: { type: 'number' }, text: { type: 'string' }, direction: { type: 'string', enum: ['up', 'down'] }, keys: { type: 'string' } }, required: ['action'] } },
  { name: 'read_screen', description: 'Capture a screenshot and describe the screen.', parameters: { type: 'object', properties: { region: { type: 'string', enum: ['full', 'active_window'] } } } },
  { name: 'open_url', description: 'Open any URL in the default browser.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'google_search', description: 'Search Google in the default browser.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'file_read', description: 'Read a file from disk. Use ~ for home directory.', parameters: { type: 'object', properties: { path: { type: 'string' }, max_chars: { type: 'number' } }, required: ['path'] } },
  { name: 'file_write', description: 'Write or append to a file.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, append: { type: 'boolean' } }, required: ['path', 'content'] } },
  { name: 'file_move', description: 'Move or rename a file or folder.', parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  { name: 'file_copy', description: 'Copy a file.', parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  { name: 'file_delete', description: 'Delete a file permanently.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'file_list', description: 'List files in a directory.', parameters: { type: 'object', properties: { path: { type: 'string' }, recursive: { type: 'boolean' }, max_entries: { type: 'number' } } } },
  { name: 'file_search', description: 'Search for files by name in a directory tree.', parameters: { type: 'object', properties: { path: { type: 'string' }, query: { type: 'string' }, max_results: { type: 'number' } }, required: ['query'] } },
  { name: 'set_appearance', description: 'Change Jarvis UI appearance.', parameters: { type: 'object', properties: { accentColor: { type: 'string' }, backgroundColor: { type: 'string' }, textColor: { type: 'string' }, faceColor: { type: 'string' }, title: { type: 'string' } } } },
  { name: 'window_control', description: 'Move or resize Jarvis windows.', parameters: { type: 'object', properties: { target: { type: 'string', enum: ['companion', 'artifact', 'both'] }, action: { type: 'string', enum: ['move', 'resize', 'always_on_top', 'focus', 'show', 'hide'] }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, alwaysOnTop: { type: 'boolean' } }, required: ['target', 'action'] } },
];

/** OpenAI Realtime format (kept for reference) */
export const TOOL_DEFINITIONS = RAW_TOOLS.map((t) => ({
  type: 'function',
  name: t.name,
  description: t.description,
  parameters: t.parameters,
}));

/** Ollama chat API tool format */
export const OLLAMA_TOOLS = RAW_TOOLS.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

/** Voice action tools — browser, apps, appearance only (not full agent) */
const VOICE_ACTION_NAMES = new Set([
  'open_app', 'open_url', 'google_search', 'web_search', 'set_appearance', 'window_control',
]);

export const VOICE_ACTION_TOOLS = OLLAMA_TOOLS.filter((t) => VOICE_ACTION_NAMES.has(t.function.name));
