const DEG = Math.PI / 180;
const EPS = 1e-9;

export const DEFAULTS = Object.freeze({
  mode: "minimum-height",
  sizeMode: "optimize",
  antennaSeparation: 0.75,
  panelOffset: 0.40,
  targetHalfAngle: 60,
  maxTotalHeight: 2.50,
  wheelHeight: 0.10,
  blockSide: 0.50,
  pyramidsPerSide: 10,
  stepMode: "pyramid",
  pyramidHeight: 0.20,
  minCentralSide: 0.50,
  maxCentralSide: 3.00,
  maxWingLength: 1.00,
  fixedCentralSide: 2.00,
  fixedWingLength: 0.50,
  minWingAngle: 0,
  maxWingAngle: 90,
  minimumTipGap: 0.10,
  patternEdgeAngle: 66,
  patternEdgeLevelDb: -12,
  apertureDiameter: 0.20,
  maxFrequencyGhz: 2.29,
  sparePercent: 0,
  blockPrice: 0,
});

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function toRadians(degrees) {
  return degrees * DEG;
}

export function toDegrees(radians) {
  return radians / DEG;
}

export function dimensionStep(blockSide, pyramidsPerSide, stepMode) {
  const block = Math.max(Number(blockSide) || 0, EPS);
  const count = Math.max(1, Math.round(Number(pyramidsPerSide) || 1));
  return stepMode === "block" ? block : block / count;
}

export function snapToStep(value, step) {
  if (!(step > 0)) return Number(value) || 0;
  return Math.max(0, Math.round((Number(value) || 0) / step) * step);
}

export function patternExponent(edgeAngleDeg = 66, edgeLevelDb = -12) {
  const cosine = Math.cos(toRadians(clamp(Math.abs(edgeAngleDeg), 0.001, 89.999)));
  return Number(edgeLevelDb) / (10 * Math.log10(cosine));
}

export function patternLevelDb(angleDeg, edgeAngleDeg = 66, edgeLevelDb = -12) {
  const q = patternExponent(edgeAngleDeg, edgeLevelDb);
  const cosine = Math.max(Math.cos(toRadians(clamp(Math.abs(angleDeg), 0, 89.999))), 1e-12);
  return 10 * q * Math.log10(cosine);
}

export function forwardPowerFraction(angleDeg, edgeAngleDeg = 66, edgeLevelDb = -12) {
  const q = patternExponent(edgeAngleDeg, edgeLevelDb);
  const theta = toRadians(clamp(Math.abs(angleDeg), 0, 90));
  return clamp(1 - Math.pow(Math.cos(theta), q + 1), 0, 1);
}

export function nominalConeCoverage(angleDeg, edgeAngleDeg = 66, edgeLevelDb = -12) {
  const captured = forwardPowerFraction(Math.min(Math.abs(angleDeg), edgeAngleDeg), edgeAngleDeg, edgeLevelDb);
  const nominal = forwardPowerFraction(edgeAngleDeg, edgeAngleDeg, edgeLevelDb);
  return nominal > EPS ? clamp(captured / nominal, 0, 1) : 0;
}

export function farFieldDistance(apertureDiameterM, frequencyGhz) {
  const c = 299_792_458;
  const diameter = Math.max(0, Number(apertureDiameterM) || 0);
  const frequency = Math.max(EPS, (Number(frequencyGhz) || 0) * 1e9);
  const wavelength = c / frequency;
  return {
    wavelength,
    distance: (2 * diameter * diameter) / wavelength,
  };
}

function intersectIntervalSets(left, right) {
  const result = [];
  for (const [a0, a1] of left) {
    for (const [b0, b1] of right) {
      const lower = Math.max(a0, b0);
      const upper = Math.min(a1, b1);
      if (upper + EPS >= lower) result.push([lower, upper]);
    }
  }
  return result;
}

