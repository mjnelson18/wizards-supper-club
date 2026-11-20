// Last line of defence before deploy: scan the built site for anything that
// should never be public. Exits non-zero (and so blocks the deploy) on a hit.
//
// - Data files (dist/data/*.json): no "@" at all, no links, no "Review" header.
// - Every text file in dist/: no email addresses, no Google Forms or Sheets links.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const dist = 'dist';
const TEXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map', '.webmanifest']);

const EVERYWHERE = [
  ['an email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/],
  ['a Google Forms short link', /forms\.gle/i],
  ['a Google Forms link', /docs\.google\.com\/forms/i],
  ['a Google Sheets link', /docs\.google\.com\/spreadsheets/i],
];
const DATA_ONLY = [
  ['an "@" character', /@/],
  ['a link', /https?:\/\//i],
  ['the Review column', /Review/],
  ['a notes column', /"note"/i],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

let files;
try {
  files = [...walk(dist)];
} catch {
  console.error('check-dist: no dist/ folder. Run "npm run build" first.');
  process.exit(1);
}

const hits = [];
for (const file of files) {
  if (!TEXT.has(extname(file))) continue;
  const text = readFileSync(file, 'utf8');
  const rel = relative(dist, file).replace(/\\/g, '/');
  const checks = rel.startsWith('data/') ? [...EVERYWHERE, ...DATA_ONLY] : EVERYWHERE;
  for (const [what, pattern] of checks) {
    const m = pattern.exec(text);
    if (m) hits.push(`${rel}: contains ${what} ("${text.slice(Math.max(0, m.index - 20), m.index + 40).replace(/\s+/g, ' ')}")`);
  }
}

if (!files.some((f) => f.replace(/\\/g, '/').endsWith('data/stats.json'))) hits.push('data/stats.json is missing from the build');

if (hits.length) {
  console.error(`check-dist: ${hits.length} problem(s). Not safe to publish.\n- ${hits.join('\n- ')}`);
  process.exit(1);
}
console.log(`check-dist: ${files.length} files scanned, nothing private found.`);
