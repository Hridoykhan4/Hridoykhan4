// Generates assets/readme/telemetry.svg and assets/readme/contribution-grid.svg
// from live public GitHub data. Zero dependencies — requires Node 18+.
// Run locally:  node scripts/generate-telemetry.mjs
// Run in CI:    .github/workflows/update-telemetry.yml (nightly)

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USER = "Hridoykhan4";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "readme");

const UA = { "User-Agent": `${USER}-profile-telemetry` };
const ghHeaders = process.env.GITHUB_TOKEN
  ? { ...UA, Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
  : UA;

async function fetchText(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}
async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// ---------- data ----------

async function getContributions() {
  const html = await fetchText(`https://github.com/users/${USER}/contributions`, UA);

  const cells = {};
  const cellRe = /<td[^>]*class="ContributionCalendar-day"[^>]*>/g;
  for (const tag of html.match(cellRe) ?? []) {
    const date = tag.match(/data-date="([\d-]+)"/)?.[1];
    const id = tag.match(/id="([^"]+)"/)?.[1];
    const level = Number(tag.match(/data-level="(\d)"/)?.[1] ?? 0);
    if (date && id) cells[id] = { date, level, count: 0 };
  }
  const tipRe = /<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;
  for (const m of html.matchAll(tipRe)) {
    const cell = cells[m[1]];
    if (!cell) continue;
    const n = m[2].match(/^(\d+)\s+contribution/);
    cell.count = n ? Number(n[1]) : 0;
  }
  const days = Object.values(cells).sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < 300) throw new Error(`contribution parse looks wrong: ${days.length} days`);
  return days;
}

function computeStreaks(days) {
  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;

  // longest run of consecutive active days, and where it sits in the year
  const best = { len: 0, start: 0, end: -1 };
  let run = 0;
  days.forEach((d, i) => {
    run = d.count > 0 ? run + 1 : 0;
    if (run > best.len) {
      best.len = run;
      best.start = i - run + 1;
      best.end = i;
    }
  });

  // current streak: consecutive active days ending at the last day
  // (or the day before it, so an empty "today" doesn't reset the streak)
  let current = 0;
  let i = days.length - 1;
  if (days[i] && days[i].count === 0) i--;
  for (; i >= 0 && days[i].count > 0; i--) current++;

  return {
    total,
    activeDays,
    current,
    longest: best.len,
    longestFrom: best.end >= 0 ? days[best.start].date : null,
    longestTo: best.end >= 0 ? days[best.end].date : null,
    longestStartIdx: best.start,
    longestEndIdx: best.end,
  };
}

async function getProfile() {
  return fetchJson(`https://api.github.com/users/${USER}`, ghHeaders);
}

async function getRepoFacts() {
  let stars = 0, repoCount = 0;
  const langs = {};
  for (let page = 1; page <= 3; page++) {
    const repos = await fetchJson(
      `https://api.github.com/users/${USER}/repos?per_page=100&page=${page}`,
      ghHeaders
    );
    for (const r of repos) {
      repoCount++;
      stars += r.stargazers_count;
      if (r.language) langs[r.language] = (langs[r.language] ?? 0) + 1;
    }
    if (repos.length < 100) break;
  }
  const langTotal = Object.values(langs).reduce((a, b) => a + b, 0);
  const topLangs = Object.entries(langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, n]) => ({ name, pct: Math.round((n / langTotal) * 100) }));
  return { stars, repoCount, topLangs };
}

// ---------- design tokens ----------

const MONO = `'Cascadia Code','Consolas','SF Mono',Menlo,monospace`;
const SANS = `'Segoe UI','Helvetica Neue',Arial,sans-serif`;

const VOID = "#05080F";
const WHITE = "#FFFFFF";
const BODY = "#AEBCD2";
const MUTED = "#8296B4";
const DIM = "#5B7099";
const FAINT = "#3E5074";
const CYAN = "#22D3EE";
const CYAN_HI = "#5FEFFF";
const VIOLET = "#A78BFA";
const VIOLET_HI = "#C9B6FF";