function clearanceIntervals({
  antennaSeparation,
  panelOffset,
  wingLength,
  pyramidHeight,
  minimumTipGap,
  minWingAngle,
  maxWingAngle,
}) {
  const lower = toRadians(clamp(minWingAngle, 0, 90));
  const upper = toRadians(clamp(maxWingAngle, 0, 90));
  if (upper + EPS < lower) return [];

  const separation = antennaSeparation + 2 * panelOffset;
  const h = Math.max(0, pyramidHeight);
  const w = Math.max(0, wingLength);
  const gap = Math.max(0, minimumTipGap);

  // Central absorber tips face each other independently of wing angle.
  if (separation - 2 * h + EPS < gap) return [];
  if (w <= EPS) return [[lower, upper]];

  // At the outer wing edge, each hood reaches W sin(a) + h cos(a)
  // towards the opposite hood.
  const allowance = (separation - gap) / 2;
  const radius = Math.hypot(w, h);
  if (allowance + EPS >= radius) return [[lower, upper]];
  if (allowance < 0) return [];

  const ratio = clamp(allowance / radius, 0, 1);
  const gamma = Math.asin(ratio);
  const beta = Math.atan2(h, w);
  const allowed = [];

  if (gamma + EPS >= beta) {
    allowed.push([0, Math.max(0, gamma - beta)]);
  }

  const highStart = Math.PI - gamma - beta;
  if (highStart <= Math.PI / 2 + EPS) {
    allowed.push([Math.max(0, highStart), Math.PI / 2]);
  }

  return intersectIntervalSets([[lower, upper]], allowed);
}

function positiveRayDistanceIntervals(lengthToPanel, wingLength) {
  if (wingLength <= lengthToPanel - EPS) return [[0, Math.PI / 2]];
  if (wingLength <= EPS) return [[0, Math.PI / 2]];
  const upper = Math.asin(clamp((lengthToPanel - 1e-7) / wingLength, 0, 1));
  return upper > 0 ? [[0, upper]] : [];
}

function heightIntervals(centralSide, wingLength, structuralHeightLimit) {
  if (!Number.isFinite(structuralHeightLimit)) return [[0, Math.PI / 2]];
  if (centralSide > structuralHeightLimit + EPS) return [];
  if (wingLength <= EPS || centralSide + 2 * wingLength <= structuralHeightLimit + EPS) {
    return [[0, Math.PI / 2]];
  }
  const ratio = clamp((structuralHeightLimit - centralSide) / (2 * wingLength), 0, 1);
  return [[Math.acos(ratio), Math.PI / 2]];
}

function coverageIntervals(targetHalfAngle, centralSide, wingLength, lengthToPanel) {
  const target = toRadians(clamp(targetHalfAngle, 0, 89.999));
  const halfCentral = centralSide / 2;

  if (wingLength <= EPS) {
    const captured = Math.atan2(halfCentral, lengthToPanel);
    return captured + EPS >= target ? [[0, Math.PI / 2]] : [];
  }

  const k = (
    lengthToPanel * Math.sin(target) - halfCentral * Math.cos(target)
  ) / wingLength;

  if (k > 1 + EPS) return [];
  if (k <= -1) return [[0, Math.PI / 2]];

  const delta = Math.acos(clamp(k, -1, 1));
  return [[
    Math.max(0, target - delta),
    Math.min(Math.PI / 2, target + delta),
  ]];
}

export function unconstrainedCoverageAngle(centralSide, wingLength, lengthToPanel) {
  if (wingLength <= EPS) return 0;
  const halfCentral = centralSide / 2;
  const radius = Math.hypot(lengthToPanel, halfCentral);
  if (wingLength >= radius - EPS) return 90;
  const angle = Math.atan2(halfCentral, lengthToPanel) + Math.asin(wingLength / radius);
  return clamp(toDegrees(angle), 0, 90);
}

