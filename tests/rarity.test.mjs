import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['frontend/rarity.ts'], bundle: true, write: false, format: 'esm' });
const { earnedPercent, achievementRarity } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('earned percentages preserve zero and reject missing, nonnumeric and out-of-range values', () => {
  for (const value of [0, 0.01, 12.5, 100]) assert.equal(earnedPercent(value), value);
  for (const value of [undefined, null, '', '12.5', false, NaN, Infinity, -0.1, 100.1]) assert.equal(earnedPercent(value), undefined);
});

test('PSN prefers its own statistics, falls back to Steam and reports the actual source', () => {
  const achievement = { strName: 'A trophy', bAchieved: true, steamPercent: 12.3, psnPercent: 8.1 };
  assert.deepEqual(achievementRarity(achievement, 'steam'), { source: 'steam', percent: 12.3 });
  assert.deepEqual(achievementRarity(achievement, 'psn'), { source: 'psn', percent: 8.1 });
  for (const psnPercent of [undefined, NaN, -1, 101]) {
    assert.deepEqual(achievementRarity({ ...achievement, psnPercent }, 'psn'), { source: 'steam', percent: 12.3 });
  }
  assert.equal(achievementRarity({ ...achievement, steamPercent: undefined }, 'steam'), undefined);
  assert.deepEqual(achievementRarity({ ...achievement, psnPercent: 0 }, 'psn'), { source: 'psn', percent: 0 });
  assert.equal(achievementRarity({ ...achievement, psnPercent: undefined, steamPercent: undefined }, 'psn'), undefined);
  assert.equal(achievementRarity(achievement, 'off'), undefined);
});
