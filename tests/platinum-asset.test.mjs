import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('extracted platinum animation plays once and retains the source frame timing', async () => {
  const bytes = await readFile('resources/ps5-platinum-animation.webp');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  let loop;
  let frames = 0;
  let duration = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    if (tag === 'ANIM') loop = bytes.readUInt16LE(offset + 12);
    if (tag === 'ANMF') {
      frames++;
      duration += bytes.readUIntLE(offset + 20, 3);
    }
    offset += 8 + length + length % 2;
  }
  assert.equal(loop, 1);
  assert.ok(frames >= 150);
  assert.equal(duration, 4767);
});