// brighter, evenly-stepped ramp — the old one washed out against the dark panel
const LEVEL_COLORS = ["#111A28", "#0C4F66", "#0E86A8", "#19C2DE", "#6FF3FF"];

// Shared background + material defs. `p` prefixes every id so two of these
// SVGs can sit in one README without their defs colliding.
function groundDefs(p) {
  return `
    <radialGradient id="${p}AuCy" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${CYAN}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${CYAN}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${p}AuVi" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${VIOLET}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${VIOLET}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${p}AuBl" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#3B82F6" stop-opacity="0"/>
    </radialGradient>
    <pattern id="${p}Dots" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1.2" cy="1.2" r="1.2" fill="#7FA3C9" fill-opacity="0.075"/>
    </pattern>
    <linearGradient id="${p}Rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${CYAN}" stop-opacity="0.55"/>
      <stop offset="50%" stop-color="${VIOLET}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${VIOLET}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${p}FillCy" x1="0" y1="0" x2="0.75" y2="1">
      <stop offset="0%" stop-color="#193049" stop-opacity="0.82"/>
      <stop offset="55%" stop-color="#0C1422" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="#080C15" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="${p}RimCy" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="${CYAN}" stop-opacity="0.62"/>
      <stop offset="45%" stop-color="${CYAN}" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="${CYAN}" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="${p}TopLite" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="35%" stop-color="#FFFFFF" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${p}Accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${CYAN}"/>
      <stop offset="100%" stop-color="${VIOLET}"/>
    </linearGradient>
    <filter id="${p}Glow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="2.4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="${p}Halo" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="16" flood-color="${CYAN}" flood-opacity="0.16"/>
    </filter>`;
}

function ground(p, w, h, blobs) {
  return `
  <rect width="${w}" height="${h}" fill="${VOID}"/>
  ${blobs}
  <rect width="${w}" height="${h}" fill="url(#${p}Dots)"/>
  <rect x="0" y="0" width="${w}" height="1.5" fill="url(#${p}Rule)"/>`;
}

// L-shaped HUD bracket. `dir` picks which corner it hugs.
function bracket(x, y, color, dir = "tl") {
  const d =
    dir === "tl"
      ? `M ${x} ${y + 18} L ${x} ${y + 6} A 6 6 0 0 1 ${x + 6} ${y} L ${x + 18} ${y}`
      : `M ${x} ${y - 18} L ${x} ${y - 6} A 6 6 0 0 1 ${x - 6} ${y} L ${x - 18} ${y}`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.5" stroke-width="1.6" stroke-linecap="round"/>`;
}

// ---------- telemetry panel ----------

