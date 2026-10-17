import { farFieldDistance, planBlocks } from "./core.js?v=20261017-2";

export const CHAMBER_DEFAULTS = Object.freeze({
  sizeMode: "auto", // "auto" | "fixed"
  separation: 0.75,
  apertureDiameter: 0.20,
  maxFrequencyGhz: 2.29,
  apertureClearance: 0.20,
  rearClearance: 0.20,
  blockSide: 0.50,
  pyramidsPerSide: null, // deliberately unset: pitch is never assumed
  pyramidHeight: 0.20,
  boardThickness: 0.016,
  stepMode: "pyramid",
  sparePercent: 0,
  blockPrice: 0,
  fixedExternalLength: 1.60,
  fixedExternalSide: 0.90,
});

export const SEPARATION_MIN = 0.1;
export const SEPARATION_MAX = 2.0;
export const BEAM_HALF_ANGLE_DEG = 66;
const TOL = 1e-9;

const num = (v) => (v === null || v === "" || v === undefined ? NaN : Number(v));

/** Round up to the next multiple of step; tolerance only absorbs float noise. */
export function snapUp(value, step) {
  return Math.ceil(value / step - TOL) * step;
}

/** R_FF = 2D²/λ without rounding, plus whether it fits the permitted range. */
export function farFieldStatus(apertureDiameter, frequencyGhz, separation) {
  const { distance, wavelength } = farFieldDistance(apertureDiameter, frequencyGhz);
  return {
    distance,
    wavelength,
    exceedsMaximum: distance > SEPARATION_MAX + TOL,
    passes: separation + TOL >= distance,
  };
}

/** Value for the "Set to far-field limit" button: exact, never clamped. */
export function farFieldSeparation(apertureDiameter, frequencyGhz) {
  const s = farFieldStatus(apertureDiameter, frequencyGhz, 0);
  return { value: s.distance, exceedsMaximum: s.exceedsMaximum };
}

export function calculateChamber(input = {}) {
  const s = { ...CHAMBER_DEFAULTS, ...input };
  const errors = [];
  const warnings = [];

  const N = num(s.pyramidsPerSide);
  if (!Number.isInteger(N) || N < 1) {
    errors.push("Enter the number of pyramids per block side (a positive whole number). No result is shown until it is set.");
  }
  const B = num(s.blockSide), D = num(s.apertureDiameter), R = num(s.separation);
  const g = num(s.apertureClearance), e = num(s.rearClearance), h = num(s.pyramidHeight);
  const t = num(s.boardThickness), f = num(s.maxFrequencyGhz);
  for (const [label, v, min] of [["Block side", B, 0], ["Aperture diameter", D, 0], ["Pyramid height", h, 0], ["Highest frequency", f, 0]]) {
    if (!(v > min)) errors.push(`${label} must be greater than zero.`);
  }
  for (const [label, v] of [["Aperture clearance", g], ["Rear clearance", e], ["Board thickness", t]]) {
    if (!(v >= 0)) errors.push(`${label} must be zero or greater.`);
  }
  if (!Number.isFinite(R) || R < SEPARATION_MIN - TOL || R > SEPARATION_MAX + TOL) {
    errors.push(`Antenna separation must be between ${SEPARATION_MIN} and ${SEPARATION_MAX} m.`);
  }
  if (errors.length) return { valid: false, errors, warnings };

  const pitch = B / N;
  const step = s.stepMode === "block" ? B : pitch;
  const ff = farFieldStatus(D, f, R);
  if (ff.exceedsMaximum) {
    warnings.push(`The far-field limit 2D²/λ = ${ff.distance.toFixed(2)} m exceeds the ${SEPARATION_MAX.toFixed(1)} m maximum separation. It has not been clamped.`);
  } else if (!ff.passes) {
    warnings.push(`Separation ${R.toFixed(3)} m is below the far-field limit ${ff.distance.toFixed(3)} m.`);
  }

  let Sb, Lb, requested = null;
  if (s.sizeMode === "fixed") {
    const Se = num(s.fixedExternalSide), Le = num(s.fixedExternalLength);
    if (!(Se > 0) || !(Le > 0)) return { valid: false, errors: ["Enter positive external length and side."], warnings };
    Sb = Se - 2 * t;
    Lb = Le - 2 * t;
  } else {
    requested = { clearSide: D + 2 * g, backingSideRaw: D + 2 * g + 2 * h, backingLengthRaw: R + 2 * e + 2 * h };
    Sb = snapUp(requested.backingSideRaw, step);
    Lb = snapUp(requested.backingLengthRaw, step);
  }

  const Sc = Sb - 2 * h, Lc = Lb - 2 * h;
  const Se = Sb + 2 * t, Le = Lb + 2 * t;
  const gActual = (Sc - D) / 2, eActual = (Lc - R) / 2;

  if (s.sizeMode === "fixed") {
    if (Sb <= 0 || Lb <= 0) errors.push("An external dimension is too small to contain the two boards.");
    else if (Sc <= 0 || Lc <= 0) errors.push("An external dimension is too small to contain the boards and the absorber layers.");
    if (Sc > 0 && Sc < D) errors.push("The clear cross-section is smaller than the antenna aperture.");
    if (Lc > 0 && Lc < R) errors.push("The antenna separation does not physically fit in the clear length.");
    if (Sc > 0 && gActual < g - TOL) errors.push(`Radial clearance ${gActual.toFixed(3)} m is below the requested ${g.toFixed(3)} m.`);
    if (Lc > 0 && eActual < e - TOL) errors.push(`Rear clearance ${eActual.toFixed(3)} m is below the requested ${e.toFixed(3)} m.`);
  }
  const dims = {
    pitch, step, backingSide: Sb, backingLength: Lb, clearSide: Sc, clearLength: Lc,
    externalSide: Se, externalLength: Le, apertureClearance: gActual, rearClearance: eActual,
    phaseToBacking: eActual + h,
  };
  if (errors.length || Sb <= 0 || Lb <= 0 || Sc <= 0 || Lc <= 0) {
    return { valid: false, errors, warnings, requested, dims, farField: ff };
  }

  // Six faces: 2 square ends + 4 identical longitudinal faces. A hidden/cut-away
  // wall in the 3D view is still one of the four and is always counted.
  const absorberArea = 2 * Sb * Sb + 4 * Lb * Sb;
  const woodArea = 2 * Se * Se + 4 * Le * Se;
  const cells = (len) => Math.ceil(len / pitch - TOL);
  const spare = Math.max(0, num(s.sparePercent) || 0);
  const plan = planBlocks({
    pyramidsPerSide: N,
    blockSide: B,
    sparePercent: spare,
    panels: [
      { name: "End panels", cols: cells(Sb), rows: cells(Sb), count: 2 },
      { name: "Longitudinal panels", cols: cells(Lb), rows: cells(Sb), count: 4 },
    ],
  });
  const price = Math.max(0, num(s.blockPrice) || 0);
  return {
    valid: true, errors, warnings, requested, dims, farField: ff, plan,
    areas: { absorber: absorberArea, wood: woodArea },
    wood: { endPanels: 2, longitudinalPanels: 4, totalPanels: 6, thickness: t },
    cost: price > 0 ? plan.totalBlocks * price : null,
    recommendation: s.sizeMode === "auto" ? "Smallest chamber" : null,
  };
}