export function panelMetrics(settings, centralSide, wingLength, wingAngleDeg) {
  const angle = toRadians(clamp(wingAngleDeg, 0, 90));
  const c = Math.max(0, centralSide);
  const w = Math.max(0, wingLength);
  const range = Math.max(0, settings.antennaSeparation);
  const offset = Math.max(0, settings.panelOffset);
  const absorberHeight = Math.max(0, settings.pyramidHeight);
  const lengthToPanel = range + offset;
  const axialReach = w * Math.sin(angle);
  const transverseReach = w * Math.cos(angle);
  const rayDistance = lengthToPanel - axialReach;
  const halfSpan = c / 2 + transverseReach;
  const capturedHalfAngle = rayDistance > EPS
    ? toDegrees(Math.atan2(halfSpan, rayDistance))
    : 90;
  const structureHeight = c + 2 * transverseReach;
  const totalHeight = structureHeight + Math.max(0, settings.wheelHeight);
  const boardSeparation = range + 2 * offset;
  const boardGap = boardSeparation - 2 * axialReach;
  const wingTipGap = boardSeparation - 2 * (axialReach + absorberHeight * Math.cos(angle));
  const centreTipGap = boardSeparation - 2 * absorberHeight;
  const minimumTipGap = Math.min(wingTipGap, centreTipGap);
  const absorberArea = c * c + 4 * c * w;
  const blockArea = Math.max(EPS, settings.blockSide * settings.blockSide);
  const equivalentBlocks = absorberArea / blockArea;
  const pyramidPitch = settings.blockSide / Math.max(1, Math.round(settings.pyramidsPerSide));
  const centralCells = Math.round(c / pyramidPitch);
  const wingCells = Math.round(w / pyramidPitch);
  const pyramidCount = centralCells * centralCells + 4 * centralCells * wingCells;
  const edgeLevelDb = patternLevelDb(
    capturedHalfAngle,
    settings.patternEdgeAngle,
    settings.patternEdgeLevelDb,
  );
  const coneCoverage = nominalConeCoverage(
    capturedHalfAngle,
    settings.patternEdgeAngle,
    settings.patternEdgeLevelDb,
  );
  const forwardPower = forwardPowerFraction(
    capturedHalfAngle,
    settings.patternEdgeAngle,
    settings.patternEdgeLevelDb,
  );

  return {
    id: `${c.toFixed(5)}-${w.toFixed(5)}-${toDegrees(angle).toFixed(5)}`,
    centralSide: c,
    wingLength: w,
    wingAngle: toDegrees(angle),
    capturedHalfAngle,
    capturedFullAngle: 2 * capturedHalfAngle,
    structureHeight,
    totalHeight,
    overallWidth: structureHeight,
    axialReach,
    rayDistance,
    boardGap,
    wingTipGap,
    centreTipGap,
    minimumTipGap,
    absorberArea,
    equivalentBlocks,
    minimumWholeBlocks: Math.ceil(equivalentBlocks - EPS),
    pyramidCount,
    centralCells,
    wingCells,
    edgeLevelDb,
    coneCoverage,
    missedConePower: 1 - coneCoverage,
    forwardPower,
    meetsNominalCone: capturedHalfAngle + 1e-7 >= settings.patternEdgeAngle,
  };
}

export function optimizeFixedSize(settings, centralSide, wingLength) {
  const c = Math.max(0, centralSide);
  const w = Math.max(0, wingLength);
  const lengthToPanel = settings.antennaSeparation + settings.panelOffset;
  if (!(c > 0) || !(lengthToPanel > 0)) return null;

  let intervals = clearanceIntervals({ ...settings, wingLength: w });
  intervals = intersectIntervalSets(intervals, positiveRayDistanceIntervals(lengthToPanel, w));

  if (settings.mode === "maximum-coverage") {
    const structuralLimit = settings.maxTotalHeight - settings.wheelHeight;
    intervals = intersectIntervalSets(intervals, heightIntervals(c, w, structuralLimit));
  } else {
    intervals = intersectIntervalSets(
      intervals,
      coverageIntervals(settings.targetHalfAngle, c, w, lengthToPanel),
    );
  }

  if (!intervals.length) return null;

  let selectedAngle;
  if (w <= EPS) {
    selectedAngle = 0;
  } else if (settings.mode === "minimum-height") {
    // Height falls monotonically as the wing rotates from 0 to 90 degrees.
    selectedAngle = Math.max(...intervals.map(([, upper]) => upper));
  } else {
    const naturalOptimum = toRadians(unconstrainedCoverageAngle(c, w, lengthToPanel));
    let best = null;
    for (const [lower, upper] of intervals) {
      const candidates = [lower, upper, clamp(naturalOptimum, lower, upper)];
      for (const candidate of candidates) {
        const metrics = panelMetrics(settings, c, w, toDegrees(candidate));
        if (
          !best ||
          metrics.capturedHalfAngle > best.capturedHalfAngle + 1e-8 ||
          (
            Math.abs(metrics.capturedHalfAngle - best.capturedHalfAngle) <= 1e-8 &&
            metrics.totalHeight < best.totalHeight
          )
        ) {
          best = metrics;
        }
      }
    }
    return best;
  }

  const result = panelMetrics(settings, c, w, toDegrees(selectedAngle));
  if (
    settings.mode === "minimum-height" &&
    result.capturedHalfAngle + 1e-6 < settings.targetHalfAngle
  ) return null;
  return result;
}

