const { safePath } = require('./safe-path');
const fs = require('fs');

function editFile(args) {
  const { path: filePath, old_text, new_text } = args;
  const resolved = safePath(filePath);
  const content = fs.readFileSync(resolved, 'utf-8');

  if (!content.includes(old_text)) {
    // Try to be helpful: show a snippet around where the match was attempted
    const preview = content.slice(0, 500);
    throw new Error(
      `old_text not found in ${resolved}.\n` +
      `First 500 chars of file:\n${preview}`
    );
  }

  // Replace only the first occurrence for safety
  const updated = content.replace(old_text, new_text);
  fs.writeFileSync(resolved, updated, 'utf-8');
  return `Replaced "${old_text}" → "${new_text}" in ${resolved}`;
}

module.exports = editFile;
