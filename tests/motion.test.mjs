import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['frontend/motion.ts'], bundle: true, write: false, format: 'esm' });
const motion = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

function notification(key) {
  return { data: { className: 'trophy-styles-test-toast', contentClassName: key } };
}

test('completion platinum starts its animation when the native Steam toast enters', () => {
  const element = { dataset: {} };
  const phases = [];
  const stop = motion.registerPopupMotion('completion-1', element, phase => phases.push(phase));
  const toast = { data: { className: 'trophy-styles-completion-toast completion-1 trophy-styles-grade-platinum', contentClassName: 'completion-1' } };
  motion.syncPopupMotion(toast, 1);
  motion.syncPopupMotion(toast, 2);
  assert.equal(element.dataset.trophyPhase, 'enter');
  assert.deepEqual(phases, ['enter']);
  motion.syncPopupMotion(toast, 3);
  assert.equal(element.dataset.trophyPhase, 'exit');
  stop();
});

test('a popup mounted before showing waits for Steam and animates only once', () => {
  let writes = 0;
  const phases = [];
  const element = { dataset: new Proxy({}, { set(target, key, value) { writes++; target[key] = value; return true; } }) };
  const cleanup = motion.registerPopupMotion('early', element, phase => phases.push(phase));
  assert.equal(element.dataset.trophyPhase, undefined);
  motion.syncPopupMotion(notification('early'), 1);
  assert.equal(element.dataset.trophyPhase, 'enter');
  for (let frame = 0; frame < 120; frame++) motion.syncPopupMotion(notification('early'), 2);
  assert.equal(writes, 1);
  motion.syncPopupMotion(notification('early'), 3);
  assert.equal(element.dataset.trophyPhase, 'exit');
  assert.equal(writes, 2);
  assert.deepEqual(phases, ['enter', 'exit']);
  cleanup();
});

test('late rendering and overlapping test popups retain independent lifetimes', () => {
  motion.syncPopupMotion(notification('late'), 1);
  const first = { dataset: {} };
  const second = { dataset: {} };
  const stopFirst = motion.registerPopupMotion('late', first);
  const stopSecond = motion.registerPopupMotion('next', second);
  assert.equal(first.dataset.trophyPhase, 'enter');
  motion.syncPopupMotion(notification('next'), 1);
  motion.syncPopupMotion(notification('late'), 3);
  assert.equal(first.dataset.trophyPhase, 'exit');
  assert.equal(second.dataset.trophyPhase, 'enter');
  stopFirst();
  stopSecond();
  const fresh = { dataset: {} };
  const stopFresh = motion.registerPopupMotion('late', fresh);
  assert.equal(fresh.dataset.trophyPhase, undefined);
  stopFresh();
});
