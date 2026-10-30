import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

const TEMPLATE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GLB verify</title>
<style>html,body{margin:0;background:#0d1219;overflow:hidden}</style></head>
<body><script>/*BUNDLE*/</script></body></html>`;

const out = await build({
  entryPoints: [process.argv[2] || 'src/verify_glb.js'],
  bundle: true,
  format: 'iife',
  target: ['chrome100'],
  minify: true,
  legalComments: 'none',
  write: false,
});
const js = out.outputFiles[0].text;
writeFileSync('verify.html', TEMPLATE.replace('/*BUNDLE*/', () => js));
console.log('built verify.html', (js.length / 1024).toFixed(1), 'KB');
