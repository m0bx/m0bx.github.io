import {
  DEFAULTS,
  dimensionStep,
  farFieldDistance,
  generateDesigns,
  patternLevelDb,
  planBlocks,
  recommendedDesigns,
  sortDesigns,
  validateSettings,
} from "./core.js?v=20261012-3";

const STORAGE_KEY = "absorber-hood-optimizer-v1";
const THEME_STORAGE_KEY = "chamber-optimizer-theme";

const elements = {
  inputs: [...document.querySelectorAll("[data-setting]")],
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  sizeModeButtons: [...document.querySelectorAll("[data-size-mode]")],
  stepModeButtons: [...document.querySelectorAll("[data-step-mode]")],
  minimumModeFields: [...document.querySelectorAll(".mode-minimum-height")],
  maximumModeFields: [...document.querySelectorAll(".mode-maximum-coverage")],
  optimizeFields: document.querySelector(".size-optimize-fields"),
  fixedFields: document.querySelector(".size-fixed-fields"),
  stepDescription: document.querySelector("#stepDescription"),
  stepFact: document.querySelector("#stepFact"),
  farFieldFact: document.querySelector("#farFieldFact"),
  resultStatus: document.querySelector("#resultStatus"),
  resultStatusDot: document.querySelector("#resultStatusDot"),
  resultCount: document.querySelector("#resultCount"),
  metricHeight: document.querySelector("#metricHeight"),
  metricStructureHeight: document.querySelector("#metricStructureHeight"),
  metricAngle: document.querySelector("#metricAngle"),
  metricFullAngle: document.querySelector("#metricFullAngle"),
  metricDb: document.querySelector("#metricDb"),
  metricPower: document.querySelector("#metricPower"),
  metricMissedPower: document.querySelector("#metricMissedPower"),
  selectedDesignTitle: document.querySelector("#selectedDesignTitle"),
  selectedDimensions: document.querySelector("#selectedDimensions"),
  rangeSvg: document.querySelector("#rangeSvg"),
  panelSvg: document.querySelector("#panelSvg"),
  patternSvg: document.querySelector("#patternSvg"),
  patternCaption: document.querySelector(".pattern-diagram figcaption span"),
  warningPanel: document.querySelector("#warningPanel"),
  warningList: document.querySelector("#warningList"),
  recommendationGrid: document.querySelector("#recommendationGrid"),
  designTableBody: document.querySelector("#designTableBody"),
  tableSummary: document.querySelector("#tableSummary"),
  showMoreButton: document.querySelector("#showMoreButton"),
  sortSelect: document.querySelector("#sortSelect"),
  resetButton: document.querySelector("#resetButton"),
  themeToggle: document.querySelector("#themeToggle"),
  orderInputs: [...document.querySelectorAll("[data-order]")],
  orderSummary: document.querySelector("#orderSummary"),
  orderTotal: document.querySelector("#orderTotal"),
  orderTotalNote: document.querySelector("#orderTotalNote"),
  orderWhole: document.querySelector("#orderWhole"),
  orderCut: document.querySelector("#orderCut"),
  orderCutNote: document.querySelector("#orderCutNote"),
  orderScrap: document.querySelector("#orderScrap"),
  orderScrapNote: document.querySelector("#orderScrapNote"),
  orderPanelBody: document.querySelector("#orderPanelBody"),
  orderPieceBody: document.querySelector("#orderPieceBody"),
  orderPatterns: document.querySelector("#orderPatterns"),
  orderNote: document.querySelector("#orderNote"),
};

let state = loadState();
let calculation = null;
let selectedDesignId = null;
let tableLimit = 30;
let inputTimer = null;

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      ...DEFAULTS,
      ...(stored && typeof stored === "object" ? stored : {}),
      minWingAngle: 0,
      maxWingAngle: 90,
    };
  } catch {
    return { ...DEFAULTS, minWingAngle: 0, maxWingAngle: 90 };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The calculator remains fully functional when storage is disabled.
  }
}

function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  const action = normalized === "dark" ? "Switch to light mode" : "Switch to dark mode";
  elements.themeToggle.setAttribute("aria-label", action);
  elements.themeToggle.title = action;
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatMetres(value, decimals = 2) {
  return `${formatNumber(value, decimals)} m`;
}

function formatDegrees(value, decimals = 1, signed = false) {
  const prefix = signed ? "±" : "";
  return `${prefix}${formatNumber(value, decimals)}°`;
}

function formatDb(value, decimals = 1) {
  return `${formatNumber(value, decimals)} dB`;
}

