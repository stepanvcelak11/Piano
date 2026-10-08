// Turns dist/index.html into a page body for a claude.ai Artifact (which supplies its own
// <!doctype>/<html>/<head>/<body> skeleton). The hashed JS/CSS and samples are published alongside.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
const body = /<body>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';
const keep = head
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/charset|rel="manifest"|apple-touch-icon|mobile-web-app/i.test(l));
const title = keep.filter((l) => l.startsWith('<title'));
const rest = keep.filter((l) => !l.startsWith('<title'));
writeFileSync('dist/artifact.html', [...title, ...rest, body.trim()].join('\n') + '\n');
console.log('wrote dist/artifact.html');
