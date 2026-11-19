// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to /output/board.json, and
// copies this repository's dashboard/ and screenshots/ to /output. Last, it writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/app.css
// and dashboard/app.js read /output/data.js, which this program writes from the same board. A starting
// point, not a winner: it covers the watchlist, states the model and gives every protocol a farm plan.
// Change the model, the page or the plan; keep the gate's shape.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, MODEL_VERSION, SnapshotError, boardIssue, buildBoard, buildLiveView } from './lib/model.ts';
import type { Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** The snapshot is read and checked here: no helper for it in lib/model.ts, so the shape is enforced. */
function readSnapshot(text: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SnapshotError(`${inputFile}: not JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) throw new SnapshotError(`${inputFile}: the snapshot is not an object`);
  const s = parsed as Record<string, unknown>;
  if (typeof s.as_of !== 'string' || s.as_of.length === 0) throw new SnapshotError('snapshot.as_of is missing');
  if (typeof s.source !== 'string') throw new SnapshotError('snapshot.source is missing');
  if (typeof s.floor_usd !== 'number' || !Number.isFinite(s.floor_usd)) throw new SnapshotError('snapshot.floor_usd is missing');
  if (!Array.isArray(s.protocols) || s.protocols.length === 0) throw new SnapshotError('snapshot.protocols is empty');
  if (!Array.isArray(s.watchlist)) throw new SnapshotError('snapshot.watchlist is missing');
  const slugs = new Set<string>();
  const protocols = s.protocols.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) throw new SnapshotError(`snapshot.protocols[${i}] is not an object`);
    const p = raw as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug.length === 0) throw new SnapshotError(`snapshot.protocols[${i}].slug is missing`);
    if (slugs.has(p.slug)) throw new SnapshotError(`snapshot.protocols[${i}].slug repeats ${p.slug}`);
    slugs.add(p.slug);
    if (typeof p.name !== 'string') throw new SnapshotError(`${p.slug}: name is missing`);
    if (typeof p.category !== 'string' && p.category !== null) throw new SnapshotError(`${p.slug}: category is not a string`);
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`${p.slug}: tvl_usd is missing`);
    if (!Array.isArray(p.chains) || p.chains.some((c) => typeof c !== 'string')) throw new SnapshotError(`${p.slug}: chains is not a string array`);
    for (const key of ['change_7d', 'mcap_usd', 'listed_at', 'gecko_id', 'symbol']) {
      const v = p[key];
      if (v !== null && (key === 'listed_at' || key === 'gecko_id' || key === 'symbol' ? typeof v !== 'string' : typeof v !== 'number')) {
        throw new SnapshotError(`${p.slug}: ${key} is not ${key === 'listed_at' || key === 'gecko_id' || key === 'symbol' ? 'a string' : 'a number'}`);
      }
    }
    return {
      slug: p.slug, name: p.name, category: p.category as string | null,
      chains: p.chains as string[], tvl_usd: p.tvl_usd,
      change_7d: p.change_7d as number | null, mcap_usd: p.mcap_usd as number | null,
      listed_at: p.listed_at as string | null, gecko_id: p.gecko_id as string | null,
      symbol: p.symbol as string | null,
    };
  });
  for (const slug of s.watchlist) {
    if (typeof slug !== 'string' || !slugs.has(slug)) throw new SnapshotError(`snapshot.watchlist names ${String(slug)}, which is not in the snapshot`);
  }
  return {
    as_of: s.as_of, source: s.source, floor_usd: s.floor_usd,
    protocols, watchlist: s.watchlist as string[],
  };
}

let snapshot;
try {
  snapshot = readSnapshot(readFileSync(inputFile, 'utf8'));
} catch (error) {
  if (error instanceof SnapshotError) {
    process.stderr.write(`token radar: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
const board = buildBoard(snapshot);
const live = buildLiveView(snapshot);
const issue = boardIssue(board, snapshot.watchlist);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

/** window.RADAR: the board, the live-token view, the model behind it, and when the data was made. */
const radar = {
  board, live,
  model: { version: MODEL_VERSION, constants: MODEL, as_of: snapshot.as_of },
  generated: snapshot.as_of,
};
writeFileSync(join(out, 'data.js'), `window.RADAR = ${JSON.stringify(radar)};\n`);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

function assetSource(name: string): string | null {
  const local = join(here, name);
  return existsSync(local) ? local : null;
}

const dashboardSource = assetSource('dashboard');
const screenshotSource = assetSource('screenshots');
const dashboardOut = join(out, 'dashboard');
const screenshotsOut = join(out, 'screenshots');
mkdirSync(dashboardOut, { recursive: true });
mkdirSync(screenshotsOut, { recursive: true });
if (dashboardSource !== null) copyFiles(dashboardSource, dashboardOut);
const shots = screenshotSource === null ? [] : copyFiles(screenshotSource, screenshotsOut);
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${live.length} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);