import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

const out = await build({
  entryPoints: ['src/game.js'],
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'safari15'],
  minify: true,
  legalComments: 'none',
  write: false,
});
const js = out.outputFiles[0].text;
const html = readFileSync('index.html', 'utf8');
const result = html.replace('/*BUNDLE*/', () => js);
writeFileSync('../pachinko-drop.html', result);
console.log('built pachinko-drop.html', (result.length / 1024 / 1024).toFixed(2), 'MB');
