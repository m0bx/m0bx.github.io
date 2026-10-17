import { CHAMBER_DEFAULTS, BEAM_HALF_ANGLE_DEG, SEPARATION_MAX, calculateChamber, farFieldSeparation, farFieldStatus } from "./chamber.js?v=20261017-1";

const KEY = "absorber-chamber-v1";
const TAB_KEY = "absorber-active-tab-v1";
const TABS = ["panels", "chamber", "compare"];
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const load = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k)) }; } catch { return { ...d }; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage disabled */ } };

let state = load(KEY, CHAMBER_DEFAULTS);

/* ---------- tabs ---------- */
function initTabs() {
  const list = $("#tabList");
  const tabs = [...list.querySelectorAll("[role=tab]")];
  const select = (name, focus = false) => {
    if (!TABS.includes(name)) name = "chamber";
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
      if (on && focus) t.focus();
    });
    try { localStorage.setItem(TAB_KEY, name); } catch { /* ignore */ }
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t.dataset.tab));
    t.addEventListener("keydown", (e) => {
      const to = { ArrowRight: (i + 1) % 3, ArrowLeft: (i + 2) % 3, Home: 0, End: 2 }[e.key];
      if (to !== undefined) { e.preventDefault(); select(tabs[to].dataset.tab, true); }
    });
  });
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch { /* ignore */ }
  select(saved); // default view on a new visit: Enclosed chamber
}

/* ---------- chamber form ---------- */
const FIELDS = [
  ["apertureDiameter", "Aperture diameter D", "m", 0.01],
  ["maxFrequencyGhz", "Highest S-band frequency", "GHz", 0.01],
  ["apertureClearance", "Aperture-edge clearance g", "m", 0.01],
  ["rearClearance", "Rear clearance e", "m", 0.01],
  ["blockSide", "Block side B", "m", 0.01],
  ["pyramidsPerSide", "Pyramids per block side N", "pcs", 1],
  ["pyramidHeight", "Absorber height h", "m", 0.01],
  ["boardThickness", "Board thickness t", "m", 0.001],
  ["sparePercent", "Spare material", "%", 1],
  ["blockPrice", "Price per block (optional)", "/ block", 1],
];
const FIXED = [["fixedExternalLength", "External length", "m", 0.01], ["fixedExternalSide", "External square side", "m", 0.01]];
const field = ([k, label, unit, step]) => `
  <label class="field"><span class="field-label">${label}</span>
    <span class="input-with-unit"><input data-c="${k}" type="number" step="${step}" min="0" inputmode="decimal" value="${state[k] ?? ""}"><span>${unit}</span></span></label>`;

function buildChamberView() {
  $("#view-chamber").innerHTML = `
  <main class="app-layout">
    <aside class="control-panel" aria-label="Enclosed chamber inputs">
      <section class="control-section">
        <div class="section-heading"><div><h2>Chamber size</h2><p>Six removable panels, square cross-section, S-band only.</p></div></div>
        <div class="segmented compact" role="group" aria-label="Size mode">
          <button class="segment" type="button" data-cmode="auto">Automatic minimum</button>
          <button class="segment" type="button" data-cmode="fixed">Fixed external</button>
        </div>
        <div id="cFixed" class="field-grid two-columns">${FIXED.map(field).join("")}</div>
      </section>
      <section class="control-section">
        <div class="field-grid">
          <label class="field"><span class="field-label">Antenna separation R (0.1–2.0 m)</span>
            <span class="input-with-unit"><input data-c="separation" type="number" step="0.01" min="0.1" max="2" inputmode="decimal" value="${state.separation}"><span>m</span></span></label>
          <div class="button-row"><button id="cFF" class="secondary-button" type="button">Set to far-field limit</button>
            <button id="cMax" class="secondary-button" type="button">Set to 2.0 m maximum</button></div>
          <div class="toggle-row"><span><strong>Dimension step</strong><small id="cStepNote"></small></span>
            <div class="mini-segmented" role="group" aria-label="Dimension step">
              <button class="mini-segment" type="button" data-cstep="pyramid">Pyramid</button>
              <button class="mini-segment" type="button" data-cstep="block">Block</button></div></div>
          ${FIELDS.map(field).join("")}
        </div>
      </section>
      <button id="cReset" class="secondary-button" type="button">Reset chamber defaults</button>
    </aside>
    <section class="workspace" aria-label="Enclosed chamber results" id="cOut"></section>
  </main>`;
}