function normalizedSettings(input) {
  const merged = { ...DEFAULTS, ...input };
  const minAngle = clamp(Number(merged.minWingAngle) || 0, 0, 90);
  const maxAngle = clamp(Number(merged.maxWingAngle) || 0, minAngle, 90);
  return {
    ...merged,
    antennaSeparation: Math.max(0.01, Number(merged.antennaSeparation) || DEFAULTS.antennaSeparation),
    panelOffset: Math.max(0, Number(merged.panelOffset) || 0),
    targetHalfAngle: clamp(Number(merged.targetHalfAngle) || 0, 0, 89.9),
    maxTotalHeight: Math.max(0.01, Number(merged.maxTotalHeight) || DEFAULTS.maxTotalHeight),
    wheelHeight: Math.max(0, Number(merged.wheelHeight) || 0),
    blockSide: Math.max(0.01, Number(merged.blockSide) || DEFAULTS.blockSide),
    pyramidsPerSide: clamp(Math.round(Number(merged.pyramidsPerSide) || 1), 1, 100),
    pyramidHeight: Math.max(0, Number(merged.pyramidHeight) || 0),
    minCentralSide: Math.max(0.01, Number(merged.minCentralSide) || DEFAULTS.minCentralSide),
    maxCentralSide: Math.max(0.01, Number(merged.maxCentralSide) || DEFAULTS.maxCentralSide),
    maxWingLength: Math.max(0, Number(merged.maxWingLength) || 0),
    fixedCentralSide: Math.max(0.01, Number(merged.fixedCentralSide) || DEFAULTS.fixedCentralSide),
    fixedWingLength: Math.max(0, Number(merged.fixedWingLength) || 0),
    minWingAngle: minAngle,
    maxWingAngle: maxAngle,
    minimumTipGap: Math.max(0, Number(merged.minimumTipGap) || 0),
    patternEdgeAngle: clamp(Number(merged.patternEdgeAngle) || DEFAULTS.patternEdgeAngle, 0.1, 89.9),
    patternEdgeLevelDb: Math.min(-0.01, Number(merged.patternEdgeLevelDb) || DEFAULTS.patternEdgeLevelDb),
    apertureDiameter: Math.max(0.001, Number(merged.apertureDiameter) || DEFAULTS.apertureDiameter),
    maxFrequencyGhz: Math.max(0.001, Number(merged.maxFrequencyGhz) || DEFAULTS.maxFrequencyGhz),
  };
}

export function generateDesigns(inputSettings = {}) {
  const settings = normalizedSettings(inputSettings);
  const step = dimensionStep(settings.blockSide, settings.pyramidsPerSide, settings.stepMode);
  let sizes = [];

  if (settings.sizeMode === "fixed") {
    sizes = [[
      Math.max(step, snapToStep(settings.fixedCentralSide, step)),
      snapToStep(settings.fixedWingLength, step),
    ]];
  } else {
    const lowerCentral = Math.ceil((settings.minCentralSide - EPS) / step);
    const upperCentral = Math.floor((Math.max(settings.minCentralSide, settings.maxCentralSide) + EPS) / step);
    const upperWing = Math.floor((settings.maxWingLength + EPS) / step);
    const combinations = Math.max(0, upperCentral - lowerCentral + 1) * (upperWing + 1);
    if (combinations > 50_000) {
      return {
        settings,
        step,
        designs: [],
        combinations,
        error: "The selected step creates more than 50,000 size combinations. Reduce the search range or use block steps.",
      };
    }
    for (let ci = lowerCentral; ci <= upperCentral; ci += 1) {
      for (let wi = 0; wi <= upperWing; wi += 1) {
        sizes.push([ci * step, wi * step]);
      }
    }
  }

  const designs = [];
  for (const [centralSide, wingLength] of sizes) {
    const design = optimizeFixedSize(settings, centralSide, wingLength);
    if (design) designs.push(design);
  }

  return {
    settings,
    step,
    designs,
    combinations: sizes.length,
    error: null,
  };
}

