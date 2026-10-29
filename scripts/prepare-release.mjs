import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const destination = join('dist', `achievement-styles-${version}`);
const source = join('dist', `achievement-styles-${version}-source`);
await mkdir(destination);
await mkdir(source);

for (const [from, name] of [
  ['dist/trophy-styles.star', 'trophy-styles.star'],
  ['README.md', 'README.md'],
  ['resources/NOTICE.md', 'NOTICE.md'],
]) await cp(from, join(destination, name));

const excluded = new Set([
  'packed', 'start-steam.ps1', 'extract-xbox-console.py',
]);
for (const directory of ['frontend', 'backend', 'resources', 'scripts', 'tests', 'preview']) {
  await cp(directory, join(source, directory), {
    recursive: true,
    filter: file => !excluded.has(file.split(/[\\/]/).at(-1)) && !/-assets\.ts$/.test(file),
  });
}
for (const file of ['package.json', 'package-lock.json', 'millennium.toml', 'tsconfig.json', 'README.md', '.gitignore']) {
  await cp(file, join(source, file));
}

for (const directory of [destination, source]) {
  const files = [];
  async function collect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.name !== 'SHA256SUMS.txt') files.push(file);
    }
  }
  await collect(directory);
  const hashes = await Promise.all(files.sort().map(async file => {
    const hash = createHash('sha256').update(await readFile(file)).digest('hex');
    return `${hash}  ${file.slice(directory.length + 1).replaceAll('\\', '/')}`;
  }));
  await writeFile(join(directory, 'SHA256SUMS.txt'), `${hashes.join('\n')}\n`);
}
console.log(`Prepared ${destination} and ${source}`);