function readInput(el) {
  const k = el.dataset.c;
  state[k] = el.value === "" ? null : Number(el.value);
  if (k !== "pyramidsPerSide" && state[k] === null) state[k] = NaN;
}

function syncControls() {
  document.querySelectorAll("[data-cmode]").forEach((b) => { const on = b.dataset.cmode === state.sizeMode; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); });
  document.querySelectorAll("[data-cstep]").forEach((b) => { const on = b.dataset.cstep === state.stepMode; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); });
  $("#cFixed").hidden = state.sizeMode !== "fixed";
  const N = state.pyramidsPerSide, B = state.blockSide;
  const pitch = Number.isInteger(N) && N > 0 && B > 0 ? B / N : NaN;
  $("#cStepNote").textContent = state.stepMode === "block" ? `One block: ${fmt(B * 1000, 0)} mm` : Number.isFinite(pitch) ? `One pyramid pitch (B/N): ${fmt(pitch * 1000, 1)} mm` : "Pyramid pitch needs N";
}

/* ---------- results ---------- */
const m = (v) => `${fmt(v, 3)} m`;
const metric = (label, value, note, cls = "") => `<article class="metric-card ${cls}"><span class="metric-label">${label}</span><strong>${value}</strong><small>${note}</small></article>`;

function render() {
  save(KEY, state);
  syncControls();
  const r = calculateChamber(state);
  const ff = farFieldStatus(state.apertureDiameter, state.maxFrequencyGhz, state.separation);
  const notes = [...r.errors, ...r.warnings];
  if (ff.exceedsMaximum && !r.warnings.some((w) => /exceeds/.test(w))) notes.push(`The far-field limit 2D²/λ = ${fmt(ff.distance, 2)} m exceeds the ${fmt(SEPARATION_MAX, 1)} m maximum separation.`);
  const status = `<div class="result-toolbar"><div><span class="status-dot ${r.valid ? "is-good" : "is-error"}"></span><strong>${r.valid ? (r.recommendation ?? "Fixed chamber") : "No result"}</strong></div>
    <div class="toolbar-facts"><span class="${ff.passes ? "" : "is-warning"}">R<sub>FF</sub> ${fmt(ff.distance, 3)} m · ${ff.passes ? "separation passes" : "separation below"}</span></div></div>
    ${notes.length ? `<section class="warning-panel ${r.errors.length || ff.exceedsMaximum ? "is-error" : ""}" role="alert"><div class="warning-icon" aria-hidden="true">!</div><div><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div></section>` : ""}`;
  if (!r.valid && !r.dims) { $("#cOut").innerHTML = status + limitations(); return; }

  const d = r.dims, p = r.plan;
  const cards = r.valid ? `<section class="metric-grid" aria-live="polite">
    ${metric("External size L × S × S", `${fmt(d.externalLength, 3)} × ${fmt(d.externalSide, 3)} × ${fmt(d.externalSide, 3)} m`, "Footprint including boards", "primary-metric")}
    ${metric("Clear absorber-tip size", `${fmt(d.clearLength, 3)} × ${fmt(d.clearSide, 3)} × ${fmt(d.clearSide, 3)} m`, "Between opposite tips")}
    ${metric("Separation", m(state.separation), ff.passes ? "Passes far-field limit" : "Below far-field limit")}
    ${metric("Absorber blocks to buy", p.totalBlocks.toLocaleString("en"), p.spareBlocks ? `${p.baseBlocks} + ${p.spareBlocks} spare` : "Whole + cut blocks")}
  </section>` : "";
  const facts = `<section class="order-card"><div class="card-heading"><div><h2>Dimensions</h2></div></div><div class="table-wrap"><table class="compact-table"><tbody>
    <tr><th scope="row" class="text-left">Internal backing L × S</th><td>${m(d.backingLength)} × ${m(d.backingSide)}</td></tr>
    <tr><th scope="row" class="text-left">Aperture-edge clearance (requested / achieved)</th><td>${m(state.apertureClearance)} / ${m(d.apertureClearance)}</td></tr>
    <tr><th scope="row" class="text-left">Rear clearance (requested / achieved)</th><td>${m(state.rearClearance)} / ${m(d.rearClearance)}</td></tr>
    <tr><th scope="row" class="text-left">Phase centre to wooden backing</th><td>${m(d.phaseToBacking)}</td></tr>
    <tr><th scope="row" class="text-left">Pyramid pitch B/N</th><td>${fmt(d.pitch * 1000, 1)} mm</td></tr>
    ${r.valid ? `<tr><th scope="row" class="text-left">Absorber area / nominal wood area</th><td>${fmt(r.areas.absorber, 2)} m² / ${fmt(r.areas.wood, 2)} m²</td></tr>` : ""}</tbody></table></div></section>`;
  const order = r.valid ? orderCard(r) : "";
  $("#cOut").innerHTML = status + cards + sectionSvg(r) + extraSvgs(r) + facts + order + (r.valid ? wood(r) : "") + limitations();
}

