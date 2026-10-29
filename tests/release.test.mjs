import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

test('the release package excludes local source maps and development UI', async () => {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const compiler = resolve(`node_modules/@steambrew/starlight/binaries/starlight-${process.platform}-${process.arch}${suffix}`);
  const bundle = execFileSync(compiler, ['-i', 'dist/trophy-styles.star', '-q', 'frontend:bundle.js'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.doesNotMatch(bundle, /sourceMappingURL|file:\/\/|[A-Z]:[\\/]Users[\\/]/i);
  assert.doesNotMatch(bundle, /Experimental|Popup diagnostics|Checking the popup window|In-game compatibility still requires verification/);
  assert.doesNotMatch(bundle, /window\.previewAchievement|window\.configWrites/);
  assert.doesNotMatch(bundle, /getPs5Trophies|black-myth-wukong-ps5|baldurs-gate-3-ps5|cyberpunk-2077-ps5|ghost-of-tsushima-ps5|marvels-spider-man-remastered-ps5|marvels-spider-man-2-ps5/);
  const metadata = execFileSync(compiler, ['verify', 'dist/trophy-styles.star'], { encoding: 'utf8' });
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  assert.ok(metadata.includes(`version:          ${version}`));
});
