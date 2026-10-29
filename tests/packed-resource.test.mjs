import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const compiled = await build({
  stdin: { contents: "export * from './frontend/packed-resource';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'PackedResources',
});
const source = compiled.outputFiles[0].text;

function decodeLz4(bytes) {
  const output = Buffer.alloc(bytes.readUInt32LE(0));
  let input = 4, offset = 0;
  const length = initial => {
    let value = initial;
    if (initial === 15) {
      let next;
      do { assert.ok(input < bytes.length); next = bytes[input++]; value += next; } while (next === 255);
    }
    return value;
  };
  while (input < bytes.length) {
    const token = bytes[input++];
    const literals = length(token >> 4);
    assert.ok(input + literals <= bytes.length && offset + literals <= output.length);
    bytes.copy(output, offset, input, input + literals);
    input += literals; offset += literals;
    if (input === bytes.length) break;
    assert.ok(input + 2 <= bytes.length);
    const distance = bytes.readUInt16LE(input); input += 2;
    const match = length(token & 15) + 4;
    assert.ok(distance > 0 && distance <= offset && offset + match <= output.length);
    for (let i = 0; i < match; i++) { output[offset] = output[offset - distance]; offset++; }
  }
  assert.equal(offset, output.length);
  return output;
}

const star = await readFile('dist/trophy-styles.star');
const start = 4 + star.readUInt32LE(0);
assert.equal(star.toString('ascii', start, start + 4), 'STAR');
const sections = Array.from({ length: star[start + 6] }, (_, i) => start + 12 + i * 256);
const assets = sections.find(offset => star[offset] === 5);
assert.ok(assets !== undefined);
assert.equal(star[assets + 1], 0);
const blob = star.subarray(start + Number(star.readBigUInt64LE(assets + 8)));
const entries = [];
let offset = 4;
for (let i = 0; i < blob.readUInt32LE(0); i++) {
  const nameLength = blob.readUInt16LE(offset), dataLength = blob.readUInt32LE(offset + 2);
  offset += 6;
  const name = blob.toString('utf8', offset, offset + nameLength); offset += nameLength;
  entries.push({ name, bytes: decodeLz4(blob.subarray(offset, offset + dataLength)) });
  offset += dataLength;
}

test('the actual STAR contains only six packed sounds and restores every WAV byte for byte', async () => {
  assert.equal(entries.length, 6);
  let originalSize = 0;
  for (const { name, bytes } of entries) {
    assert.match(name, /^resources\/packed\/(?:xbox\/)?[a-z0-9-]+\.wav\.gz$/);
    const original = await readFile(name.replace('resources/packed/', 'resources/').slice(0, -3));
    assert.deepEqual(gunzipSync(bytes), original, name);
    assert.deepEqual(bytes, await readFile(name), name);
    originalSize += original.length;
  }
  assert.ok(entries.reduce((sum, item) => sum + item.bytes.length, 0) < originalSize * 0.75);
  assert.ok(star.length < 18_000_000, `Package grew to ${star.length} bytes`);
});

test('Chromium restores packed sounds, rejects corrupt gzip and accepts legacy audio', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: source });
    for (const { name, bytes } of entries) {
      const original = await readFile(name.replace('resources/packed/', 'resources/').slice(0, -3));
      const encoded = bytes.toString('base64');
      const restored = await page.evaluate(async ({ encoded, audio }) => {
        const api = window.PackedResources;
        const uri = api.packedResourcePrefix + encoded;
        if (audio) return (await api.unpackSoundUri(uri)).split(',')[1];
        const data = await api.unpackResource(uri);
        let binary = '';
        for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
        return btoa(binary);
      }, { encoded, audio: name.endsWith('.wav.gz') });
      assert.deepEqual(Buffer.from(restored, 'base64'), original, name);
    }
    const result = await page.evaluate(async () => {
      const api = window.PackedResources;
      let failed = false;
      try { await api.unpackSoundUri(api.packedResourcePrefix + 'aW52YWxpZA=='); } catch { failed = true; }
      return { failed, legacy: await api.unpackSoundUri('data:audio/wav;base64,YQ==') };
    });
    assert.deepEqual(result, { failed: true, legacy: 'data:audio/wav;base64,YQ==' });
  } finally { await browser.close(); }
});
