import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rustReplacement } from '../scripts/steam-patches.mjs';

test('Rust replacement greedily consumes identifier characters after numeric captures', () => {
  assert.equal(rustReplacement('\\1const', ['all', 'body;']), '');
  assert.equal(rustReplacement('\\1 const', ['all', 'body;']), 'body; const');
  assert.equal(rustReplacement('\\1\\2(', ['all', 'x', 'y']), 'xy(');
});

test('Millennium escapes literal dollars before Rust expands captures', () => {
  assert.equal(rustReplacement('price: $5; \\1', ['all', 'value']), 'price: $5; value');
});