function orderCard(r) {
  const p = r.plan;
  return `<section class="order-card"><div class="card-heading"><div><h2>Absorber order</h2><p>Six continuously lined faces only; equipment adds nothing.</p></div></div>
  <div class="order-metrics">
    ${metric("Whole blocks", p.wholeBlocks, "Uncut")}${metric("Blocks to cut", p.cutBlocks, "Strips and corner pieces")}
    ${metric("Offcut scrap", p.scrapPyramids.toLocaleString("en"), "pyramids")}${metric("Estimated cost", r.cost === null ? "—" : fmt(r.cost, 0), r.cost === null ? "Enter a block price" : `${p.totalBlocks} blocks`)}
  </div>
  <div class="order-tables"><div><h3>Panels</h3><div class="table-wrap"><table class="compact-table"><thead><tr><th class="text-left">Group</th><th>Qty</th><th>Absorber size</th><th>Whole / panel</th><th class="text-left">Cuts / panel</th></tr></thead><tbody>
  ${p.panelTypes.map((t) => `<tr><td class="text-left">${esc(t.name)}</td><td>${t.count}</td><td>${m(t.widthM)} × ${m(t.heightM)}</td><td>${t.wholePerPanel}</td><td class="text-left">${t.piecesPerPanel.length ? esc(t.piecesPerPanel.map((x) => `${x.qty} × ${x.label}`).join(", ")) : "—"}</td></tr>`).join("")}
  </tbody></table></div></div>
  <div><h3>Pieces cut from blocks</h3><div class="table-wrap"><table class="compact-table"><thead><tr><th class="text-left">Piece (pyramids)</th><th>Pieces</th></tr></thead><tbody>
  ${p.pieceGroups.length ? p.pieceGroups.map((g) => `<tr><td class="text-left">${esc(g.label)}</td><td>${g.qty}</td></tr>`).join("") : '<tr><td class="text-left" colspan="2">No cut pieces.</td></tr>'}</tbody></table></div></div></div>
  <div class="order-patterns"><h3>Cutting plan</h3><ul>${p.cutPatterns.length ? p.cutPatterns.map((c) => `<li><span>${c.blocks} × block → ${esc(c.parts.join(" + "))}</span><span>${c.scrapPyramids ? `${c.scrapPyramids} pyramids scrap` : "no scrap"}</span></li>`).join("") : "<li><span>No block has to be cut.</span><span></span></li>"}</ul></div></section>`;
}

function wood(r) {
  const d = r.dims;
  return `<section class="order-card"><div class="card-heading"><div><h2>Wooden panels</h2><p>Nominal face dimensions; exact edge deductions depend on the joint arrangement chosen later. No strength check is made.</p></div></div><div class="table-wrap"><table class="compact-table"><tbody>
  <tr><td class="text-left">2 square end panels</td><td>${m(d.externalSide)} × ${m(d.externalSide)}</td></tr>
  <tr><td class="text-left">4 identical longitudinal panels</td><td>${m(d.externalLength)} × ${m(d.externalSide)}</td></tr>
  <tr><td class="text-left">Total panels / thickness</td><td>6 / ${fmt(r.wood.thickness * 1000, 1)} mm</td></tr>
  <tr><td class="text-left">Total nominal face area</td><td>${fmt(r.areas.wood, 2)} m²</td></tr></tbody></table></div></section>`;
}

function limitations() {
  return `<section class="warning-panel"><div class="warning-icon" aria-hidden="true">i</div><div><strong>Model limitations</strong><ul>
  <li>Geometric and procurement planning tool; continuous absorber coverage is assumed across panel joints.</li>
  <li>Does not predict chamber reflectivity, normalized site attenuation, quiet-zone uniformity, S21 ripple or time-domain-gating performance. A geometrically valid chamber is not an RF-validated anechoic chamber.</li>
  <li>Antenna bodies, rails, rotator and cable envelopes are not included, and add no absorber. No structural design is performed.</li>
  <li>R<sub>FF</sub> = 2D²/λ is used only as a planning check. Rays show the ±${BEAM_HALF_ANGLE_DEG}° (about −12 dB) feed edge, not predicted reflections.</li></ul></div></section>`;
}

