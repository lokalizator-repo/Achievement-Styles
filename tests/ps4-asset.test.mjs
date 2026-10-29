import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const generated = await readFile('frontend/ps4-assets.ts', 'utf8');
const { ps4BadgeImage, ps4TrophyImages } = await import(`data:text/javascript;base64,${Buffer.from(generated).toString('base64')}`);

test('PS4 uses unchanged source trophy PNGs and a self-contained vector badge', async () => {
  const provenance = JSON.parse(await readFile('resources/ps4-trophy-sources.json', 'utf8'));
  assert.deepEqual(Object.keys(ps4TrophyImages), ['bronze', 'silver', 'gold', 'platinum']);
  for (const item of provenance) {
    assert.ok(ps4TrophyImages[item.grade].startsWith('data:image/png;base64,'));
    const bytes = Buffer.from(ps4TrophyImages[item.grade].split(',')[1], 'base64');
    assert.deepEqual(bytes, await readFile(item.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
    assert.equal(bytes.readUInt32BE(16), 240);
    assert.equal(bytes.readUInt32BE(20), 240);
    assert.match(item.url, /^https:\/\/static\.wikia\.nocookie\.net\/playstation\/images\//);
  }
  const badge = Buffer.from(ps4BadgeImage.split(',')[1], 'base64').toString('utf8');
  assert.equal(badge, await readFile('resources/ps4-badge.svg', 'utf8'));
  assert.match(badge, /viewBox="0 0 84 88"/);
  assert.doesNotMatch(badge, /<image\b|<script\b|<foreignObject\b|(?:href|src)=/);
  const renderer = await readFile('frontend/ps4-card.tsx', 'utf8');
  assert.doesNotMatch(renderer, /ps4BadgeAnimation|ps4BadgePoster|ps4BronzeImage|createObjectURL|revokeObjectURL/);
});
