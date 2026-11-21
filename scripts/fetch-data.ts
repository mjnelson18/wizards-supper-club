// Fetch the public CSV tabs, whitelist and validate them, compute every
// statistic and write public/data/*.json. Exits non-zero on any problem so a
// bad Sheet never reaches the live site (the previous deployment stays up).
//
//   npm run data            real data, from EVENINGS_CSV_URL / SCORES_CSV_URL / STATUS_CSV_URL
//   npm run data:sample     made-up data for local development

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataError, parseCuisines, parseEvenings, parseOverrides, parseScores, parseStatus, parseWizards } from '../src/lib/ingest.ts';
import { buildStats, compareEvenings } from '../src/lib/stats.ts';
import type { Meta } from '../src/lib/types.ts';
import { makeSample } from './sample-data.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/data');

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

/** Read a CSV from a URL, or from a local file path (handy for testing). */
async function readSource(name: string, location: string): Promise<string> {
  if (!/^https?:\/\//i.test(location)) return readFile(resolve(root, location), 'utf8');
  const res = await fetch(location, { redirect: 'follow' });
  if (!res.ok) throw new DataError([`${name}: download failed with HTTP ${res.status}`]);
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (type.includes('text/html') || /^\s*<(!doctype|html)/i.test(text)) {
    throw new DataError([`${name}: got a web page instead of CSV. Publish the tab to the web as CSV and use that link.`]);
  }
  return text;
}

async function main() {
  const sample = process.argv.includes('--sample');
  const wizards = parseWizards(await readJson('config/wizards.json'));
  const overrides = parseOverrides(await readJson('config/overrides.json'), wizards);

  let csv: { evenings: string; scores: string; status: string | null };
  if (sample) {
    csv = makeSample();
  } else {
    const { EVENINGS_CSV_URL, SCORES_CSV_URL, STATUS_CSV_URL } = process.env;
    const missing = [
      !EVENINGS_CSV_URL && 'EVENINGS_CSV_URL',
      !SCORES_CSV_URL && 'SCORES_CSV_URL',
    ].filter(Boolean);
    if (missing.length) {
      throw new DataError([
        `${missing.join(' and ')} not set. Add the published CSV links as repository variables (see README), or run "npm run data:sample" for made-up local data.`,
      ]);
    }
    csv = {
      evenings: await readSource('EVENINGS_CSV_URL', EVENINGS_CSV_URL as string),
      scores: await readSource('SCORES_CSV_URL', SCORES_CSV_URL as string),
      status: STATUS_CSV_URL ? await readSource('STATUS_CSV_URL', STATUS_CSV_URL) : null,
    };
  }

  const evenings = parseEvenings(csv.evenings, wizards).sort(compareEvenings);
  const { scores, warnings } = parseScores(csv.scores, wizards, evenings);
  const status = parseStatus(csv.status, wizards);
  for (const w of warnings) console.warn(`warning: ${w}`);

  const cuisines = parseCuisines(await readJson('config/cuisines.json'), evenings, { checkLabels: !sample });
  for (const w of cuisines.warnings) console.warn(`warning: ${w}`);

  const stats = buildStats({ evenings, scores, wizards, overrides, status, cuisines: cuisines.tags });
  const meta: Meta = {
    refreshedAt: new Date().toISOString(),
    source: sample ? 'sample' : 'sheet',
    counts: { evenings: evenings.length, scoreRows: scores.length, scores: stats.totalScores },
  };

  await mkdir(outDir, { recursive: true });
  const write = (name: string, data: unknown) => writeFile(resolve(outDir, name), JSON.stringify(data));
  await Promise.all([
    write('evenings.json', evenings),
    write('scores.json', scores),
    write('stats.json', stats),
    write('meta.json', meta),
  ]);
  console.log(
    `Wrote ${meta.counts.evenings} evenings, ${meta.counts.scoreRows} score rows (${meta.counts.scores} scores) from ${meta.source} data to public/data/.`,
  );
}

main().catch((err) => {
  if (err instanceof DataError) console.error(`\nData refresh failed. Nothing was written.\n${err.message}\n`);
  else console.error(err);
  process.exit(1);
});