function formatPercent(value, decimals = 1) {
  return `${formatNumber(value * 100, decimals)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyStateToControls() {
  for (const input of elements.inputs) {
    const key = input.dataset.setting;
    if (key in state) input.value = state[key];
  }
  for (const input of elements.orderInputs) {
    const key = input.dataset.order;
    if (key in state) input.value = state[key];
  }
  updateControlVisibility();
}

function readStateFromControls() {
  for (const input of elements.inputs) {
    const key = input.dataset.setting;
    const parsed = Number(input.value);
    if (Number.isFinite(parsed)) state[key] = parsed;
  }
  state.minWingAngle = 0;
  state.maxWingAngle = 90;
}

function updatePressedButtons(buttons, activeValue, dataKey) {
  for (const button of buttons) {
    const active = button.dataset[dataKey] === activeValue;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function updateControlVisibility() {
  const minimumMode = state.mode === "minimum-height";
  elements.minimumModeFields.forEach((node) => node.classList.toggle("is-hidden", !minimumMode));
  elements.maximumModeFields.forEach((node) => node.classList.toggle("is-hidden", minimumMode));
  elements.optimizeFields.classList.toggle("is-hidden", state.sizeMode !== "optimize");
  elements.fixedFields.classList.toggle("is-hidden", state.sizeMode !== "fixed");
  updatePressedButtons(elements.modeButtons, state.mode, "mode");
  updatePressedButtons(elements.sizeModeButtons, state.sizeMode, "sizeMode");
  updatePressedButtons(elements.stepModeButtons, state.stepMode, "stepMode");

  const step = dimensionStep(state.blockSide, state.pyramidsPerSide, state.stepMode);
  const stepLabel = state.stepMode === "block" ? "One full block" : "One pyramid pitch";
  elements.stepDescription.textContent = `${stepLabel}: ${formatNumber(step * 1000, step * 1000 < 10 ? 1 : 0)} mm`;
  elements.stepFact.textContent = `${formatNumber(step * 1000, step * 1000 < 10 ? 1 : 0)} mm dimension step`;
}

function clearSelectedOutput(message = "No feasible design") {
  elements.metricHeight.textContent = "—";
  elements.metricStructureHeight.textContent = message;
  elements.metricAngle.textContent = "—";
  elements.metricFullAngle.textContent = "Principal-plane result";
  elements.metricDb.textContent = "—";
  elements.metricPower.textContent = "—";
  elements.metricMissedPower.textContent = "Within the nominal cone";
  elements.selectedDesignTitle.textContent = message;
  elements.selectedDimensions.textContent = "Adjust the constraints to continue";
  renderEmptySvg(elements.rangeSvg, message);
  renderEmptySvg(elements.panelSvg, message);
  renderEmptySvg(elements.patternSvg, message);
  clearOrder();
}

function renderEmptySvg(svg, message) {
  svg.innerHTML = `
    <rect x="1" y="1" width="98%" height="98%" rx="8" fill="var(--panel-2)" stroke="var(--line)"/>
    <text x="50%" y="50%" text-anchor="middle" fill="var(--muted)" font-size="15">${escapeHtml(message)}</text>
  `;
}

function runCalculation({ preserveSelection = true } = {}) {
  readStateFromControls();
  const validation = validateSettings(state);
  state = { ...state, ...validation.settings };
  updateControlVisibility();
  tableLimit = 30;
  calculation = generateDesigns(state);
  saveState();

  const recommendations = recommendedDesigns(calculation.designs, state.mode);
  const selectionStillExists = preserveSelection && calculation.designs.some((item) => item.id === selectedDesignId);
  if (!selectionStillExists) {
    selectedDesignId = recommendations[0]?.id ?? sortDesigns(calculation.designs, "recommended", state.mode)[0]?.id ?? null;
  }

  renderStatus(validation.messages);
  renderRecommendations(recommendations);
  renderTable();
  renderSelectedDesign();
}

function renderStatus(validationMessages = []) {
  const { designs, combinations, error } = calculation;
  const hasResults = designs.length > 0;
  elements.resultStatusDot.classList.toggle("is-good", hasResults && !error);
  elements.resultStatusDot.classList.toggle("is-error", Boolean(error) || validationMessages.length > 0 || !hasResults);

  if (error) {
    elements.resultStatus.textContent = "Search range too large";
    elements.resultCount.textContent = "";
  } else if (!hasResults) {
    elements.resultStatus.textContent = "No feasible designs";
    elements.resultCount.textContent = `from ${combinations.toLocaleString("en")} size combinations`;
  } else {
    elements.resultStatus.textContent = "Feasible designs found";
    elements.resultCount.textContent = `${designs.length.toLocaleString("en")} of ${combinations.toLocaleString("en")} size combinations`;
  }

  const farField = farFieldDistance(state.apertureDiameter, state.maxFrequencyGhz);
  const passes = state.antennaSeparation + 1e-9 >= farField.distance;
  elements.farFieldFact.textContent = `RFF ${formatNumber(farField.distance, 2)} m · ${passes ? "separation passes" : "separation below"}`;
  elements.farFieldFact.classList.toggle("is-warning", !passes);
}

function selectedDesign() {
  return calculation?.designs.find((item) => item.id === selectedDesignId) ?? null;
}

const planCache = new Map();

function blockPlan(design) {
  const sparePercent = Math.max(0, Number(state.sparePercent) || 0);
  const key = [design.centralCells, design.wingCells, state.pyramidsPerSide, state.blockSide, sparePercent].join("|");
  let plan = planCache.get(key);
  if (!plan) {
    if (planCache.size > 2000) planCache.clear();
    plan = planBlocks({
      centralCells: design.centralCells,
      wingCells: design.wingCells,
      pyramidsPerSide: state.pyramidsPerSide,
      blockSide: state.blockSide,
      hoods: 2,
      sparePercent,
    });
    planCache.set(key, plan);
  }
  return plan;
}

function formatCm(value) {
  return `${formatNumber(value, value < 10 ? 1 : 0)} cm`;
}

function clearOrder(message = "—") {
  elements.orderSummary.textContent = message;
  for (const node of [elements.orderTotal, elements.orderWhole, elements.orderCut, elements.orderScrap]) {
    node.textContent = "—";
  }
  elements.orderPanelBody.innerHTML = "";
  elements.orderPieceBody.innerHTML = "";
  elements.orderPatterns.innerHTML = "";
  elements.orderNote.textContent = "";
}

function renderOrder(design) {
  if (!design) {
    clearOrder();
    return;
  }
  const plan = blockPlan(design);
  const n = plan.pyramidsPerSide;
  const blockCm = state.blockSide * 100;
  const pricePerBlock = Math.max(0, Number(state.blockPrice) || 0);

  elements.orderSummary.textContent =
    `${n}×${n} pyramids per ${formatNumber(blockCm, 0)}×${formatNumber(blockCm, 0)} cm block · pitch ${formatNumber(plan.pitch * 1000, Number.isInteger(Math.round(plan.pitch * 10000) / 10) ? 0 : 1)} mm`;

  elements.orderTotal.textContent = plan.totalBlocks.toLocaleString("en");
  elements.orderTotalNote.textContent = plan.spareBlocks
    ? `${plan.baseBlocks} needed + ${plan.spareBlocks} spare`
    : "Whole + cut blocks";
  if (pricePerBlock > 0) {
    elements.orderTotalNote.textContent += ` · total ${formatNumber(plan.totalBlocks * pricePerBlock, 0)}`;
  }

  elements.orderWhole.textContent = plan.wholeBlocks.toLocaleString("en");
  elements.orderCut.textContent = plan.cutBlocks.toLocaleString("en");
  elements.orderCutNote.textContent = plan.cutBlocks
    ? "Cut into strips and corner pieces"
    : "Nothing needs to be cut";
  elements.orderScrap.textContent = plan.scrapPyramids.toLocaleString("en");
  elements.orderScrapNote.textContent = plan.cutBlocks
    ? `pyramids · ${formatPercent(plan.scrapShare, 0)} of the cut blocks`
    : "No offcuts";

  elements.orderPanelBody.innerHTML = plan.panelTypes.map((panel) => {
    const cuts = panel.piecesPerPanel.length
      ? panel.piecesPerPanel.map((piece) => `${piece.qty} × ${piece.label}`).join(", ")
      : "—";
    return `
      <tr>
        <td class="text-left">${escapeHtml(panel.name)}</td>
        <td>${panel.count}</td>
        <td>${formatMetres(panel.widthM, 2)} × ${formatMetres(panel.heightM, 2)}</td>
        <td>${panel.cols} × ${panel.rows}</td>
        <td>${panel.wholePerPanel}</td>
        <td class="text-left">${escapeHtml(cuts)}</td>
      </tr>`;
  }).join("");

  elements.orderPieceBody.innerHTML = plan.pieceGroups.length
    ? plan.pieceGroups.map((group) => `
      <tr>
        <td class="text-left">${escapeHtml(group.label)}</td>
        <td>${formatCm(group.widthCm)} × ${formatCm(group.lengthCm)}</td>
        <td>${group.qty}</td>
      </tr>`).join("")
    : '<tr><td class="text-left" colspan="3">No cut pieces: every panel is made of whole blocks.</td></tr>';

  elements.orderPatterns.innerHTML = plan.cutPatterns.length
    ? plan.cutPatterns.map((pattern) => `
      <li>
        <span>${pattern.blocks} × block → ${escapeHtml(pattern.parts.join(" + "))}</span>
        <span>${pattern.scrapPyramids ? `${pattern.scrapPyramids} pyramids scrap` : "no scrap"}</span>
      </li>`).join("")
    : '<li><span>No block has to be cut.</span><span></span></li>';

  elements.orderNote.textContent =
    "Pieces are written as width × length in pyramids and may be rotated. The cutting plan is a practical heuristic, so check it before ordering.";
}

function renderSelectedDesign() {
  const design = selectedDesign();
  if (!design) {
    clearSelectedOutput(calculation?.error || "No feasible design");
    renderWarnings(null);
    return;
  }

  elements.metricHeight.textContent = formatMetres(design.totalHeight, 2);
  elements.metricStructureHeight.textContent = `${formatMetres(design.structureHeight, 2)} structure + ${formatMetres(state.wheelHeight, 2)} wheels`;
  elements.metricAngle.textContent = formatDegrees(design.capturedHalfAngle, 1, true);
  elements.metricFullAngle.textContent = `${formatDegrees(design.capturedFullAngle, 1)} full principal-plane angle`;
  elements.metricDb.textContent = formatDb(design.edgeLevelDb, 1);
  elements.metricPower.textContent = formatPercent(design.coneCoverage, 1);
  elements.metricMissedPower.textContent = `${formatPercent(design.missedConePower, 1)} of nominal cone power escapes`;
  elements.selectedDesignTitle.textContent = `C ${formatNumber(design.centralSide, 2)} m · W ${formatNumber(design.wingLength, 2)} m`;
  elements.selectedDimensions.textContent = `α ${formatDegrees(design.wingAngle, 1)} · ${formatNumber(design.absorberArea, 2)} m² per hood · ${blockPlan(design).totalBlocks} blocks to buy`;
  elements.patternCaption.innerHTML = `cos<sup>q</sup>(θ), ${formatDb(state.patternEdgeLevelDb, 1)} at ±${formatNumber(state.patternEdgeAngle, 1)}°`;

  renderRangeDiagram(design);
  renderPanelDiagram(design);
  renderPatternDiagram(design);
  renderOrder(design);
  renderWarnings(design);
  markSelectedCardsAndRows();
}

function renderWarnings(design) {
  const warnings = [];
  const farField = farFieldDistance(state.apertureDiameter, state.maxFrequencyGhz);

  if (calculation?.error) warnings.push(calculation.error);
  if (!design) {
    warnings.push("No combination satisfies the current angle, height, wing-angle and absorber-tip clearance constraints.");
  } else {
    warnings.push("Coverage and power are principal-plane estimates. Four rectangular wings leave diagonal corner openings unless corner infill is added.");
    warnings.push("The nominal TE11 fit uses −12 dB at ±66°. The feed report curves are approximately −12.06 to −13.37 dB at that angle across the S-band cases.");
    if (state.antennaSeparation + 1e-9 < farField.distance) {
      warnings.push(`The ${formatMetres(state.antennaSeparation, 2)} antenna separation is below the ${formatMetres(farField.distance, 2)} Fraunhofer estimate for the entered aperture and frequency.`);
    }
    if (design.capturedHalfAngle + 1e-7 < state.patternEdgeAngle) {
      warnings.push(`${formatPercent(design.missedConePower, 1)} of the nominal ±${formatNumber(state.patternEdgeAngle, 1)}° cone power is outside the principal-plane intercept.`);
    }
    if (design.wingAngle > 80 && design.wingLength > 0) {
      warnings.push("The wings are nearly parallel to the antenna axis and form a partial tunnel. Verify access, hinges, antenna bodies, stands and cable motion.");
    }
    if (design.minimumTipGap < 0.15) {
      warnings.push(`The approximate minimum opposing-tip gap is only ${formatMetres(design.minimumTipGap, 2)}. Confirm construction tolerances before fixing the wing angle.`);
    }
    if (design.wingLength === 0) {
      warnings.push("This option is a flat square backstop without wings and is included as a comparison case.");
    }
  }

  elements.warningList.innerHTML = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  elements.warningPanel.classList.toggle("is-error", !design || Boolean(calculation?.error));
}

function renderRecommendations(recommendations) {
  if (!recommendations.length) {
    elements.recommendationGrid.innerHTML = '<div class="empty-state">No recommended designs are available for the current constraints.</div>';
    return;
  }

  elements.recommendationGrid.innerHTML = recommendations.map((design) => `
    <button class="recommendation-card${design.id === selectedDesignId ? " is-selected" : ""}" type="button" data-design-id="${escapeHtml(design.id)}">
      <span class="recommendation-label">${escapeHtml(design.recommendation)}</span>
      <strong>C ${formatNumber(design.centralSide, 2)} m · W ${formatNumber(design.wingLength, 2)} m</strong>
      <span class="recommendation-metrics">
        <span>Height <b>${formatMetres(design.totalHeight, 2)}</b></span>
        <span>Half-angle <b>${formatDegrees(design.capturedHalfAngle, 1, true)}</b></span>
        <span>Wing angle <b>${formatDegrees(design.wingAngle, 1)}</b></span>
        <span>Area <b>${formatNumber(design.absorberArea, 2)} m²</b></span>
      </span>
    </button>
  `).join("");
}

function renderTable() {
  const designs = sortDesigns(calculation.designs, elements.sortSelect.value, state.mode);
  const shown = designs.slice(0, tableLimit);
  elements.designTableBody.innerHTML = shown.map((design) => `
    <tr data-design-id="${escapeHtml(design.id)}" class="${design.id === selectedDesignId ? "is-selected" : ""}" tabindex="0" aria-selected="${design.id === selectedDesignId}">
      <td>${formatMetres(design.centralSide, 2)}</td>
      <td>${formatMetres(design.wingLength, 2)}</td>
      <td>${formatDegrees(design.wingAngle, 1)}</td>
      <td>${formatMetres(design.totalHeight, 2)}</td>
      <td>${formatDegrees(design.capturedHalfAngle, 1, true)}</td>
      <td>${formatDb(design.edgeLevelDb, 1)}</td>
      <td>${formatPercent(design.coneCoverage, 1)}</td>
      <td>${formatMetres(design.minimumTipGap, 2)}</td>
      <td>${formatNumber(design.absorberArea, 2)} m²</td>
      <td>${blockPlan(design).totalBlocks}</td>
    </tr>
  `).join("");

  elements.tableSummary.textContent = designs.length
    ? `Showing ${shown.length.toLocaleString("en")} of ${designs.length.toLocaleString("en")} feasible designs`
    : "No feasible designs";
  elements.showMoreButton.classList.toggle("is-hidden", shown.length >= designs.length);
}

function markSelectedCardsAndRows() {
  document.querySelectorAll("[data-design-id]").forEach((node) => {
    const selected = node.dataset.designId === selectedDesignId;
    node.classList.toggle("is-selected", selected);
    if (node.matches("tr")) node.setAttribute("aria-selected", String(selected));
  });
}

function selectDesign(id) {
  if (!calculation.designs.some((item) => item.id === id)) return;
  selectedDesignId = id;
  renderSelectedDesign();
}

function svgPoint(x, y) {
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

function renderRangeDiagram(design) {
  const width = 780;
  const height = 620;
  const paddingX = 54;
  const paddingY = 32;
  const leftBoardX = -state.panelOffset;
  const rightBoardX = state.antennaSeparation + state.panelOffset;
  const angle = design.wingAngle * Math.PI / 180;
  const wingDx = design.wingLength * Math.sin(angle);
  const wingDy = design.wingLength * Math.cos(angle);
  const halfCentral = design.centralSide / 2;
  const halfSpan = design.structureHeight / 2;
  const xMin = leftBoardX - 0.16;
  const xMax = rightBoardX + 0.24;
  const floorY = -halfSpan - state.wheelHeight;
  const yMin = floorY - 0.04;
  const yMax = halfSpan + 0.12;
  const scale = Math.min(
    (width - 2 * paddingX) / Math.max(0.1, xMax - xMin),
    (height - 2 * paddingY) / Math.max(0.1, yMax - yMin),
  );
  const usedWidth = (xMax - xMin) * scale;
  const usedHeight = (yMax - yMin) * scale;
  const offsetX = (width - usedWidth) / 2;
  const offsetY = (height - usedHeight) / 2;
  const mapX = (x) => offsetX + (x - xMin) * scale;
  const mapY = (y) => height - offsetY - (y - yMin) * scale;

  const leftTopHinge = [mapX(leftBoardX), mapY(halfCentral)];
  const leftTopOuter = [mapX(leftBoardX + wingDx), mapY(halfCentral + wingDy)];
  const leftBottomHinge = [mapX(leftBoardX), mapY(-halfCentral)];
  const leftBottomOuter = [mapX(leftBoardX + wingDx), mapY(-halfCentral - wingDy)];
  const rightTopHinge = [mapX(rightBoardX), mapY(halfCentral)];
  const rightTopOuter = [mapX(rightBoardX - wingDx), mapY(halfCentral + wingDy)];
  const rightBottomHinge = [mapX(rightBoardX), mapY(-halfCentral)];
  const rightBottomOuter = [mapX(rightBoardX - wingDx), mapY(-halfCentral - wingDy)];
  const source = [mapX(0), mapY(0)];
  const aut = [mapX(state.antennaSeparation), mapY(0)];
  const floor = mapY(floorY);
  const captureLabelX = (source[0] + rightTopOuter[0]) / 2;
  const captureLabelY = (source[1] + rightTopOuter[1]) / 2 - 8;

  const line = (a, b, className) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${className}"/>`;
  const boardTopLeft = [mapX(leftBoardX), mapY(halfCentral)];
  const boardBottomLeft = [mapX(leftBoardX), mapY(-halfCentral)];
  const boardTopRight = [mapX(rightBoardX), mapY(halfCentral)];
  const boardBottomRight = [mapX(rightBoardX), mapY(-halfCentral)];

  const antennaSymbol = (point, direction, label) => {
    const sign = direction === "right" ? 1 : -1;
    const p1 = `${point[0] - sign * 16},${point[1] - 13}`;
    const p2 = `${point[0] - sign * 16},${point[1] + 13}`;
    const p3 = `${point[0] + sign * 14},${point[1]}`;
    return `
      <polygon points="${p1} ${p2} ${p3}" class="antenna"/>
      <circle cx="${point[0]}" cy="${point[1]}" r="4" class="phase-centre"/>
      <text x="${point[0]}" y="${point[1] + 29}" text-anchor="middle" class="svg-label">${label}</text>
    `;
  };

  elements.rangeSvg.innerHTML = `
    <defs>
      <marker id="arrowRange" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--muted)"/>
      </marker>
      <style>
        .wood{stroke:var(--diagram-board);stroke-width:9;stroke-linecap:round}.absorber{stroke:var(--teal);stroke-width:4;stroke-linecap:round}
        .beam-zone{fill:var(--amber-soft);opacity:.7}.beam{stroke:var(--amber);stroke-width:1.7;stroke-dasharray:6 6}.return-beam{stroke:var(--blue);stroke-width:1.2;stroke-dasharray:4 7;opacity:.58}
        .antenna{fill:var(--blue-soft);stroke:var(--blue);stroke-width:1.4}.phase-centre{fill:var(--amber);stroke:var(--panel);stroke-width:2}
        .dimension{stroke:var(--muted);stroke-width:1.1;marker-start:url(#arrowRange);marker-end:url(#arrowRange)}
        .extension{stroke:var(--diagram-guide);stroke-width:1;stroke-dasharray:3 4}.floor{stroke:var(--diagram-floor);stroke-width:1.2}
        .wheel{fill:var(--panel-2);stroke:var(--diagram-board);stroke-width:2}.svg-label{fill:var(--muted);font:13px Inter,Segoe UI,sans-serif}
        .svg-value{fill:var(--text);font:600 13px Inter,Segoe UI,sans-serif}.capture{fill:var(--amber);font:600 13px Inter,Segoe UI,sans-serif}
      </style>
    </defs>
    <polygon points="${svgPoint(...source)} ${svgPoint(...rightTopOuter)} ${svgPoint(...rightBottomOuter)}" class="beam-zone"/>
    ${line(source, rightTopOuter, "beam")}
    ${line(source, rightBottomOuter, "beam")}
    ${line(aut, leftTopOuter, "return-beam")}
    ${line(aut, leftBottomOuter, "return-beam")}
    ${line(boardTopLeft, boardBottomLeft, "wood")}
    ${line(boardTopRight, boardBottomRight, "wood")}
    ${line(leftTopHinge, leftTopOuter, "wood")}
    ${line(leftBottomHinge, leftBottomOuter, "wood")}
    ${line(rightTopHinge, rightTopOuter, "wood")}
    ${line(rightBottomHinge, rightBottomOuter, "wood")}
    ${line(boardTopLeft, boardBottomLeft, "absorber")}
    ${line(boardTopRight, boardBottomRight, "absorber")}
    ${line(leftTopHinge, leftTopOuter, "absorber")}
    ${line(leftBottomHinge, leftBottomOuter, "absorber")}
    ${line(rightTopHinge, rightTopOuter, "absorber")}
    ${line(rightBottomHinge, rightBottomOuter, "absorber")}
    ${antennaSymbol(source, "right", "Illumination")}
    ${antennaSymbol(aut, "left", "AUT")}
    <line x1="${mapX(xMin)}" y1="${floor}" x2="${mapX(xMax)}" y2="${floor}" class="floor"/>
    <circle cx="${mapX(leftBoardX)}" cy="${floor - 7}" r="7" class="wheel"/>
    <circle cx="${mapX(rightBoardX)}" cy="${floor - 7}" r="7" class="wheel"/>
    <line x1="${source[0]}" y1="${mapY(-0.22)}" x2="${aut[0]}" y2="${mapY(-0.22)}" class="dimension"/>
    <line x1="${source[0]}" y1="${mapY(-0.14)}" x2="${source[0]}" y2="${mapY(-0.26)}" class="extension"/>
    <line x1="${aut[0]}" y1="${mapY(-0.14)}" x2="${aut[0]}" y2="${mapY(-0.26)}" class="extension"/>
    <text x="${(source[0] + aut[0]) / 2}" y="${mapY(-0.22) - 8}" text-anchor="middle" class="svg-value">R = ${formatNumber(state.antennaSeparation, 2)} m</text>
    <line x1="${mapX(rightBoardX) + 30}" y1="${mapY(halfSpan)}" x2="${mapX(rightBoardX) + 30}" y2="${mapY(-halfSpan)}" class="dimension"/>
    <text x="${mapX(rightBoardX) + 42}" y="${mapY(0)}" class="svg-value" transform="rotate(-90 ${mapX(rightBoardX) + 42} ${mapY(0)})">H = ${formatNumber(design.structureHeight, 2)} m</text>
    <line x1="${leftTopOuter[0]}" y1="${leftTopOuter[1] - 22}" x2="${rightTopOuter[0]}" y2="${rightTopOuter[1] - 22}" class="dimension"/>
    <text x="${(leftTopOuter[0] + rightTopOuter[0]) / 2}" y="${leftTopOuter[1] - 31}" text-anchor="middle" class="svg-label">backing gap ${formatNumber(design.boardGap, 2)} m</text>
    <text x="${captureLabelX}" y="${captureLabelY}" text-anchor="middle" class="capture">${formatDegrees(design.capturedHalfAngle, 1, true)}</text>
    <text x="${rightTopHinge[0] - 12}" y="${rightTopHinge[1] - 12}" text-anchor="end" class="svg-value">α ${formatDegrees(design.wingAngle, 1)}</text>
    <text x="${rightTopOuter[0] + 8}" y="${rightTopOuter[1] + 18}" class="svg-label">W ${formatNumber(design.wingLength, 2)} m</text>
  `;
}

