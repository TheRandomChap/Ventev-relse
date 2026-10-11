const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const outputRoot = path.join(os.tmpdir(), 'LaegeKald-forge-output');
const newestBuild = fs.readdirSync(outputRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: entry.name,
    modified: fs.statSync(path.join(outputRoot, entry.name)).mtimeMs,
  }))
  .sort((first, second) => second.modified - first.modified)[0];
const installer = newestBuild && path.join(
  outputRoot,
  newestBuild.name,
  'make',
  'squirrel.windows',
  'x64',
  'LaegeKald-Setup.exe',
);
const destinationFolder = path.join(__dirname, 'dist');
const destination = path.join(destinationFolder, 'LaegeKald-Setup.exe');

if (!installer || !fs.existsSync(installer)) {
  console.error(`Installeren blev ikke fundet: ${installer}`);
  process.exit(1);
}

fs.mkdirSync(destinationFolder, { recursive: true });
fs.copyFileSync(installer, destination);
console.log(`Windows-installeren er kopieret til: ${destination}`);
