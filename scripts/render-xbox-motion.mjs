import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { buildXboxPreview } from './build-xbox-preview.mjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 960 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await page.setContent(await buildXboxPreview());
  await page.waitForFunction(() => document.querySelectorAll('canvas[data-xbox-time="3.400"]').length === 3);
  const encoder = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '50', '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'dist/xbox-normal-motion.mp4',
  ], { windowsHide: true });
  let errors = '';
  encoder.stderr.on('data', chunk => { errors += chunk; });
  const finished = once(encoder, 'close');
  const card = page.locator('[data-xbox-variant="normal"] canvas');
  for (let frame = 0; frame < 420; frame++) {
    await page.evaluate(time => window.renderAt('normal', time), frame / 50);
    if (!encoder.stdin.write(await card.screenshot())) await once(encoder.stdin, 'drain');
  }
  encoder.stdin.end();
  const [code] = await finished;
  if (code !== 0) throw new Error(errors || `FFmpeg exited with ${code}`);

  const icons = await build({ entryPoints: ['frontend/xbox-icons.ts'], bundle: true, write: false, format: 'iife', globalName: 'XboxIcons' });
  await page.setViewportSize({ width: 900, height: 430 });
  await page.setContent('<body style="margin:0;background:#202832;color:white;font:16px Segoe UI"><main style="display:grid;grid-template-columns:repeat(5,1fr);padding:12px;gap:10px"></main></body>');
  await page.addScriptTag({ content: icons.outputFiles[0].text });
  await page.evaluate(() => {
    for (const time of [0.8, 1.1, 1.35, 1.51, 1.65, 6.2, 6.34, 6.56, 6.87, 7.25]) {
      const item = document.createElement('div'); item.style.textAlign = 'center';
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 320; canvas.style.width = '160px'; canvas.style.height = '160px';
      const context = canvas.getContext('2d'); context.scale(3.2, 3.2);
      context.fillStyle = '#107c10'; context.beginPath(); context.arc(50, 50, 49, 0, Math.PI * 2); context.fill();
      window.XboxIcons.drawXboxNormalIcon(context, time, 6.2);
      item.append(canvas, document.createElement('br'), `${time.toFixed(2)} s`);
      document.querySelector('main').append(item);
    }
  });
  await page.screenshot({ path: 'dist/xbox-normal-sequence.png' });
  console.log('Saved dist/xbox-normal-motion.mp4 and dist/xbox-normal-sequence.png');
} finally {
  await browser.close();
}