function renderPanelDiagram(design) {
  const c = design.centralSide;
  const w = design.wingLength;
  const angle = design.wingAngle * Math.PI / 180;
  const depth = w * Math.sin(angle);
  const spread = w * Math.cos(angle);
  const extent = Math.max(c / 2 + spread, 0.2);
  const scale = 142 / extent;

  const project = ([x, y, z]) => [
    250 + scale * (0.78 * z - 0.52 * x),
    220 + scale * (-0.82 * y + 0.30 * x + 0.13 * z),
  ];
  const polygon = (points, className) => `<polygon points="${points.map((point) => svgPoint(...project(point))).join(" ")}" class="${className}"/>`;
  const h = c / 2;
  const central = [[0, h, -h], [0, h, h], [0, -h, h], [0, -h, -h]];
  const top = [[0, h, -h], [0, h, h], [-depth, h + spread, h], [-depth, h + spread, -h]];
  const bottom = [[0, -h, -h], [-depth, -h - spread, -h], [-depth, -h - spread, h], [0, -h, h]];
  const right = [[0, h, h], [-depth, h, h + spread], [-depth, -h, h + spread], [0, -h, h]];
  const left = [[0, h, -h], [0, -h, -h], [-depth, -h, -h - spread], [-depth, h, -h - spread]];

  elements.panelSvg.innerHTML = `
    <defs>
      <pattern id="absorberPattern" width="12" height="12" patternUnits="userSpaceOnUse">
        <path d="M2 10 L6 2 L10 10 Z" fill="none" stroke="var(--teal)" stroke-opacity=".34" stroke-width="1"/>
      </pattern>
      <style>
        .centre-panel{fill:var(--diagram-centre);stroke:var(--diagram-board);stroke-width:1.6}.wing-top{fill:var(--diagram-wing);stroke:var(--teal);stroke-width:1.4}
        .wing-side{fill:var(--diagram-wing-side);stroke:var(--teal);stroke-width:1.3}.texture{fill:url(#absorberPattern);stroke:none}
        .panel-label{fill:var(--muted);font:12px Inter,Segoe UI,sans-serif}.panel-value{fill:var(--text);font:600 12px Inter,Segoe UI,sans-serif}
        .guide{stroke:var(--diagram-guide);stroke-width:1;stroke-dasharray:4 4}
      </style>
    </defs>
    ${polygon(bottom, "wing-side")}
    ${polygon(left, "wing-side")}
    ${polygon(central, "centre-panel")}
    ${polygon(central, "texture")}
    ${polygon(right, "wing-side")}
    ${polygon(top, "wing-top")}
    <text x="20" y="30" class="panel-value">C = ${formatNumber(c, 2)} m</text>
    <text x="20" y="49" class="panel-value">W = ${formatNumber(w, 2)} m</text>
    <text x="20" y="68" class="panel-value">α = ${formatDegrees(design.wingAngle, 1)}</text>
    <text x="250" y="398" text-anchor="middle" class="panel-label">Four equal rectangular wings · open diagonal corners</text>
  `;
}

