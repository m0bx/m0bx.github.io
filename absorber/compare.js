import { $, esc, fmt, load, TAB_EVENT } from "./util.js?v=20261017-2";
import { CHAMBER_DEFAULTS, calculateChamber } from "./chamber.js?v=20261017-2";

const PANEL_KEY = "absorber-panel-selected-v1";
const CHAMBER_KEY = "absorber-chamber-v1";

function readPanel() {
  try {
    const s = JSON.parse(localStorage.getItem(PANEL_KEY));
    return s && s.design ? s : null;
  } catch { return null; }
}

/** Metrics for each mode, using the same definitions on both sides. */
function panelMetrics(p) {
  const s = p.settings, d = p.design;
  const length = s.antennaSeparation + 2 * s.panelOffset;
  return {
    height: d.totalHeight, length, floor: length * d.structureHeight,
    area: 2 * d.absorberArea, blocks: p.plan.totalBlocks, whole: p.plan.wholeBlocks,
    cut: p.plan.cutBlocks, scrap: p.plan.scrapPyramids, wood: null,
    cost: s.blockPrice > 0 ? p.plan.totalBlocks * s.blockPrice : null,
  };
}
function chamberMetrics(c) {
  const d = c.dims;
  return {
    height: d.externalSide, length: d.externalLength, floor: d.externalLength * d.externalSide,
    area: c.areas.absorber, blocks: c.plan.totalBlocks, whole: c.plan.wholeBlocks,
    cut: c.plan.cutBlocks, scrap: c.plan.scrapPyramids, wood: c.areas.wood, cost: c.cost,
  };
}

const ROWS = [
  ["height", "Maximum structure height", "m", 3, "Panels include wheel height; chamber is the external side."],
  ["length", "Longitudinal footprint", "m", 3, "Panels: backing-to-backing; chamber: external length."],
  ["floor", "Floor footprint", "m²", 2, "Longitudinal footprint × structure width."],
  ["area", "Absorber-covered area", "m²", 2, "Panels: both hoods."],
  ["blocks", "Absorber blocks to buy", "", 0, ""],
  ["whole", "Whole blocks", "", 0, ""],
  ["cut", "Blocks to cut", "", 0, ""],
  ["scrap", "Offcut scrap", "pyramids", 0, ""],
  ["wood", "Nominal wood area", "m²", 2, "Not modelled for the open-panel design."],
  ["cost", "Estimated absorber cost", "", 0, "Each mode uses its own block price."],
];

function row([key, label, unit, dec, note], p, c) {
  const a = p[key], b = c[key], u = unit ? ` ${unit}` : "";
  const cell = (v) => (Number.isFinite(v) ? `${fmt(v, dec)}${u}` : "—");
  const both = Number.isFinite(a) && Number.isFinite(b);
  const diff = both ? `${b - a >= 0 ? "+" : "−"}${fmt(Math.abs(b - a), dec)}${u}` : "—";
  const pct = both && a > 0 ? `${b - a >= 0 ? "+" : "−"}${fmt(Math.abs((b - a) / a) * 100, 1)}%` : "—";
  return `<tr><th scope="row" class="text-left">${esc(label)}${note ? `<br><small>${esc(note)}</small>` : ""}</th><td>${cell(a)}</td><td>${cell(b)}</td><td>${diff}</td><td>${pct}</td></tr>`;
}

const INPUTS = [
  ["Antenna separation (m)", "antennaSeparation", "separation", 3],
  ["Aperture diameter (m)", "apertureDiameter", "apertureDiameter", 3],
  ["Highest frequency (GHz)", "maxFrequencyGhz", "maxFrequencyGhz", 2],
  ["Block side (m)", "blockSide", "blockSide", 3],
  ["Pyramids per block side", "pyramidsPerSide", "pyramidsPerSide", 0],
  ["Absorber height (m)", "pyramidHeight", "pyramidHeight", 3],
  ["Spare material (%)", "sparePercent", "sparePercent", 0],
  ["Price per block", "blockPrice", "blockPrice", 0],
];

function inputsTable(p, cs) {
  let differ = false;
  const body = INPUTS.map(([label, pk, ck, dec]) => {
    const a = Number(p.settings[pk]), b = cs[ck] === null ? NaN : Number(cs[ck]);
    const diff = !(Math.abs(a - b) < 1e-9);
    differ ||= diff;
    return `<tr class="${diff ? "is-selected" : ""}"><th scope="row" class="text-left">${esc(label)}</th><td>${fmt(a, dec)}</td><td>${fmt(b, dec)}</td><td>${diff ? "differs" : "same"}</td></tr>`;
  }).join("");
  return { differ, html: `<div class="table-wrap"><table class="compact-table"><thead><tr><th class="text-left">Input</th><th>Absorber panels</th><th>Enclosed chamber</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` };
}

