import { steamBundle } from './steam-bundle.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { applySteamPatches } from '../scripts/steam-patches.mjs';

const compiled = await build({
  stdin: { contents: "export * from './frontend/sound'; export * from './frontend/xbox-sound'; export { setLiveMatching } from './frontend/live-trophies'; export { updatePresentation } from './frontend/presentation'; export { rememberPopupStyle } from './frontend/popup-layout'; export { setStyleEnabled } from './frontend/desktop-layout';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm',
});
const sound = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
sound.setLiveMatching(false);
const uri = 'data:audio/wav;base64,UklGRg==';
const instances = [];
let rejectPlayback = false;
const boosts = [];
globalThis.AudioContext = class {
  state = 'suspended';
  destination = {};
  createMediaElementSource(audio) { return { connect(gain) { boosts.push({ audio, gain }); } }; }
  createGain() { return { gain: { value: 1 }, connect() {} }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
};
globalThis.Audio = class {
  constructor(src) { this.src = src; instances.push(this); }
  addEventListener() {}
  play() { this.playCalls = (this.playCalls ?? 0) + 1; return rejectPlayback ? Promise.reject(new Error('Playback blocked')) : Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() {}
  load() { this.loadCalls = (this.loadCalls ?? 0) + 1; }
};

test('custom audio replaces earned and test sounds once, with native fallback on failure', async () => {
  const notification = { data: { achieved: () => true } };
  let nativeCalls = 0;
  sound.setStyleEnabled(true);
  assert.equal(sound.playNotificationSound(notification, () => nativeCalls++), false);
  sound.configureSound(uri);
  assert.equal(instances.length, 2);
  assert.ok(instances.every(audio => audio.preload === 'auto' && audio.loadCalls === 1 && !audio.playCalls));
  assert.equal(sound.playNotificationSound({ data: {} }, () => nativeCalls++), false);
  assert.equal(sound.playNotificationSound({ data: { achieved: () => false } }, () => nativeCalls++), false);
  assert.equal(sound.playNotificationSound(notification, () => nativeCalls++), true);
  assert.equal(sound.playNotificationSound(notification, () => nativeCalls++), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(instances.length, 2);
  assert.equal(instances[0].src, uri);
  assert.equal(instances[0].playCalls, 1);
  assert.equal(instances[0].currentTime, 0);
  assert.equal(nativeCalls, 0);
  sound.setStyleEnabled(false);
  assert.equal(sound.playNotificationSound({ data: { achieved: () => true } }, () => nativeCalls++), false);
  rejectPlayback = true;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(sound.playNotificationSound({ data: { className: 'trophy-styles-test-toast' } }, () => nativeCalls++), true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nativeCalls, 1);
    await assert.rejects(sound.testSound(), /Playback blocked/);
  } finally {
    console.warn = originalWarn;
    rejectPlayback = false;
    sound.stopSounds();
  }
  assert.equal(instances[0].paused, true);
  await assert.rejects(sound.testSound(), /not ready/);
});

test('volume applies to prepared, playing and newly created standard and platinum audio', async () => {
  const start = instances.length;
  sound.configureSound(uri);
  sound.configureSound(uri, 'platinum');
  try {
    assert.ok(instances.slice(start).every(audio => audio.volume === 1));
    sound.setSoundVolume(35);
    await sound.testSound();
    await sound.testSound('platinum');
    assert.ok(instances.slice(start).every(audio => audio.volume === 0.35));
    sound.setSoundVolume(20);
    await sound.testSound();
    await sound.testSound();
    assert.ok(instances.slice(start).every(audio => audio.volume === 0.2));
    sound.setSoundVolume(NaN);
    sound.setSoundVolume('50');
    assert.ok(instances.slice(start).every(audio => audio.volume === 0.2));
    sound.setSoundVolume(200);
    assert.ok(instances.slice(start).every(audio => audio.volume === 1));
    assert.ok(boosts.filter(item => instances.slice(start).includes(item.audio)).every(item => item.gain.gain.value === 2));
    await sound.testSound();
    assert.equal(instances.at(-1).volume, 1);
    assert.equal(boosts.at(-1).gain.gain.value, 2);
    sound.setSoundVolume(35);
    assert.ok(boosts.filter(item => instances.slice(start).includes(item.audio)).every(item => item.gain.gain.value === 0.35));
  } finally { sound.stopSounds(); }
});

test('zero volume suppresses tests and earned sounds without native fallback', async () => {
  sound.setStyleEnabled(true);
  sound.setSoundVolume(0);
  let nativeCalls = 0;
  const before = instances.length;
  try {
    assert.equal(sound.playNotificationSound({ data: { achieved: () => true } }, () => nativeCalls++), true);
    assert.equal(sound.playNotificationSound({ data: {} }, () => nativeCalls++), false);
    await sound.testSound();
    await sound.testSound('platinum');
    assert.equal(instances.length, before);
    assert.equal(nativeCalls, 0);
  } finally { sound.stopSounds(); sound.setStyleEnabled(false); }
});

test('platinum sound requires a matched trophy or an explicit platinum test', async () => {
  const start = instances.length;
  const platinumUri = 'data:audio/wav;base64,UExBVElOVU0=';
  sound.configureSound(uri);
  sound.configureSound(platinumUri, 'platinum');
  sound.setStyleEnabled(true);
  let fallbackCalls = 0;
  try {
    assert.equal(sound.playNotificationSound({ data: { achieved: () => true } }, () => fallbackCalls++), true);
    assert.equal(instances[start].playCalls, 1);
    assert.equal(instances[start].src, uri);
    assert.equal(sound.playNotificationSound({ data: { className: 'trophy-styles-test-toast sample trophy-styles-grade-bronze' } }, () => fallbackCalls++), true);
    assert.equal(instances[start + 1].playCalls, 1);
    assert.equal(sound.playNotificationSound({ data: { className: 'trophy-styles-test-toast sample2 trophy-styles-grade-platinum' } }, () => fallbackCalls++), true);
    assert.equal(instances[start + 2].playCalls, 1);
    assert.equal(sound.playNotificationSound({ data: { className: 'trophy-styles-completion-toast earned trophy-styles-grade-platinum' } }, () => fallbackCalls++), true);
    assert.equal(instances.at(-1).src, platinumUri);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fallbackCalls, 0);
  } finally {
    sound.stopSounds();
    sound.setStyleEnabled(false);
  }
});

for (const filename of ['ps5-trophy.wav', 'ps5-platinum.wav', 'ps4-trophy.wav']) test(`${filename} has audible content within the first 30 milliseconds`, async () => {
  const bytes = await readFile(`resources/${filename}`);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let format;
  let data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(offset + 4);
    const id = bytes.toString('ascii', offset, offset + 4);
    if (id === 'fmt ') format = { rate: bytes.readUInt32LE(offset + 12), frame: bytes.readUInt16LE(offset + 20) };
    if (id === 'data') data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + length % 2;
  }
  assert.ok(data && format);
  assert.ok(data.length / format.frame / format.rate > 1);
  let peak = 0;
  for (let offset = 0; offset < format.rate * format.frame * 0.03; offset += 2) {
    peak = Math.max(peak, Math.abs(data.readInt16LE(offset)));
  }
  assert.ok(peak > 100, 'The notification recording must not begin with the original 0.88-second silence');
});

test('patched Steam sound method respects native sound selection and mute settings', async () => {
  const source = await readFile(steamBundle, 'utf8');
  const backend = await readFile('backend/main.lua', 'utf8');
  const { changes } = applySteamPatches(source, backend);
  const patch = changes.find(change => change.before.startsWith('PlayNotificationSound('));
  assert.ok(patch);
  const sandbox = { __trophyStyles: { notification: { playNotificationSound: () => true } } };
  const method = patch.after;
  const enumName = method.match(/,\w+=(\w+)\[\w+\]/)[1];
  const [, serviceName, property] = method.match(/(\w+)\.(\w+)\.PlayNavSound/);
  let nativeCalls = 0;
  let customCalls = 0;
  sandbox[enumName] = {};
  sandbox[serviceName] = { [property]: { PlayNavSound: () => nativeCalls++ } };
  sandbox.__trophyStyles.notification.playNotificationSound = () => { customCalls++; return true; };
  const store = vm.runInNewContext(`({${method}})`, sandbox);
  store.ChooseSound = () => undefined;
  store.PlayNotificationSound({ eType: 1 });
  assert.equal(customCalls, 0);
  store.ChooseSound = () => 'native';
  store.PlayNotificationSound({ eType: 1 });
  assert.equal(customCalls, 1);
  assert.equal(nativeCalls, 0);
  sandbox.__trophyStyles.notification.playNotificationSound = () => false;
  store.PlayNotificationSound({ eType: 1 });
  assert.equal(nativeCalls, 1);
});

test('PS4 sound follows the selected and pinned styles for all grades and volume', async () => {
  const ps4 = 'data:audio/wav;base64,UFM0';
  const start = instances.length;
  sound.configureSound(uri);
  sound.configureSound(uri, 'platinum');
  sound.configureSound(ps4, 'ps4');
  sound.setStyleEnabled(true);
  sound.updatePresentation('notificationStyle', 'ps4');
  try {
    sound.setSoundVolume(35);
    await sound.testSound('bronze');
    await sound.testSound('platinum');
    assert.ok(instances.slice(start + 4).every(audio => audio.src === ps4 && audio.volume === 0.35 && audio.playCalls === 1));
    sound.rememberPopupStyle('ps4-sound-test', 'ps4');
    sound.updatePresentation('notificationStyle', 'ps5');
    const notification = { data: { className: 'trophy-styles-test-toast ps4-sound-test trophy-styles-grade-platinum' } };
    let nativeCalls = 0;
    assert.equal(sound.playNotificationSound(notification, () => nativeCalls++), true);
    assert.equal(instances.at(-1).src, ps4);
    assert.equal(instances.at(-1).playCalls, 1);
    assert.equal(sound.playNotificationSound(notification, () => nativeCalls++), true);
    assert.equal(instances.at(-1).playCalls, 1);
    await sound.testSound('bronze');
    assert.equal(instances[start].playCalls, 1);
    sound.updatePresentation('notificationStyle', 'ps4');
    sound.setSoundVolume(0);
    const before = instances.reduce((total, audio) => total + (audio.playCalls ?? 0), 0);
    await sound.testSound();
    assert.equal(sound.playNotificationSound({ data: { achieved: () => true } }, () => nativeCalls++), true);
    assert.equal(instances.reduce((total, audio) => total + (audio.playCalls ?? 0), 0), before);
    assert.equal(nativeCalls, 0);
  } finally {
    sound.stopSounds();
    sound.setStyleEnabled(false);
    sound.updatePresentation('notificationStyle', 'ps5');
  }
});

test('Mythic clips preserve PCM samples and schedule the closing impact with automatic and manual durations', async t => {
  const original = await readFile('resources/xbox/mythic.wav');
  const uri = `data:audio/wav;base64,${original.toString('base64')}`;
  const clips = sound.splitMythicSound(uri).map(value => Buffer.from(value.split(',')[1], 'base64'));
  const samples = wav => {
    for (let offset = 12; offset + 8 <= wav.length;) {
      const size = wav.readUInt32LE(offset + 4);
      if (wav.toString('ascii', offset, offset + 4) === 'data') return wav.subarray(offset + 8, offset + 8 + size);
      offset += 8 + size + size % 2;
    }
    assert.fail('Missing PCM data');
  };
  assert.deepEqual(Buffer.concat(clips.map(samples)), samples(original));
  assert.equal(samples(clips[0]).length / (48000 * 4), 10.2);
  for (const clip of clips) assert.equal(clip.readUInt32LE(4), clip.length - 8);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    for (const [duration, before, after] of [['auto', 8000, 400], [15, 12000, 800]]) {
      sound.updatePresentation('popupDuration', duration);
      const start = instances.length;
      sound.configureSound(uri, 'xbox-mythic');
      await sound.testSound('mythic', 'xbox');
      const plays = () => instances.slice(start).reduce((sum, audio) => sum + (audio.playCalls ?? 0), 0);
      assert.equal(plays(), 1);
      t.mock.timers.tick(before);
      assert.equal(plays(), 1);
      t.mock.timers.tick(after);
      assert.equal(plays(), 2);
      sound.stopSounds();
    }
    sound.configureSound(uri, 'xbox-mythic');
    await sound.testSound('mythic', 'xbox');
    const plays = instances.reduce((sum, audio) => sum + (audio.playCalls ?? 0), 0);
    sound.stopSounds();
    t.mock.timers.tick(20000);
    assert.equal(instances.reduce((sum, audio) => sum + (audio.playCalls ?? 0), 0), plays);
  } finally {
    sound.stopSounds();
    sound.updatePresentation('popupDuration', 'auto');
  }
});

