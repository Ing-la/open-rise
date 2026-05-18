const readFile = require('./read');
const writeFile = require('./write');
const editFile = require('./edit');
const webFetch = require('./web_fetch');
const webSearch = require('./web_search');

const TOOL_HANDLERS = {
  read_file: readFile,
  write_file: writeFile,
  edit_file: editFile,
  web_fetch: webFetch,
  web_search: webSearch,
};

// OpenAI-compatible tool definitions for the LLM
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Use this when you need to examine source code, config files, or any text file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path to the file' },
          limit: { type: 'number', description: 'Optional max lines to read (default: all lines)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file (overwrites existing content). Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to write' },
          content: { type: 'string', description: 'Full content to write to the file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace the first occurrence of old_text with new_text in a file. Use this for surgical edits instead of rewriting the whole file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to edit' },
          old_text: { type: 'string', description: 'The exact text to find (must match exactly)' },
          new_text: { type: 'string', description: 'The replacement text' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and extract readable content from a URL. Uses Mozilla Readability to extract article body, then converts to Markdown. Best for news articles, blog posts, documentation, and other text-based web pages. Cannot handle pages that require JavaScript to render content.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to fetch (must include http:// or https://)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the internet for real-time information. Returns a summary plus a list of results with title, snippet, and URL. Use this when you need current information, news, or anything beyond your training data. Requires TAVILY_API_KEY to be set in .env.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query (natural language)' },
          count: { type: 'number', description: 'Number of results to return (1-10, default: 5)' },
        },
        required: ['query'],
      },
    },
  },
];

const MAX_TOOL_RESULT_CHARS = 10000;

async function executeTool(name, args) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}. Available tools: ${Object.keys(TOOL_HANDLERS).join(', ')}`);
  }
  let result = await handler(args);
  if (typeof result !== 'string') {
    result = JSON.stringify(result);
  }
  if (result.length > MAX_TOOL_RESULT_CHARS) {
    result = result.slice(0, MAX_TOOL_RESULT_CHARS) + `\n...(truncated, ${result.length - MAX_TOOL_RESULT_CHARS} more chars)`;
  }
  return result;
}

module.exports = { executeTool, TOOL_DEFINITIONS };
