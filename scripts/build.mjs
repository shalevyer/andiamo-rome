import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

await mkdir('work/client', { recursive: true });
await build({
  entryPoints: ['app/client.tsx'], bundle: true, outfile: 'work/client/app.js',
  minify: true, format: 'esm', jsx: 'automatic',
  external: ['./google-sans-hebrew.woff2', './google-sans-latin.woff2'],
  define: { 'process.env.NODE_ENV': '"production"' },
  target: ['es2022'], legalComments: 'none',
});
const hash = createHash('sha256').update(await readFile('work/client/app.js')).update(await readFile('work/client/app.css')).update(await readFile('public/sw.js')).digest('hex').slice(0, 12);
await rm('docs', { recursive: true, force: true });
await mkdir('docs', { recursive: true });
for (const name of ['google-sans-OFL.txt', 'google-sans-hebrew.woff2', 'google-sans-latin.woff2', 'rome-warm.jpg', 'favicon.svg']) {
  await cp('public/' + name, 'docs/' + name);
}
await cp('work/client/app.js', 'docs/app.js');
await cp('work/client/app.css', 'docs/app.css');
await writeFile('docs/.nojekyll', '');
await writeFile('docs/manifest.webmanifest', JSON.stringify({ name: 'Andiamo · רומא, רק שנינו', short_name: 'Andiamo', start_url: './', scope: './', display: 'standalone', background_color: '#faf9f6', theme_color: '#faf9f6', lang: 'he', dir: 'rtl', icons: [{ src: './favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }));
await writeFile('docs/sw.js', (await readFile('public/sw.js', 'utf8')).replaceAll('__BUILD__', hash));
await writeFile('docs/index.html', `<!doctype html>
<html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#faf9f6"><meta name="robots" content="noindex,nofollow">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Andiamo">
<meta name="referrer" content="no-referrer"><title>Andiamo · רומא, רק שנינו</title>
<link rel="icon" href="./favicon.svg"><link rel="apple-touch-icon" href="./favicon.svg">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="preload" href="./google-sans-hebrew.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="./google-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="./app.css?v=${hash}"></head>
<body><div id="root"><p style="font-family:Arial,sans-serif;text-align:center;padding:60px;color:#3a352f">עוד רגע, יוצאים לרומא…</p></div>
<script type="module" src="./app.js?v=${hash}"></script></body></html>`);
console.log('Built public app in docs/ — no backend, credentials or bundled PDFs.');
