import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

function msgpackSize(value) {
  if (typeof value === 'string') {
    const bytes = Buffer.byteLength(value);
    return bytes + (bytes < 32 ? 1 : bytes < 256 ? 2 : 3);
  }
  if (Array.isArray(value)) {
    return (value.length < 16 ? 1 : 3) + value.reduce((size, item) => size + msgpackSize(item), 0);
  }
  const entries = Object.entries(value);
  return (entries.length < 16 ? 1 : 3) + entries.reduce((size, [key, item]) => size + msgpackSize(key) + msgpackSize(item), 0);
}

test('the complete patch registry fits the Windows startup pipe with spare capacity', async () => {
  const backend = await readFile('backend/main.lua', 'utf8');
  const patches = [...backend.matchAll(/file = \[\[([\s\S]*?)\]\],[\s\S]*?find = \[\[([\s\S]*?)\]\],[\s\S]*?match = \[\[([\s\S]*?)\]\],[\s\S]*?replace = \[\[([\s\S]*?)\]\]/g)]
    .map(([, file, find, match, replace]) => ({ plugin: 'local.trophy-styles', file, find, transforms: [{ match, replace }] }));
  assert.equal(patches.length, 10);
  const frameBytes = 4 + msgpackSize({ type: 'patch_list', patches });
  // Millennium writes this frame synchronously before the child can drain the 4096-byte pipe.
  assert.ok(frameBytes <= 3968, `Patch registry uses ${frameBytes} bytes; keep 128 bytes available in the startup pipe`);
});
