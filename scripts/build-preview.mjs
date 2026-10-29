import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const result = await build({ entryPoints: ['preview/main.tsx'], bundle: true, write: false, minify: true, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
await mkdir('dist', { recursive: true });
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Achievement Styles · PlayStation Preview</title></head><body style="margin:0"><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`;
await writeFile('dist/preview.html', html);
console.log('Built dist/preview.html');