function renderPatternDiagram(design) {
  const centreX = 56;
  const centreY = 210;
  const outerRadius = 360;
  const clipDb = -30;
  const radiusForDb = (db) => outerRadius * (1 + Math.max(clipDb, Math.min(0, db)) / Math.abs(clipDb));
  const polarPoint = (angleDeg, db) => {
    const angle = angleDeg * Math.PI / 180;
    const radius = radiusForDb(db);
    return [centreX + radius * Math.cos(angle), centreY - radius * Math.sin(angle)];
  };
  const points = [];
  for (let angle = -90; angle <= 90; angle += 1) {
    points.push(polarPoint(angle, patternLevelDb(angle, state.patternEdgeAngle, state.patternEdgeLevelDb)));
  }
  const lobePath = `M ${centreX} ${centreY} L ${points.map((point) => svgPoint(...point)).join(" L ")} Z`;
  const captured = Math.min(89.5, design.capturedHalfAngle);
  const capturedTop = polarPoint(captured, 0);
  const capturedBottom = polarPoint(-captured, 0);
  const nominalTop = polarPoint(state.patternEdgeAngle, 0);
  const nominalBottom = polarPoint(-state.patternEdgeAngle, 0);
  const gridLevels = [0, -6, -12, -18, -24];
  const angleGuides = [-60, -30, 0, 30, 60];

  elements.patternSvg.innerHTML = `
    <defs>
      <style>
        .polar-grid{fill:none;stroke:var(--diagram-guide);stroke-width:1;stroke-dasharray:3 5;opacity:.72}.polar-axis{stroke:var(--diagram-guide);stroke-width:1;opacity:.68}
        .lobe{fill:var(--teal-soft);stroke:var(--teal);stroke-width:2}.capture-line{stroke:var(--amber);stroke-width:2}
        .nominal-line{stroke:var(--blue);stroke-width:1.2;stroke-dasharray:5 5}.polar-label{fill:var(--muted);font:10px Inter,Segoe UI,sans-serif}
        .polar-value{fill:var(--amber);font:600 11px Inter,Segoe UI,sans-serif}
      </style>
    </defs>
    ${gridLevels.map((db) => {
      const radius = radiusForDb(db);
      return `<path d="M ${centreX} ${centreY - radius} A ${radius} ${radius} 0 0 1 ${centreX} ${centreY + radius}" class="polar-grid"/><text x="${centreX + radius + 3}" y="${centreY - 3}" class="polar-label">${db} dB</text>`;
    }).join("")}
    ${angleGuides.map((angle) => {
      const point = polarPoint(angle, 0);
      return `<line x1="${centreX}" y1="${centreY}" x2="${point[0]}" y2="${point[1]}" class="polar-axis"/>`;
    }).join("")}
    <path d="${lobePath}" class="lobe"/>
    <line x1="${centreX}" y1="${centreY}" x2="${nominalTop[0]}" y2="${nominalTop[1]}" class="nominal-line"/>
    <line x1="${centreX}" y1="${centreY}" x2="${nominalBottom[0]}" y2="${nominalBottom[1]}" class="nominal-line"/>
    <line x1="${centreX}" y1="${centreY}" x2="${capturedTop[0]}" y2="${capturedTop[1]}" class="capture-line"/>
    <line x1="${centreX}" y1="${centreY}" x2="${capturedBottom[0]}" y2="${capturedBottom[1]}" class="capture-line"/>
    <circle cx="${centreX}" cy="${centreY}" r="4" fill="var(--amber)"/>
    <text x="${Math.min(460, capturedTop[0] + 7)}" y="${Math.max(18, capturedTop[1] - 5)}" class="polar-value">±${formatNumber(design.capturedHalfAngle, 1)}°</text>
    <text x="${centreX + 10}" y="${centreY + 18}" class="polar-label">boresight</text>
  `;
}

