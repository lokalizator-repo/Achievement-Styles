import { getGameProfile } from './presentation';
import { notificationApp } from './game-profiles';
import { isPs5Notification, type SteamNotification } from './desktop-layout';
import { notificationKey } from './motion';
import { popupStyle } from './popup-layout';
import { getNotificationStyle, getPopupDuration, type NotificationStyle } from './presentation';
import { liveTrophy, liveXbox } from './live-trophies';
import { xboxHideAt } from './xbox-animation';
import { splitMythicSound, mythicOutroLead } from './xbox-sound';

type SoundVariant = 'standard' | 'platinum' | 'ps4' | 'xbox-normal' | 'xbox-rare' | 'xbox-mythic' | 'xbox-mythic-outro';
const soundUris = new Map<SoundVariant, string>();
let volume = 1;
let audioContext: AudioContext | undefined;
let gains = new WeakMap<HTMLAudioElement, GainNode>();
let generation = 0;
let handled = new WeakSet<SteamNotification>();
const playing = new Set<HTMLAudioElement>();
const prepared: Array<{ variant: SoundVariant; audio: HTMLAudioElement }> = [];
const timers = new Set<ReturnType<typeof setTimeout>>();

function applyVolume(audio: HTMLAudioElement, level = volume) {
  let gain = gains.get(audio);
  if (!gain && level > 1) {
    audioContext ??= new AudioContext();
    const source = audioContext.createMediaElementSource(audio);
    gain = audioContext.createGain();
    source.connect(gain);
    gain.connect(audioContext.destination);
    gains.set(audio, gain);
  }
  audio.volume = gain ? 1 : Math.min(1, level);
  if (gain) gain.gain.value = level;
}

function prepareAudio(uri: string, variant: SoundVariant) {
  const audio = new Audio(uri);
  applyVolume(audio);
  audio.preload = 'auto';
  audio.load();
  prepared.push({ variant, audio });
  return audio;
}

export function setSoundVolume(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  volume = Math.min(200, Math.max(0, value)) / 100;
  for (const { audio } of prepared) applyVolume(audio);
  if (volume > 0 && playing.size && audioContext?.state === 'suspended') void audioContext.resume().catch(() => {});
}

export function configureSound(uri: string, variant: SoundVariant = 'standard') {
  if (!uri.startsWith('data:audio/wav;base64,')) throw new Error('Trophy sound could not be loaded.');
  if (variant === 'xbox-mythic') {
    const clips = splitMythicSound(uri);
    if (clips) {
      uri = clips[0];
      configureSound(clips[1], 'xbox-mythic-outro');
    }
  }
  soundUris.set(variant, uri);
  if (typeof Audio !== 'undefined') {
    prepareAudio(uri, variant);
    prepareAudio(uri, variant);
  }
}

export function stopSounds() {
  generation++;
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  for (const { audio } of prepared) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  playing.clear();
  prepared.length = 0;
  handled = new WeakSet();
  soundUris.clear();
  volume = 1;
  gains = new WeakMap();
  const context = audioContext;
  audioContext = undefined;
  if (context && context.state !== 'closed') void context.close().catch(() => {});
}

function soundVariant(grade: unknown, style: NotificationStyle): SoundVariant {
  if (style === 'xbox') return grade === 'platinum' || grade === 'mythic' ? 'xbox-mythic' : grade === 'rare' ? 'xbox-rare' : 'xbox-normal';
  return style === 'ps4' ? 'ps4' : grade === 'platinum' ? 'platinum' : 'standard';
}

export async function testSound(grade: unknown = 'bronze', style = getNotificationStyle(), appid?: number) {
  const level = (getGameProfile(appid).soundVolume ?? volume * 100) / 100;
  if (level === 0) return;
  const variant = soundVariant(grade, style);
  const currentGeneration = generation;
  const started = performance.now();
  await playSound(variant, level);
  if (variant !== 'xbox-mythic' || !soundUris.has('xbox-mythic-outro') || generation !== currentGeneration) return;
  // The closing impact peaks 1.6s into the clip; the icon collapses 1.367s into Hide.
  const duration = getPopupDuration(false, appid);
  const delay = (xboxHideAt('mythic', duration === undefined ? undefined : duration / 1000) - mythicOutroLead) * 1000 - (performance.now() - started);
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (generation !== currentGeneration || level === 0) return;
    void playSound('xbox-mythic-outro', level).catch(error => console.warn('Could not play trophy closing sound', error));
  }, Math.max(0, delay));
  timers.add(timer);
}

async function playSound(variant: SoundVariant, level = volume) {
  const soundUri = soundUris.get(variant);
  if (!soundUri) throw new Error('Trophy sound is not ready. Reload the plugin and try again.');
  const audio = prepared.find(candidate => candidate.variant === variant && !playing.has(candidate.audio))?.audio ?? prepareAudio(soundUri, variant);
  applyVolume(audio, level);
  audio.currentTime = 0;
  const currentGeneration = generation;
  playing.add(audio);
  const release = () => playing.delete(audio);
  audio.addEventListener('ended', release, { once: true });
  audio.addEventListener('error', release, { once: true });
  try {
    if (gains.has(audio) && audioContext?.state === 'suspended') await audioContext.resume();
    await audio.play();
    if (currentGeneration !== generation) audio.pause();
  } catch (error) {
    release();
    throw error;
  }
}

export function playNotificationSound(notification: SteamNotification, nativeSound: () => void) {
  if (!isPs5Notification(notification)) return false;
  const appid = notification.data?.appid?.() ?? notificationApp(notificationKey(notification));
  if ((getGameProfile(appid).soundVolume ?? volume * 100) === 0) return true;
  if (typeof Audio === 'undefined') return false;
  const classes = notification?.data?.className?.split(' ') ?? [];
  let grade: string | undefined = classes[0] === 'trophy-styles-test-toast' || classes[0] === 'trophy-styles-completion-toast'
    ? classes.includes('trophy-styles-grade-platinum') ? 'platinum' : 'bronze'
    : notification.data ? liveTrophy(notification.data).grade : 'bronze';
  const style = popupStyle(notificationKey(notification));
  if (style === 'xbox') grade = classes[0] === 'trophy-styles-test-toast' || classes[0] === 'trophy-styles-completion-toast'
    ? classes.includes('trophy-styles-xbox-mythic') || grade === 'platinum' ? 'mythic'
      : classes.includes('trophy-styles-xbox-rare') ? 'rare' : 'normal'
    : notification.data ? liveXbox(notification.data).xboxVariant ?? 'normal' : 'normal';
  if (!soundUris.has(soundVariant(grade, style))) return false;
  if (handled.has(notification)) return true;
  handled.add(notification);
  const currentGeneration = generation;
  void testSound(grade, style, appid).catch(error => {
    if (generation !== currentGeneration || volume === 0) return;
    console.warn('Could not play trophy sound', error);
    nativeSound();
  });
  return true;
}
