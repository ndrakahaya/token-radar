// The token radar's model: one snapshot in, one ranked board out.
//
//   base       = tvl_usd x category multiple
//   growth     = clamp(change_7d ?? 0, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// The multiple is read off the snapshot itself: per category the median mcap_usd / tvl_usd of that
// category's live-token protocols, clamped to [0.05, 1.0]; a category with fewer than three such
// protocols falls back to the clamped global median. A protocol is pre-token when its entry records
// no market cap, no CoinGecko id and no symbol, and the live-token protocols are kept apart in the
// Live token view. No protocol name is special-cased.
export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: SnapshotProtocol[]; watchlist: string[];
}
export interface ModelConstants {
  multiple_floor: number; multiple_ceiling: number; min_calibration_protocols: number;
  growth_weight: number; growth_floor: number; growth_cap: number;
  maturity_floor: number; maturity_range: number; maturity_days: number; unknown_age_days: number;
}
export const MODEL: ModelConstants = {
  multiple_floor: 0.05, multiple_ceiling: 1.0, min_calibration_protocols: 3,
  growth_weight: 0.5, growth_floor: -60, growth_cap: 120,
  maturity_floor: 0.6, maturity_range: 0.4, maturity_days: 1095, unknown_age_days: 365,
};
export const MODEL_VERSION = 'radar-2-cat';
export interface FarmStep { text: string; cost: string; time: string; }
export interface ModelBreakdown {
  multiple: number; growth_pct: number; growth_multiplier: number;
  maturity_multiplier: number; age_days: number | null;
}
export interface BoardRow {
  slug: string; name: string; rank: number; implied_value_usd: number;
  category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; listed_at: string | null; age_days: number | null;
  model: ModelBreakdown; farm_steps: string[];
}
export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number | null; change_7d: number | null;
}
export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

const DAY_MS = 86_400_000;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const finite = (v: unknown, fallback: number): number => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** No market cap, no CoinGecko id, and no symbol means there is no token yet. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}
const VERSIONED = /\s(?:V\d+(?:\.\d+)?|v\d+(?:\.\d+)?|\d+\.\d+)$/;
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

export function median(values: number[]): number {
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

export interface Calibration {
  multiple: number; global: number;
  byCategory: Record<string, number>; counts: Record<string, number>;
}
/** Calibrate mcap/TVL per category from the snapshot's live-token protocols. */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const by: Record<string, number[]> = {};
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const k = p.category ?? 'Unknown';
    (by[k] ??= []).push(ratio);
  }
  const global = all.length ? clamp(median(all), model.multiple_floor, model.multiple_ceiling) : model.multiple_floor;
  const byCategory: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const [k, values] of Object.entries(by)) {
    counts[k] = values.length;
    byCategory[k] = values.length >= model.min_calibration_protocols
      ? clamp(median(values), model.multiple_floor, model.multiple_ceiling) : global;
  }
  return { multiple: global, global, byCategory, counts };
}

function multipleFor(p: SnapshotProtocol, c: Calibration): number {
  return p.category === null ? c.multiple : (c.byCategory[p.category] ?? c.multiple);
}

/** The model's value: TVL times the category multiple, growth, and maturity. */
export function impliedValue(p: SnapshotProtocol, asOf: string, c: Calibration, model: ModelConstants = MODEL) {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(ageForModel, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const multiple = multipleFor(p, c);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, growthPct, growthMult, maturityMult, age };
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${n}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${n} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${n} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${n} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${n}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${n} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`;
}
function stepText(s: FarmStep): string {
  let text = `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
  if (text.length > 600) text = `${text.slice(0, 596)}...`;
  if (text.length < 20) text = `${text} Check the protocol's page for the next step.`;
  return text;
}
/** Six practical steps, using the protocol's category, chain, TVL tier, and age. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(age);
  return [
    { text: 'Use a fresh wallet that holds only funds you can afford to lose, and keep its recovery phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap, or a governance vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity spans more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: "Before withdrawing, open the protocol's own rewards page and claim only through the link it publishes.", cost: 'no fee to check; never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, dates, and every transaction in a farm log so you can repeat or unwind the position.', cost: 'nothing but the log', time: '5 minutes' },
  ];
}

/** All watchlist protocols plus all rankable pre-token protocols below the watchlist floor. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = new Map(snapshot.protocols.map(p => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map(p => ({ p, score: impliedValue(p, snapshot.as_of, calibration, model) }));
  scored.sort((a, b) => b.score.implied - a.score.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map(({ p, score }, i) => ({
    slug: p.slug, name: p.name, rank: i + 1, implied_value_usd: score.implied,
    category: p.category, chains: p.chains, tvl_usd: p.tvl_usd,
    change_7d: p.change_7d, listed_at: p.listed_at, age_days: score.age,
    model: { multiple: score.multiple, growth_pct: score.growthPct,
      growth_multiplier: round4(score.growthMult), maturity_multiplier: round4(score.maturityMult), age_days: score.age },
    farm_steps: farmSteps(p, score.age).map(stepText),
  }));
}

/** Live-token protocols only; these are separate from the model-ranked board. */
export function buildLiveView(snapshot: Snapshot, limit = 24): LiveRow[] {
  return snapshot.protocols.filter(p => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, limit).map(p => ({ slug: p.slug, name: p.name, category: p.category,
      chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** Validate watchlist coverage, rank sequence, non-increasing implied values, and farm steps. */
export function boardIssue(board: BoardRow[], watchlist: string[]): string | null {
  const slugs = new Set(board.map(r => r.slug));
  const missing = watchlist.filter(slug => !slugs.has(slug));
  if (missing.length) return `missing ${missing.length} watchlist protocols: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (row.rank !== i + 1) return `rank ${i + 1} is ${row.rank}`;
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} has a higher implied value than row ${i}`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) if (step.length < 20 || step.length > 600) return `${row.slug} has a farm step of ${step.length} characters`;
  }
  return null;
}