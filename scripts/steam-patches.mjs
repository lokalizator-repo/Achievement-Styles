import assert from 'node:assert/strict';

export function rustReplacement(template, groups) {
  let replacement = '';
  for (let index = 0; index < template.length; index++) {
    const char = template[index];
    if (char === '$') replacement += '$$';
    else if (char === '\\' && /[0-9]/.test(template[index + 1] || '')) replacement += '$' + template[++index];
    else replacement += char;
  }
  return replacement.replace(/\$\$|\$\{([^}]+)\}|\$([A-Za-z0-9_]+)/g, (token, braced, plain) => {
    if (token === '$$') return '$';
    const name = braced ?? plain;
    return /^\d+$/.test(name) ? groups[Number(name)] ?? '' : '';
  });
}

export function applySteamPatches(source, backend) {
  const patches = [...backend.matchAll(/find = \[\[([\s\S]*?)\]\],[\s\S]*?match = \[\[([\s\S]*?)\]\],[\s\S]*?replace = \[\[([\s\S]*?)\]\]/g)];
  assert.equal(patches.length, 10, 'Expected all ten Steam patches');
  const changes = [];
  let result = source;
  for (const [index, [, find, match, replace]] of patches.entries()) {
    const found = [...result.matchAll(new RegExp(find, 'g'))];
    assert.equal(found.length, 1, `Patch ${index + 1}: expected one source segment`);
    const before = found[0][0];
    const transform = new RegExp(match, 'g');
    assert.equal([...before.matchAll(transform)].length, 1, `Patch ${index + 1}: expected one transform`);
    const replacement = replace.replaceAll('#{{self}}', 'globalThis.__trophyStyles');
    const after = before.replace(transform, (...args) => rustReplacement(replacement, args));
    assert.notEqual(after, before);
    changes.push({ before, after });
    result = result.replace(before, () => after);
  }
  let restored = result;
  for (const { before, after } of changes.toReversed()) restored = restored.replace(after, () => before);
  assert.equal(restored, source, 'Reversing the patches must restore the original source exactly');
  return { source: result, changes };
}