test('Xbox normal, rare and Mythic use separate sounds and retain the pinned popup style', async () => {
  sound.setStyleEnabled(true);
  sound.updatePresentation('notificationStyle', 'xbox');
  const uris = Object.fromEntries(['normal', 'rare', 'mythic'].map(kind => [kind, `data:audio/wav;base64,${Buffer.from(kind).toString('base64')}`]));
  try {
    for (const kind of ['normal', 'rare', 'mythic']) {
      sound.configureSound(uris[kind], `xbox-${kind}`);
      const key = `xbox-${kind}-test`;
      sound.rememberPopupStyle(key, 'xbox');
      sound.updatePresentation('notificationStyle', 'ps5');
      const notice = { data: { className: `trophy-styles-test-toast ${key} trophy-styles-xbox-${kind}`, contentClassName: key } };
      const before = instances.reduce((n, item) => n + (item.playCalls ?? 0), 0);
      assert.equal(sound.playNotificationSound(notice, () => assert.fail('Unexpected native sound')), true);
      assert.equal(sound.playNotificationSound(notice, () => assert.fail('Unexpected duplicate sound')), true);
      assert.equal(instances.reduce((n, item) => n + (item.playCalls ?? 0), 0), before + 1);
      assert.equal(instances.find(item => item.src === uris[kind] && item.playCalls)?.playCalls, 1);
    }
  } finally {
    sound.stopSounds(); sound.setStyleEnabled(false); sound.updatePresentation('notificationStyle', 'ps5');
  }
});