function compareNumbers(a, b, direction = 1) {
  return direction * (a - b);
}

export function sortDesigns(designs, sortKey = "recommended", mode = "minimum-height") {
  const sorted = [...designs];
  const comparators = {
    shortest: (a, b) => compareNumbers(a.totalHeight, b.totalHeight) || compareNumbers(a.absorberArea, b.absorberArea),
    coverage: (a, b) => compareNumbers(a.capturedHalfAngle, b.capturedHalfAngle, -1) || compareNumbers(a.totalHeight, b.totalHeight),
    material: (a, b) => compareNumbers(a.absorberArea, b.absorberArea) || compareNumbers(a.totalHeight, b.totalHeight),
    clearance: (a, b) => compareNumbers(a.minimumTipGap, b.minimumTipGap, -1) || compareNumbers(a.totalHeight, b.totalHeight),
  };
  const recommended = mode === "maximum-coverage"
    ? (a, b) => comparators.coverage(a, b) || comparators.material(a, b)
    : (a, b) => comparators.shortest(a, b) || compareNumbers(a.capturedHalfAngle, b.capturedHalfAngle, -1);
  sorted.sort(comparators[sortKey] || recommended);
  return sorted;
}

function addUniqueRecommendation(list, seen, design, label) {
  if (!design || seen.has(design.id)) return;
  seen.add(design.id);
  list.push({ ...design, recommendation: label });
}

function sampleFrontier(designs, mode) {
  if (!designs.length) return [];
  let ordered;
  const frontier = [];

  if (mode === "maximum-coverage") {
    ordered = [...designs].sort((a, b) =>
      a.totalHeight - b.totalHeight ||
      b.capturedHalfAngle - a.capturedHalfAngle ||
      a.absorberArea - b.absorberArea
    );
    let bestCoverage = -Infinity;
    for (const design of ordered) {
      if (design.capturedHalfAngle > bestCoverage + 0.01) {
        frontier.push(design);
        bestCoverage = design.capturedHalfAngle;
      }
    }
  } else {
    ordered = [...designs].sort((a, b) =>
      a.totalHeight - b.totalHeight ||
      a.absorberArea - b.absorberArea ||
      b.capturedHalfAngle - a.capturedHalfAngle
    );
    let bestArea = Infinity;
    for (const design of ordered) {
      if (design.absorberArea < bestArea - 1e-5) {
        frontier.push(design);
        bestArea = design.absorberArea;
      }
    }
  }

  if (frontier.length <= 4) return frontier;
  const sampled = [];
  for (let i = 0; i < 4; i += 1) {
    const index = Math.round((i * (frontier.length - 1)) / 3);
    sampled.push(frontier[index]);
  }
  return sampled;
}

export function recommendedDesigns(designs, mode = "minimum-height") {
  if (!designs.length) return [];
  const list = [];
  const seen = new Set();
  if (mode === "maximum-coverage") {
    addUniqueRecommendation(list, seen, sortDesigns(designs, "coverage", mode)[0], "Best coverage");
    addUniqueRecommendation(list, seen, sortDesigns(designs, "shortest", mode)[0], "Shortest");
  } else {
    addUniqueRecommendation(list, seen, sortDesigns(designs, "shortest", mode)[0], "Shortest");
    addUniqueRecommendation(list, seen, sortDesigns(designs, "coverage", mode)[0], "Best coverage");
  }
  addUniqueRecommendation(list, seen, sortDesigns(designs, "material", mode)[0], "Least absorber");
  addUniqueRecommendation(list, seen, sortDesigns(designs, "clearance", mode)[0], "Largest clearance");
  for (const design of sampleFrontier(designs, mode)) {
    addUniqueRecommendation(list, seen, design, "Trade-off");
  }
  return list.slice(0, 8);
}