/* ---------- longitudinal section ---------- */
function sectionSvg(r) {
  const d = r.dims, t = state.boardThickness, h = state.pyramidHeight, R = state.separation;
  if (![d.externalLength, d.externalSide].every((v) => v > 0)) return "";
  const W = 780, H = 400, pad = 60;
  const k = Math.min((W - 2 * pad) / d.externalLength, (H - 2 * pad) / d.externalSide);
  const ox = (W - d.externalLength * k) / 2, oy = 38;
  const X = (x) => ox + x * k, Y = (y) => oy + y * k;
  const x0 = t + h, x1 = d.externalLength - t - h, yT = t + h, yB = d.externalSide - t - h, yC = d.externalSide / 2;
  const sx = x0 + d.rearClearance, ax = sx + R;
  const tan = Math.tan(BEAM_HALF_ANGLE_DEG * Math.PI / 180);
  const ray = (x, dir, sign) => { // dir +1 toward right wall, -1 toward left wall
    const wall = dir > 0 ? x1 : x0, dy = (yB - yC);
    const dxTop = dy / tan, hitX = x + dir * dxTop;
    const side = dir > 0 ? hitX <= wall : hitX >= wall;
    const ex = side ? hitX : wall, ey = yC + sign * (side ? dy : Math.abs(wall - x) * tan);
    return `<line x1="${X(x)}" y1="${Y(yC)}" x2="${X(ex)}" y2="${Y(ey)}" class="c-ray ${dir > 0 ? "c-tx" : "c-rx"}"/><circle cx="${X(ex)}" cy="${Y(ey)}" r="3" class="c-hit"/>`;
  };
  const ant = (x, dir, label) => `<polygon points="${X(x) - dir * 16},${Y(yC) - 12} ${X(x) - dir * 16},${Y(yC) + 12} ${X(x) + dir * 12},${Y(yC)}" class="c-ant"/><circle cx="${X(x)}" cy="${Y(yC)}" r="4" class="c-pc"/><text x="${X(x)}" y="${Y(yC) + 28}" text-anchor="middle" class="c-l">${label}</text>`;
  const dim = (xa, xb, y, text) => `<line x1="${X(xa)}" y1="${y}" x2="${X(xb)}" y2="${y}" class="c-dim"/><line x1="${X(xa)}" y1="${y - 4}" x2="${X(xa)}" y2="${y + 4}" class="c-dim"/><line x1="${X(xb)}" y1="${y - 4}" x2="${X(xb)}" y2="${y + 4}" class="c-dim"/><text x="${(X(xa) + X(xb)) / 2}" y="${y - 6}" text-anchor="middle" class="c-v">${text}</text>`;
  const by = Y(d.externalSide) + 22;
  return `<section class="visual-card"><div class="card-heading"><div><h2>Longitudinal section</h2></div><div class="selected-dimensions">Rays at ±${BEAM_HALF_ANGLE_DEG}° (132° full angle)</div></div>
  <figure class="diagram"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Longitudinal section of the six-panel chamber with antennas, absorber lining and ±66 degree rays">
  <style>.c-wood{fill:var(--diagram-board);opacity:.55;stroke:var(--diagram-board)}.c-abs{fill:var(--teal-soft);stroke:var(--teal);stroke-width:1.2}.c-in{fill:var(--panel);stroke:none}
  .c-ray{stroke-width:1.5;stroke-dasharray:6 5}.c-tx{stroke:var(--amber)}.c-rx{stroke:var(--blue);opacity:.7}.c-hit{fill:var(--panel);stroke:var(--amber)}
  .c-bore{stroke:var(--text);stroke-width:1.2}.c-ant{fill:var(--blue-soft);stroke:var(--blue)}.c-pc{fill:var(--amber);stroke:var(--panel);stroke-width:2}
  .c-dim{stroke:var(--muted);stroke-width:1}.c-l{fill:var(--muted);font:12px Inter,Segoe UI,sans-serif}.c-v{fill:var(--text);font:600 12px Inter,Segoe UI,sans-serif}</style>
  <rect x="${X(0)}" y="${Y(0)}" width="${d.externalLength * k}" height="${d.externalSide * k}" class="c-wood"/>
  <rect x="${X(t)}" y="${Y(t)}" width="${(d.externalLength - 2 * t) * k}" height="${(d.externalSide - 2 * t) * k}" class="c-abs"/>
  <rect x="${X(x0)}" y="${Y(yT)}" width="${(x1 - x0) * k}" height="${(yB - yT) * k}" class="c-in"/>
  ${ray(sx, 1, -1)}${ray(sx, 1, 1)}${ray(ax, -1, -1)}${ray(ax, -1, 1)}
  <line x1="${X(sx)}" y1="${Y(yC)}" x2="${X(ax)}" y2="${Y(yC)}" class="c-bore"/>
  ${ant(sx, 1, "Illumination")}${ant(ax, -1, "AUT")}
  <text x="${(X(sx) + X(ax)) / 2}" y="${Y(yC) - 8}" text-anchor="middle" class="c-v">R = ${fmt(R, 3)} m</text>
  <text x="${(X(x0) + X(sx)) / 2}" y="${Y(yC) - 24}" text-anchor="middle" class="c-l">e ${fmt(d.rearClearance, 3)}</text>
  <text x="${(X(ax) + X(x1)) / 2}" y="${Y(yC) - 24}" text-anchor="middle" class="c-l">e ${fmt(d.rearClearance, 3)}</text>
  ${dim(x0, x1, by, `clear ${fmt(d.clearLength, 3)} m`)}${dim(t, d.externalLength - t, by + 20, `backing ${fmt(d.backingLength, 3)} m`)}${dim(0, d.externalLength, by + 40, `external ${fmt(d.externalLength, 3)} m`)}
  <text x="${X(0)}" y="${Y(0) - 8}" class="c-l">phase centre to backing ${fmt(d.phaseToBacking, 3)} m</text>
  </svg></figure></section>`;
}