function tile(x, y, label, value, accent) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="158" height="98" rx="16" fill="url(#tlFillCy)" stroke="url(#tlRimCy)" stroke-width="1.1"/>
    <rect x="${x + 22}" y="${y + 0.6}" width="114" height="1.2" fill="url(#tlTopLite)"/>
    <circle cx="${x + 18}" cy="${y + 25}" r="3" fill="${accent}" filter="url(#tlGlow)"/>
    <text x="${x + 30}" y="${y + 29}" font-family="${MONO}" font-size="9.5" letter-spacing="1.8" fill="${DIM}">${label}</text>
    <text x="${x + 18}" y="${y + 74}" font-family="${SANS}" font-size="30" font-weight="800" fill="${accent}">${value}</text>
    <rect x="${x + 18}" y="${y + 84}" width="26" height="2.5" rx="1.25" fill="${accent}" fill-opacity="0.55"/>
  </g>`;
}

// Segmented equalizer bar — reads far more like a system panel than a plain pill,
// and small percentages still show at least one lit segment.
function langBar(bx, y, name, pct) {
  const SEGS = 24, SW = 9, GAP = 2.5;
  const lit = Math.max(1, Math.round((pct / 100) * SEGS));
  let off = "", on = "";
  for (let i = 0; i < SEGS; i++) {
    const sx = bx + 112 + i * (SW + GAP);
    if (i < lit) on += `<rect x="${sx}" y="${y}" width="${SW}" height="20" rx="3" fill="url(#tlAccent)"/>`;
    else off += `<rect x="${sx}" y="${y}" width="${SW}" height="20" rx="3" fill="#111A2B" stroke="#1E2C45" stroke-width="0.8"/>`;
  }
  return `
  <g>
    <text x="${bx}" y="${y + 14.5}" font-family="${SANS}" font-size="14.5" fill="${BODY}">${name}</text>
    ${off}
    <g filter="url(#tlGlow)">${on}</g>
    <text x="${bx + 400}" y="${y + 14.5}" font-family="${MONO}" font-size="13.5" font-weight="700" fill="${CYAN_HI}">${pct}%</text>
  </g>`;
}

function renderTelemetry({ profile, repoFacts, streaks, stamp }) {
  const W = 1000, H = 478;
  const streakColor = streaks.current > 0 ? CYAN_HI : DIM;

  const tiles =
    tile(468, 100, "CONTRIBUTIONS", streaks.total.toLocaleString("en-US"), WHITE) +
    tile(639, 100, "ACTIVE DAYS", String(streaks.activeDays), CYAN_HI) +
    tile(810, 100, "CURRENT STREAK", String(streaks.current), streakColor) +
    tile(468, 212, "TOTAL STARS", String(repoFacts.stars), WHITE) +
    tile(639, 212, "FOLLOWERS", String(profile.followers), WHITE) +
    tile(810, 212, "PUBLIC REPOS", String(profile.public_repos), VIOLET_HI);

  const bars = (repoFacts.topLangs ?? [])
    .map((l, i) => langBar(i % 2 === 0 ? 32 : 516, i < 2 ? 362 : 400, l.name, l.pct))
    .join("");

  // hero: the longest streak, sized like it matters
  const big = String(streaks.longest);
  const unitX = 56 + big.length * 49 + 16;
  const railW = Math.max(8, Math.round((Math.min(streaks.longest, 365) / 365) * 340));
  const yearPct = Math.round((Math.min(streaks.longest, 365) / 365) * 100);
  const range =
    streaks.longestFrom && streaks.longestTo
      ? `${streaks.longestFrom} → ${streaks.longestTo}`
      : "NO STREAK ON RECORD";
  // when the record run is the one still going, say so — it reads much stronger
  const live = streaks.longest > 0 && streaks.current === streaks.longest;
  const heroTag = live ? "RUNNING NOW" : "ALL-TIME BEST";
  const tagW = heroTag.length * 7.8 + 36;
  const tagX = 432 - tagW;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="tlTitle">
  <title id="tlTitle">GitHub telemetry: longest streak ${streaks.longest} days (${range}), ${streaks.total} contributions in the past 12 months across ${streaks.activeDays} active days, current streak ${streaks.current} days, ${repoFacts.stars} stars, ${profile.followers} followers, ${profile.public_repos} public repositories.</title>
  <defs>${groundDefs("tl")}
    <filter id="tlNumGlow" x="-45%" y="-45%" width="190%" height="190%">
      <feGaussianBlur stdDeviation="11" result="b"/>
      <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.30  0 0 0 0 0.82  0 0 0 0 0.98  0 0 0 0.62 0" result="c"/>
      <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="tlBigNum" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#8FF7FF"/>
      <stop offset="55%" stop-color="#5FCBFF"/>
      <stop offset="100%" stop-color="${VIOLET}"/>
    </linearGradient>
    <clipPath id="tlClip"><rect x="0" y="0" width="${W}" height="${H}" rx="20"/></clipPath>
  </defs>

  <g clip-path="url(#tlClip)">
  ${ground("tl", W, H, `
    <ellipse cx="150" cy="60" rx="520" ry="330" fill="url(#tlAuCy)"/>
    <ellipse cx="900" cy="470" rx="520" ry="330" fill="url(#tlAuVi)"/>
    <ellipse cx="540" cy="240" rx="500" ry="260" fill="url(#tlAuBl)"/>`)}

  <g filter="url(#tlGlow)">
    <circle cx="42" cy="44" r="4.5" fill="${CYAN}">
      <animate attributeName="opacity" values="1;0.25;1" dur="3.2s" repeatCount="indefinite"/>
    </circle>
  </g>
  <text x="60" y="51" font-family="${MONO}" font-size="16" font-weight="700" letter-spacing="4.5" fill="#8FF3FF">HRD·TELEMETRY<tspan fill="#3C4A63" font-weight="400">  //  LIVE SYSTEM METRICS</tspan></text>
  <text x="968" y="51" font-family="${MONO}" font-size="11" letter-spacing="2.4" fill="#46587A" text-anchor="end">SYNC · ${stamp}</text>
  <rect x="32" y="72" width="936" height="1" fill="url(#tlRule)"/>

  <!-- hero: longest streak -->
  <g>
    <rect x="32" y="100" width="420" height="210" rx="18" fill="url(#tlFillCy)" stroke="url(#tlRimCy)" stroke-width="1.2" filter="url(#tlHalo)"/>
    <rect x="72" y="100.6" width="340" height="1.2" fill="url(#tlTopLite)"/>
    ${bracket(44, 112, CYAN, "tl")}
    ${bracket(440, 298, VIOLET, "br")}

    <circle cx="56" cy="128" r="3.5" fill="${CYAN}" filter="url(#tlGlow)">
      <animate attributeName="opacity" values="1;0.25;1" dur="2.6s" repeatCount="indefinite"/>
    </circle>
    <text x="70" y="132" font-family="${MONO}" font-size="11" letter-spacing="2.6" fill="${DIM}">LONGEST STREAK</text>

    <rect x="${tagX}" y="116" width="${tagW}" height="24" rx="12" fill="${CYAN}" fill-opacity="0.11" stroke="${CYAN}" stroke-opacity="0.42"/>
    <circle cx="${tagX + 15}" cy="128" r="3.2" fill="${CYAN_HI}" filter="url(#tlGlow)">
      <animate attributeName="opacity" values="1;0.2;1" dur="1.8s" repeatCount="indefinite"/>
    </circle>
    <text x="${tagX + 28}" y="132" font-family="${MONO}" font-size="10" letter-spacing="1.8" fill="#9BF0FF">${heroTag}</text>

    <text x="56" y="228" font-family="${SANS}" font-size="88" font-weight="800" letter-spacing="-2" fill="url(#tlBigNum)" filter="url(#tlNumGlow)">${big}</text>
    <text x="${unitX}" y="228" font-family="${MONO}" font-size="21" letter-spacing="2" fill="${MUTED}">DAYS</text>

    <text x="56" y="258" font-family="${MONO}" font-size="12.5" fill="${MUTED}">${range}</text>
    <text x="420" y="258" font-family="${MONO}" font-size="11.5" fill="${DIM}" text-anchor="end">${yearPct}% OF THE YEAR</text>

    <rect x="56" y="274" width="340" height="7" rx="3.5" fill="#0B1220" stroke="#1E2C45" stroke-width="0.8"/>
    <g filter="url(#tlGlow)">
      <rect x="56" y="274" width="${railW}" height="7" rx="3.5" fill="url(#tlAccent)"/>
    </g>
  </g>
${tiles}

  <text x="32" y="344" font-family="${MONO}" font-size="11" letter-spacing="2.6" fill="${DIM}">LANGUAGE DISTRIBUTION<tspan fill="#3C4A63">  //  BY REPOSITORY</tspan></text>
${bars}

  <rect x="32" y="440" width="936" height="1" fill="url(#tlRule)"/>
  <text x="500" y="462" font-family="${MONO}" font-size="10.5" letter-spacing="2.5" fill="${FAINT}" text-anchor="middle">SELF-HOSTED · REGENERATED NIGHTLY BY GITHUB ACTIONS</text>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="none" stroke="#1B2740"/>
  </g>
</svg>
`;
}

