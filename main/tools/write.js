const { safePath } = require('./safe-path');
const fs = require('fs');
const path = require('path');

function writeFile(args) {
  const { path: filePath, content } = args;
  const resolved = safePath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return `Written ${Buffer.byteLength(content, 'utf-8')} bytes to ${resolved}`;
}

module.exports = writeFile;
