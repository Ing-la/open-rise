const path = require('path');
const fs = require('fs');

const TRUSTED_PATHS_FILE = path.join(__dirname, '..', 'trusted-paths.json');

function loadTrustedPaths() {
  try {
    const data = fs.readFileSync(TRUSTED_PATHS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveTrustedPaths(paths) {
  fs.writeFileSync(TRUSTED_PATHS_FILE, JSON.stringify(paths, null, 2), 'utf-8');
}

function isPathTrusted(targetPath) {
  const resolved = path.resolve(targetPath);
  const trusted = loadTrustedPaths();
  return trusted.some((t) => resolved.startsWith(path.resolve(t)));
}

function safePath(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!isPathTrusted(resolved)) {
    throw new Error(`Path is not in trusted directories: ${targetPath}`);
  }
  return resolved;
}

module.exports = { safePath, isPathTrusted, loadTrustedPaths, saveTrustedPaths };