export function validateSettings(inputSettings = {}) {
  const settings = normalizedSettings(inputSettings);
  const messages = [];
  if (settings.maxCentralSide + EPS < settings.minCentralSide) {
    messages.push("Maximum central-panel side must be at least the minimum side.");
  }
  if (settings.maxTotalHeight <= settings.wheelHeight + EPS) {
    messages.push("The total-height limit must exceed the wheel height.");
  }
  if (settings.patternEdgeLevelDb >= 0) {
    messages.push("The pattern edge level must be negative in dB relative to boresight.");
  }
  return { settings, messages };
}


/* ------------------------------------------------------------------ */
/* Absorber order planning                                             */
/* ------------------------------------------------------------------ */

function pieceLabel(a, b) {
  return `${Math.min(a, b)}×${Math.max(a, b)}`;
}

/**
 * Splits one rectangular panel (cols × rows pyramids) into whole blocks and
 * cut pieces. Pieces are always full strips of a block (rx × N, N × ry) plus
 * at most one corner piece (rx × ry), so a panel is never assembled from
 * single pyramids.
 */
function splitPanel(cols, rows, n) {
  const fullX = Math.floor(cols / n);
  const fullY = Math.floor(rows / n);
  const rx = cols - fullX * n;
  const ry = rows - fullY * n;
  const pieces = [];
  if (rx > 0 && fullY > 0) pieces.push({ w: rx, h: n, qty: fullY });
  if (ry > 0 && fullX > 0) pieces.push({ w: n, h: ry, qty: fullX });
  if (rx > 0 && ry > 0) pieces.push({ w: rx, h: ry, qty: 1 });
  return { whole: fullX * fullY, pieces };
}

/**
 * Guillotine packing of rectangular pieces (rotation allowed, the pyramid
 * grid is square) into n × n blocks. Returns one entry per block that has to
 * be cut.
 */
function packPieces(pieces, n) {
  const bins = [];
  const sorted = [...pieces].sort(
    (a, b) => b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h),
  );

  for (const piece of sorted) {
    let best = null;
    for (const bin of bins) {
      bin.free.forEach((rect, index) => {
        for (const rotated of [false, true]) {
          const pw = rotated ? piece.h : piece.w;
          const ph = rotated ? piece.w : piece.h;
          if (pw > rect.w || ph > rect.h) continue;
          const score = Math.min(rect.w - pw, rect.h - ph) * 1000 + (rect.w * rect.h - pw * ph);
          if (!best || score < best.score) best = { bin, index, rect, pw, ph, score };
        }
      });
    }

    if (!best) {
      const bin = { free: [{ x: 0, y: 0, w: n, h: n }], placed: [] };
      bins.push(bin);
      best = { bin, index: 0, rect: bin.free[0], pw: piece.w, ph: piece.h };
    }

    const { bin, index, rect, pw, ph } = best;
    bin.placed.push({ w: pw, h: ph });
    bin.free.splice(index, 1);
    const leftW = rect.w - pw;
    const leftH = rect.h - ph;
    const splitVertically = leftW < leftH;
    const right = splitVertically
      ? { x: rect.x + pw, y: rect.y, w: leftW, h: ph }
      : { x: rect.x + pw, y: rect.y, w: leftW, h: rect.h };
    const below = splitVertically
      ? { x: rect.x, y: rect.y + ph, w: rect.w, h: leftH }
      : { x: rect.x, y: rect.y + ph, w: pw, h: leftH };
    if (right.w > 0 && right.h > 0) bin.free.push(right);
    if (below.w > 0 && below.h > 0) bin.free.push(below);
  }
  return bins;
}

/**
 * Block order for the whole chamber.
 * centralCells / wingCells are panel dimensions in pyramids.
 */
