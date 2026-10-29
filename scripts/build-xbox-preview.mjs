import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function buildXboxPreview() {
  const bundle = await build({ entryPoints: ['preview/xbox.tsx'], bundle: true, write: false, format: 'iife', globalName: 'XboxPreview', jsx: 'automatic', minify: true });
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Xbox achievement preview</title><style>body{margin:0;background:#1e2630;color:#fff;font:16px "Segoe UI",sans-serif}canvas{background:transparent}button:focus-visible,input:focus-visible{outline:2px solid #fff;outline-offset:3px}</style><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')};window.renderAt=XboxPreview.renderAt;window.setXboxColor=XboxPreview.setColor;</script></html>`;
  await mkdir('dist', { recursive: true });
  await writeFile('dist/xbox-preview.html', html);
  return html;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildXboxPreview();