// ---------- contribution grid ----------

function renderGrid({ days, streaks, stamp }) {
  const CELL = 14, PITCH = 18, X0 = 78, Y0 = 112;
  const gridH = 7 * PITCH - (PITCH - CELL);
  const weeks = Math.ceil(days.length / 7);
  const firstDow = new Date(days[0].date + "T00:00:00Z").getUTCDay();

  // bucket cells by level so the two brightest tiers can share one glow pass
  const buckets = [[], [], [], [], []];
  const monthMarks = [];
  let lastMonth = "";
  days.forEach((d, i) => {
    const idx = i + firstDow;
    const col = Math.floor(idx / 7), row = idx % 7;
    const x = X0 + col * PITCH, y = Y0 + row * PITCH;
    buckets[d.level].push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3.5" fill="${LEVEL_COLORS[d.level]}"/>`);
    const month = d.date.slice(0, 7);
    if (month !== lastMonth && row === 0) {
      const label = new Date(d.date + "T00:00:00Z")
        .toLocaleString("en-US", { month: "short", timeZone: "UTC" })
        .toUpperCase();
      monthMarks.push({ x, label });
      lastMonth = month;
    }
  });
  const cells =
    buckets[0].join("") + buckets[1].join("") + buckets[2].join("") +
    `<g filter="url(#cgGlow)">${buckets[3].join("")}${buckets[4].join("")}</g>`;

  // drop the leading partial-month label when it would collide with the next one
  if (monthMarks.length > 1 && monthMarks[1].x - monthMarks[0].x < 44) monthMarks.shift();
  const months = monthMarks
    .map((m) => `<text x="${m.x}" y="${Y0 - 16}" font-family="${MONO}" font-size="11" letter-spacing="1" fill="${DIM}">${m.label}</text>`)
    .join("");

  // row 0 is Sunday, so Mon/Wed/Fri land on rows 1/3/5
  const dayLabels = [[1, "MON"], [3, "WED"], [5, "FRI"]]
    .map(([row, label]) => `<text x="${X0 - 12}" y="${Y0 + row * PITCH + 11}" font-family="${MONO}" font-size="10" letter-spacing="1" fill="${FAINT}" text-anchor="end">${label}</text>`)
    .join("");

  const gridW = weeks * PITCH - (PITCH - CELL);
  const W = X0 + gridW + 40, H = 348;

  // bracket the weeks the longest streak actually spans, and label it in a pill
  let streakMark = "";
  if (streaks.longest > 0 && streaks.longestEndIdx >= 0) {
    const startCol = Math.floor((streaks.longestStartIdx + firstDow) / 7);
    const endCol = Math.floor((streaks.longestEndIdx + firstDow) / 7);
    const bx = X0 + startCol * PITCH;
    const bw = (endCol - startCol) * PITCH + CELL;
    const label = `LONGEST STREAK · ${streaks.longest} DAYS UNBROKEN`;
    const pillW = label.length * 9.0 + 56;
    const pillX = Math.max(X0, Math.min(bx + bw / 2 - pillW / 2, W - 40 - pillW));
    const barY = Y0 + gridH + 18;
    streakMark = `
  <rect x="${bx - 4}" y="${Y0 - 4}" width="${bw + 8}" height="${gridH + 8}" rx="7" fill="${CYAN}" fill-opacity="0.05" stroke="${CYAN}" stroke-opacity="0.20"/>
  <g filter="url(#cgGlow)">
    <rect x="${bx}" y="${barY}" width="${bw}" height="5" rx="2.5" fill="url(#cgAccent)"/>
  </g>
  <rect x="${bx}" y="${barY - 5}" width="2" height="15" rx="1" fill="${CYAN_HI}"/>
  <rect x="${bx + bw - 2}" y="${barY - 5}" width="2" height="15" rx="1" fill="${VIOLET_HI}"/>
  <rect x="${pillX}" y="${barY + 18}" width="${pillW}" height="30" rx="15" fill="url(#cgFillCy)" stroke="${CYAN}" stroke-opacity="0.38"/>
  <circle cx="${pillX + 20}" cy="${barY + 33}" r="3.4" fill="${CYAN_HI}" filter="url(#cgGlow)">
    <animate attributeName="opacity" values="1;0.25;1" dur="2.4s" repeatCount="indefinite"/>
  </circle>
  <text x="${pillX + 34}" y="${barY + 37}" font-family="${MONO}" font-size="11.5" font-weight="700" letter-spacing="2" fill="#CFE9F7">${label}</text>`;
  }

  const legendY = Y0 + gridH + 92;
  const legend = LEVEL_COLORS
    .map((c, i) => `<rect x="${W - 170 + i * 20}" y="${legendY - 11}" width="14" height="14" rx="3.5" fill="${c}"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="cgTitle">
  <title id="cgTitle">Contribution activity grid for the past 12 months: ${streaks.total} total contributions, longest unbroken streak ${streaks.longest} days.</title>
  <defs>${groundDefs("cg")}
    <linearGradient id="cgSweep" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8FF3FF" stop-opacity="0"/>
      <stop offset="50%" stop-color="#8FF3FF" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#8FF3FF" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="cgClip"><rect x="0" y="0" width="${W}" height="${H}" rx="20"/></clipPath>
    <clipPath id="cgGridClip"><rect x="${X0}" y="${Y0}" width="${gridW}" height="${gridH}" rx="4"/></clipPath>
  </defs>

  <g clip-path="url(#cgClip)">
  ${ground("cg", W, H, `
    <ellipse cx="140" cy="50" rx="540" ry="300" fill="url(#cgAuCy)"/>
    <ellipse cx="${W - 120}" cy="${H}" rx="540" ry="300" fill="url(#cgAuVi)"/>
    <ellipse cx="${W / 2}" cy="180" rx="520" ry="240" fill="url(#cgAuBl)"/>`)}

  <g filter="url(#cgGlow)">
    <circle cx="42" cy="44" r="4.5" fill="${CYAN}">
      <animate attributeName="opacity" values="1;0.25;1" dur="3.2s" repeatCount="indefinite"/>
    </circle>
  </g>
  <text x="60" y="51" font-family="${MONO}" font-size="16" font-weight="700" letter-spacing="4.5" fill="#8FF3FF">ACTIVITY GRID<tspan fill="#3C4A63" font-weight="400">  //  LAST 12 MONTHS</tspan></text>
  <text x="${W - 40}" y="51" font-family="${MONO}" font-size="11.5" letter-spacing="1.5" fill="${MUTED}" text-anchor="end">${streaks.total.toLocaleString("en-US")} CONTRIBUTIONS · ${stamp}</text>
  <rect x="32" y="72" width="${W - 64}" height="1" fill="url(#cgRule)"/>

  ${months}
  ${dayLabels}
  ${cells}
  <g clip-path="url(#cgGridClip)">
    <rect x="${X0 - 170}" y="${Y0}" width="160" height="${gridH}" fill="url(#cgSweep)">
      <animateTransform attributeName="transform" type="translate" from="0 0" to="${gridW + 180} 0" dur="7s" repeatCount="indefinite"/>
    </rect>
  </g>
${streakMark}

  <text x="${X0}" y="${legendY}" font-family="${MONO}" font-size="11" letter-spacing="2" fill="${FAINT}">SIGNAL STRENGTH</text>
  <text x="${W - 180}" y="${legendY}" font-family="${MONO}" font-size="11" fill="${FAINT}" text-anchor="end">LESS</text>
  ${legend}
  <text x="${W - 66}" y="${legendY}" font-family="${MONO}" font-size="11" fill="${FAINT}">MORE</text>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="none" stroke="#1B2740"/>
  </g>
</svg>
`;
}

// ---------- main ----------

const [days, profile, repoFacts] = await Promise.all([
  getContributions(),
  getProfile(),
  getRepoFacts(),
]);
const streaks = computeStreaks(days);
const stamp = new Date().toISOString().slice(0, 10);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "telemetry.svg"), renderTelemetry({ profile, repoFacts, streaks, stamp }));
writeFileSync(join(OUT, "contribution-grid.svg"), renderGrid({ days, streaks, stamp }));

console.log(
  `ok: total=${streaks.total} active=${streaks.activeDays} current=${streaks.current} ` +
  `longest=${streaks.longest} (${streaks.longestFrom}..${streaks.longestTo}) ` +
  `stars=${repoFacts.stars} followers=${profile.followers} repos=${profile.public_repos} ` +
  `langs=${repoFacts.topLangs.map((l) => `${l.name}:${l.pct}%`).join(",")}`
);