function scheduleCalculation() {
  window.clearTimeout(inputTimer);
  inputTimer = window.setTimeout(() => runCalculation({ preserveSelection: false }), 90);
}

for (const input of elements.inputs) {
  input.addEventListener("input", scheduleCalculation);
  input.addEventListener("change", () => runCalculation({ preserveSelection: false }));
}

for (const input of elements.orderInputs) {
  input.addEventListener("input", () => {
    const parsed = Number(input.value);
    state[input.dataset.order] = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    saveState();
    renderTable();
    renderSelectedDesign();
  });
}

for (const button of elements.modeButtons) {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    updateControlVisibility();
    runCalculation({ preserveSelection: false });
  });
}

for (const button of elements.sizeModeButtons) {
  button.addEventListener("click", () => {
    state.sizeMode = button.dataset.sizeMode;
    updateControlVisibility();
    runCalculation({ preserveSelection: false });
  });
}

for (const button of elements.stepModeButtons) {
  button.addEventListener("click", () => {
    state.stepMode = button.dataset.stepMode;
    updateControlVisibility();
    runCalculation({ preserveSelection: false });
  });
}

elements.recommendationGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-design-id]");
  if (card) selectDesign(card.dataset.designId);
});

elements.designTableBody.addEventListener("click", (event) => {
  const row = event.target.closest("[data-design-id]");
  if (row) selectDesign(row.dataset.designId);
});

elements.designTableBody.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-design-id]");
  if (row) {
    event.preventDefault();
    selectDesign(row.dataset.designId);
  }
});

elements.sortSelect.addEventListener("change", () => {
  tableLimit = 30;
  renderTable();
  markSelectedCardsAndRows();
});

elements.showMoreButton.addEventListener("click", () => {
  tableLimit += 50;
  renderTable();
  markSelectedCardsAndRows();
});

elements.themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // Theme switching still works when storage is disabled.
  }
});

elements.resetButton.addEventListener("click", () => {
  state = { ...DEFAULTS };
  selectedDesignId = null;
  localStorage.removeItem(STORAGE_KEY);
  applyStateToControls();
  runCalculation({ preserveSelection: false });
});

applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
applyStateToControls();
runCalculation({ preserveSelection: false });