export function planBlocks({
  centralCells,
  wingCells,
  pyramidsPerSide,
  blockSide = 0.5,
  hoods = 2,
  sparePercent = 0,
  panels = null,
}) {
  const n = Math.max(1, Math.round(pyramidsPerSide));
  const pitch = blockSide / n;
  const c = Math.max(0, Math.round(centralCells));
  const w = Math.max(0, Math.round(wingCells));

  const panelTypes = [];
  if (Array.isArray(panels)) {
    // Generalised use (enclosed chamber): caller supplies {name, cols, rows, count}.
    for (const p of panels) {
      const cols = Math.round(p.cols);
      const rows = Math.round(p.rows);
      if (cols > 0 && rows > 0 && p.count > 0) panelTypes.push({ name: p.name, cols, rows, count: p.count });
    }
  } else {
    if (c > 0) panelTypes.push({ name: "Central panel", cols: c, rows: c, count: hoods });
    if (c > 0 && w > 0) panelTypes.push({ name: "Wing", cols: c, rows: w, count: 4 * hoods });
  }

  let wholeBlocks = 0;
  let totalPyramids = 0;
  const pieceMap = new Map();
  const allPieces = [];

  for (const panel of panelTypes) {
    const split = splitPanel(panel.cols, panel.rows, n);
    panel.widthM = panel.cols * pitch;
    panel.heightM = panel.rows * pitch;
    panel.wholePerPanel = split.whole;
    const perPanel = new Map();
    for (const piece of split.pieces) {
      const label = pieceLabel(piece.w, piece.h);
      perPanel.set(label, (perPanel.get(label) ?? 0) + piece.qty);
    }
    panel.piecesPerPanel = [...perPanel].map(([label, qty]) => ({ label, qty }));
    wholeBlocks += split.whole * panel.count;
    totalPyramids += panel.cols * panel.rows * panel.count;

    for (const piece of split.pieces) {
      const key = pieceLabel(piece.w, piece.h);
      const qty = piece.qty * panel.count;
      const entry = pieceMap.get(key) ?? {
        label: key,
        a: Math.min(piece.w, piece.h),
        b: Math.max(piece.w, piece.h),
        qty: 0,
      };
      entry.qty += qty;
      pieceMap.set(key, entry);
      for (let i = 0; i < qty; i += 1) allPieces.push({ w: piece.w, h: piece.h });
    }
  }

  const pieceGroups = [...pieceMap.values()]
    .map((entry) => ({
      ...entry,
      widthCm: entry.a * pitch * 100,
      lengthCm: entry.b * pitch * 100,
    }))
    .sort((x, y) => y.a * y.b - x.a * x.b);

  const bins = packPieces(allPieces, n);
  const cutBlocks = bins.length;
  const piecePyramids = allPieces.reduce((sum, piece) => sum + piece.w * piece.h, 0);
  const scrapPyramids = cutBlocks * n * n - piecePyramids;

  const patternMap = new Map();
  for (const bin of bins) {
    const parts = bin.placed.map((piece) => pieceLabel(piece.w, piece.h)).sort();
    const key = parts.join(" + ");
    const used = bin.placed.reduce((sum, piece) => sum + piece.w * piece.h, 0);
    const entry = patternMap.get(key) ?? { parts, blocks: 0, scrapPyramids: n * n - used };
    entry.blocks += 1;
    patternMap.set(key, entry);
  }
  const cutPatterns = [...patternMap.values()].sort((x, y) => y.blocks - x.blocks);

  const baseBlocks = wholeBlocks + cutBlocks;
  const spareBlocks = Math.ceil(baseBlocks * Math.max(0, sparePercent) / 100 - 1e-9);

  return {
    pyramidsPerSide: n,
    pitch,
    hoods,
    panelTypes,
    totalPyramids,
    wholeBlocks,
    cutBlocks,
    baseBlocks,
    spareBlocks,
    totalBlocks: baseBlocks + spareBlocks,
    pieceGroups,
    cutPatterns,
    scrapPyramids,
    scrapShare: cutBlocks ? scrapPyramids / (cutBlocks * n * n) : 0,
    purchasedPyramids: baseBlocks * n * n,
  };
}
