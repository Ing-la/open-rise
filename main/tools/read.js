const { safePath } = require('./safe-path');
const fs = require('fs');

function readFile(args) {
  const { path: filePath, limit } = args;
  const resolved = safePath(filePath);
  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = content.split('\n');

  if (limit && limit < lines.length) {
    return lines.slice(0, limit).join('\n') + `\n... (truncated, ${lines.length - limit} more lines)`;
  }

  return content;
}

module.exports = readFile;