/* ---------- cross-section and 3D cutaway ---------- */
function extraSvgs(r) {
  const d = r.dims;
  if (![d.externalLength, d.externalSide, d.clearSide].every((v) => v > 0)) return "";
  return `<section class="visual-card"><div class="card-heading"><div><h2>Cross-section and cutaway</h2></div></div><div class="visual-grid">
  <figure class="diagram"><figcaption><strong>Square cross-section</strong><span>Boards, absorber, clear tip square and aperture</span></figcaption>${crossSvg(r)}</figure>
  <figure class="diagram"><figcaption><strong>Six-panel cutaway</strong><span>Roof and near side wall removed for viewing only</span></figcaption>${cutawaySvg(r)}</figure></div></section>`;
}

function crossSvg(r) {
  const d = r.dims, t = state.boardThickness, h = state.pyramidHeight, D = state.apertureDiameter;
  const W = 440, H = 440, ox = 70, oy = 36, k = 300 / d.externalSide;
  const sq = (inset, cls) => `<rect x="${ox + inset * k}" y="${oy + inset * k}" width="${(d.externalSide - 2 * inset) * k}" height="${(d.externalSide - 2 * inset) * k}" class="${cls}"/>`;
  const cx = ox + 150, cy = oy + 150, tipR = ox + (t + h) * k + d.clearSide * k;
  const dim = (xa, xb, y, text) => `<line x1="${xa}" y1="${y}" x2="${xb}" y2="${y}" class="c-dim"/><line x1="${xa}" y1="${y - 4}" x2="${xa}" y2="${y + 4}" class="c-dim"/><line x1="${xb}" y1="${y - 4}" x2="${xb}" y2="${y + 4}" class="c-dim"/><text x="${(xa + xb) / 2}" y="${y - 6}" text-anchor="middle" class="c-v">${text}</text>`;
  const by = oy + 300 + 24;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Square cross-section with wooden boards, absorber layers, clear tip square and centred aperture">
  ${sq(0, "c-wood")}${sq(t, "c-abs")}${sq(t + h, "c-in")}
  <circle cx="${cx}" cy="${cy}" r="${D / 2 * k}" class="c-ant"/><circle cx="${cx}" cy="${cy}" r="3.5" class="c-pc"/>
  <line x1="${cx + D / 2 * k}" y1="${cy}" x2="${tipR}" y2="${cy}" class="c-dim"/>
  <text x="${(cx + D / 2 * k + tipR) / 2}" y="${cy - 6}" text-anchor="middle" class="c-v">g ${fmt(d.apertureClearance, 3)}</text>
  <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="c-l" dy="${D / 2 * k + 16}">D ${fmt(D, 2)} m</text>
  ${dim(ox + (t + h) * k, ox + (t + h + d.clearSide) * k, by, `clear ${fmt(d.clearSide, 3)} m`)}
  ${dim(ox + t * k, ox + (t + d.backingSide) * k, by + 20, `backing ${fmt(d.backingSide, 3)} m`)}
  ${dim(ox, ox + 300, by + 40, `external ${fmt(d.externalSide, 3)} m`)}</svg>`;
}

function cutawaySvg(r) {
  const d = r.dims, L = d.externalLength, S = d.externalSide, t = state.boardThickness, h = state.pyramidHeight;
  const W = 520, H = 400, ax = 0.55, ay = 0.35;
  const k = Math.min(430 / (L + ax * S), 280 / (S * (1 + ay))), ox = 30, oy = H - 70;
  const P = (x, y, z) => [ox + (x + ax * z) * k, oy - (y + ay * z) * k];
  const poly = (pts, cls) => `<polygon points="${pts.map((p) => P(...p).map((v) => v.toFixed(1)).join(",")).join(" ")}" class="${cls}"/>`;
  const back = [[0, 0, S], [L, 0, S], [L, S, S], [0, S, S]], floor = [[0, 0, 0], [L, 0, 0], [L, 0, S], [0, 0, S]];
  const right = [[L, 0, 0], [L, S, 0], [L, S, S], [L, 0, S]], left = [[0, 0, 0], [0, S, 0], [0, S, S], [0, 0, S]];
  const roof = [[0, S, 0], [L, S, 0], [L, S, S], [0, S, S]], front = [[0, 0, 0], [L, 0, 0], [L, S, 0], [0, S, 0]];
  const sx = t + h + d.rearClearance, ax2 = sx + state.separation, mid = S / 2;
  const a = P(sx, mid, mid), b = P(ax2, mid, mid), lab = P(L / 2, 0, 0);
  const txt = (p, text, dx = 0, dy = 0, cls = "c-l") => `<text x="${p[0] + dx}" y="${p[1] + dy}" class="${cls}" text-anchor="middle">${text}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cutaway of the six-panel absorber-lined chamber with roof and near side wall removed">
  ${poly(back, "c-abs")}${poly(floor, "c-abs")}${poly(right, "c-abs")}
  ${poly(left, "c-woodf")}${poly(roof, "c-ghost")}${poly(front, "c-ghost")}
  <line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="c-bore"/>
  <circle cx="${a[0]}" cy="${a[1]}" r="5" class="c-pc"/><circle cx="${b[0]}" cy="${b[1]}" r="5" class="c-pc"/>
  ${txt(a, "Illumination", 0, 20)}${txt(b, "AUT", 0, 20)}
  ${txt(P(0, S / 2, S / 2), "End S × S", -12, 0)}${txt(P(L, S / 2, S / 2), "End S × S", 34, 0)}
  ${txt(lab, "Near side wall (removed): L × S", 0, 22, "c-l")}
  ${txt(P(L / 2, S, S / 2), "Roof (removed): L × S", 0, -8)}
  ${txt(P(L / 2, 0, S / 2), "Floor: L × S", 0, 4)}${txt(P(L / 2, S / 2, S), "Far side wall: L × S", 0, 4)}
  <text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="c-l">6 separate panels · all 6 faces lined and counted · removed faces dashed</text></svg>`;
}

/* ---------- events ---------- */
function bind() {
  const root = $("#view-chamber");
  root.addEventListener("input", (e) => { if (e.target.dataset.c) { readInput(e.target); render(); } });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.cmode) state.sizeMode = b.dataset.cmode;
    else if (b.dataset.cstep) state.stepMode = b.dataset.cstep;
    else if (b.id === "cFF") { // exact value, never rounded or clamped
      state.separation = farFieldSeparation(state.apertureDiameter, state.maxFrequencyGhz).value;
      $('[data-c="separation"]').value = Number(state.separation.toFixed(4));
    } else if (b.id === "cMax") { state.separation = SEPARATION_MAX; $('[data-c="separation"]').value = SEPARATION_MAX; }
    else if (b.id === "cReset") { state = { ...CHAMBER_DEFAULTS }; root.querySelectorAll("[data-c]").forEach((i) => { i.value = state[i.dataset.c] ?? ""; }); }
    else return;
    render();
  });
}

buildChamberView();
bind();
initTabs();
render();
