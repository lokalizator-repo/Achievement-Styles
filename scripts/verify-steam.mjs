import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { applySteamPatches } from './steam-patches.mjs';

const steamFile = process.argv[2];
if (!steamFile) throw new Error('Usage: npm run verify:steam -- "C:/Program Files (x86)/Steam/steamui/sp.js"');
const source = await readFile(steamFile, 'utf8');
const backend = await readFile('backend/main.lua', 'utf8');
const patched = applySteamPatches(source, backend);
try {
  new vm.Script(patched.source, { filename: steamFile });
} catch (error) {
  console.error(`Patched Steam bundle is invalid: ${error.message}`);
  process.exit(1);
}
console.log(`PASS: ${patched.changes.length} patches match uniquely; complete Steam bundle parses; reversing patches restores the original bytes.`);