/** Same-scale side views: open panels above, enclosed chamber below. */
function scaleSvg(p, c) {
  const s = p.settings, d = p.design, cd = c.dims;
  const Lp = s.antennaSeparation + 2 * s.panelOffset, Hp = d.structureHeight;
  const Lc = cd.externalLength, Hc = cd.externalSide, t = c.wood.thickness;
  const W = 780, H = 440, pad = 36, gap = 56;
  const k = Math.min((W - 2 * pad) / Math.max(Lp, Lc), (H - 2 * pad - gap) / (Hp + Hc));
  const xp = (W - Lp * k) / 2, xc = (W - Lc * k) / 2, cyp = pad + Hp * k / 2, yc = pad + Hp * k + gap;
  const ang = d.wingAngle * Math.PI / 180, dx = d.wingLength * Math.sin(ang) * k, dy = d.wingLength * Math.cos(ang) * k, hc = d.centralSide * k / 2;
  const ln = (x1, y1, x2, y2, cls) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="4" class="c-pc"/>`;
  const board = (x, sign) => ln(x, cyp - hc, x, cyp + hc, "k-board") + ln(x, cyp - hc, x + sign * dx, cyp - hc - dy, "k-board") + ln(x, cyp + hc, x + sign * dx, cyp + hc + dy, "k-board");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Open-panel design and enclosed chamber drawn at the same scale">
  <style>.k-board{stroke:var(--teal);stroke-width:4;stroke-linecap:round}.k-tag{fill:var(--text);font:600 13px Inter,Segoe UI,sans-serif}</style>
  ${board(xp, 1)}${board(xp + Lp * k, -1)}${dot(xp + s.panelOffset * k, cyp)}${dot(xp + (s.panelOffset + s.antennaSeparation) * k, cyp)}
  <text x="${pad}" y="${pad - 12}" class="k-tag">Absorber panels · ${fmt(Lp, 2)} m × ${fmt(Hp, 2)} m</text>
  <rect x="${xc}" y="${yc}" width="${Lc * k}" height="${Hc * k}" class="c-wood"/>
  <rect x="${xc + t * k}" y="${yc + t * k}" width="${(Lc - 2 * t) * k}" height="${(Hc - 2 * t) * k}" class="c-abs"/>
  ${dot(xc + (cd.phaseToBacking + t) * k, yc + Hc * k / 2)}${dot(xc + (cd.phaseToBacking + t) * k + s.antennaSeparation * k, yc + Hc * k / 2)}
  <text x="${pad}" y="${yc - 10}" class="k-tag">Enclosed chamber · ${fmt(Lc, 2)} m × ${fmt(Hc, 2)} m</text></svg>`;
}

function render() {
  const out = $("#view-compare");
  const p = readPanel();
  const cs = load(CHAMBER_KEY, CHAMBER_DEFAULTS);
  const c = calculateChamber(cs);
  const problems = [];
  if (!p) problems.push("The open-panel view has no feasible selected design. Adjust its constraints first.");
  if (!c.valid) problems.push(`The enclosed-chamber view has no valid result: ${c.errors[0] ?? "check its inputs"}`);
  if (problems.length) {
    out.innerHTML = `<section class="warning-panel is-error" role="alert"><div class="warning-icon" aria-hidden="true">!</div><div><strong>Comparison unavailable</strong><ul>${problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></section>`;
    return;
  }
  const pm = panelMetrics(p), cm = chamberMetrics(c), inp = inputsTable(p, cs);
  out.innerHTML = `
  <main class="workspace" aria-label="Design comparison">
    ${inp.differ ? `<section class="warning-panel is-error" role="status"><div class="warning-icon" aria-hidden="true">!</div><div><strong>Inputs differ</strong><ul><li>The two saved modes use different inputs, so this is not a like-for-like comparison. Highlighted rows below show the differences. The modes' settings are not merged.</li></ul></div></section>` : ""}
    <section class="order-card"><div class="card-heading"><div><h2>Selected designs</h2><p>Panels: C ${fmt(p.design.centralSide, 2)} m, W ${fmt(p.design.wingLength, 2)} m, α ${fmt(p.design.wingAngle, 1)}°. Chamber: ${esc(c.recommendation ?? "fixed external size")}.</p></div></div>
    <div class="table-wrap"><table class="compact-table"><thead><tr><th class="text-left">Metric</th><th>Absorber panels</th><th>Enclosed chamber</th><th>Difference</th><th>Change</th></tr></thead><tbody>${ROWS.map((r) => row(r, pm, cm)).join("")}</tbody></table></div></section>
    <section class="visual-card"><div class="card-heading"><div><h2>Same-scale side view</h2></div></div><figure class="diagram">${scaleSvg(p, c)}</figure></section>
    <section class="order-card"><div class="card-heading"><div><h2>Inputs used</h2></div></div>${inp.html}</section>
    <section class="warning-panel"><div class="warning-icon" aria-hidden="true">i</div><div><ul><li>Percentages are chamber relative to panels. The two models answer different RF questions; neither is an RF-validated result.</li></ul></div></section>
  </main>`;
}

document.addEventListener(TAB_EVENT, (e) => { if (e.detail === "compare") render(); });
if (!$("#view-compare").hidden) render();
