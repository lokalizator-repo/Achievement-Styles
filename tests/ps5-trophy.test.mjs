import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['frontend/ps5-catalog.ts'], bundle: true, write: false, format: 'esm' });
const { applyPs5Trophy } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('a public trophy match preserves Steam identity, localized text and unlock state', () => {
  const steam = { strID: 'FIRST', strName: 'Первый шаг', description: 'Начать путешествие.', strImage: 'steam-image', bAchieved: false };
  const trophy = { strID: 'ps5:1', strName: 'First step', strImage: 'psn-image', grade: 'bronze', psnPercent: 0 };
  assert.deepEqual(applyPs5Trophy(steam, trophy), {
    ...steam, strImage: trophy.strImage, grade: 'bronze', ps5TrophyId: 'ps5:1', psnPercent: 0,
  });
  assert.equal(steam.strImage, 'steam-image');
  assert.equal(steam.bAchieved, false);
});
