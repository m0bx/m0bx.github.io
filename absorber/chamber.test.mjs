import assert from "node:assert/strict";
import { calculateChamber as C, farFieldSeparation } from "./chamber.js?v=20261017-1";
import * as now from "./core.js?v=20261017-1";
import * as old from "/tmp/core_orig.mjs";

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);

// 1. Open-panel regression: identical designs and block plans for defaults.
const A = now.generateDesigns({}), O = old.generateDesigns({});
assert.deepEqual(A.designs, O.designs);
const d = now.recommendedDesigns(A.designs)[0];
const args = { centralCells: d.centralCells, wingCells: d.wingCells, pyramidsPerSide: 10, blockSide: 0.5, hoods: 2, sparePercent: 5 };
assert.deepEqual(now.planBlocks(args), old.planBlocks(args));

// Missing / invalid N
for (const n of [null, "", 0, 2.5, -3]) assert.equal(C({ pyramidsPerSide: n }).valid, false);

// 2/3/4. Snapping goes up, follows N, uses B/N (no 50 mm constant)
let r = C({ pyramidsPerSide: 10 });
near(r.dims.pitch, 0.05, "pitch N=10"); near(r.dims.backingSide, 1.0, "S"); near(r.dims.backingLength, 1.55, "L");
near(r.dims.externalSide, 1.032, "Sext"); near(r.dims.externalLength, 1.582, "Lext");
r = C({ pyramidsPerSide: 8 });
near(r.dims.pitch, 0.0625, "pitch N=8"); near(r.dims.backingLength, 1.5625, "L N=8 snapped up");
for (const N of [3, 7, 8, 10, 13]) for (const R of [0.37, 0.75, 1.234]) for (const stepMode of ["pyramid", "block"]) {
  const x = C({ pyramidsPerSide: N, separation: R, stepMode });
  assert.ok(x.dims.backingSide >= x.requested.backingSideRaw - 1e-9 && x.dims.backingLength >= x.requested.backingLengthRaw - 1e-9);
  assert.ok(x.dims.apertureClearance >= 0.2 - 1e-9 && x.dims.rearClearance >= 0.2 - 1e-9);
}
r = C({ pyramidsPerSide: 10, stepMode: "block" });
near(r.dims.backingLength, 2.0, "block step L");

// 5. Fixed mode reports invalid clearances, never clamps
r = C({ pyramidsPerSide: 10, sizeMode: "fixed", fixedExternalSide: 0.7, fixedExternalLength: 1.2 });
assert.equal(r.valid, false); assert.ok(r.errors.length >= 2); console.log(r.errors);
assert.equal(C({ pyramidsPerSide: 10, sizeMode: "fixed", fixedExternalSide: 0.3, fixedExternalLength: 1.2 }).valid, false);
assert.equal(C({ pyramidsPerSide: 10, sizeMode: "fixed", fixedExternalSide: 1.032, fixedExternalLength: 1.582 }).valid, true);

// 6/7. Far-field uses current D and f, unrounded; >2 m warns and is not clamped
const ff = farFieldSeparation(0.2, 2.29); near(ff.value, 2 * 0.04 / (299792458 / 2.29e9), "FF");
const big = farFieldSeparation(0.8, 2.29); assert.ok(big.value > 2 && big.exceedsMaximum);
r = C({ pyramidsPerSide: 10, apertureDiameter: 0.8 });
assert.ok(r.warnings.some((w) => /exceeds/.test(w)));

// 8. Exactly 2 end faces + 4 identical longitudinal faces; area formula
r = C({ pyramidsPerSide: 10, sparePercent: 10, blockPrice: 100 });
const [ends, lon] = r.plan.panelTypes;
assert.deepEqual([ends.name, ends.count, lon.name, lon.count], ["End panels", 2, "Longitudinal panels", 4]);
near(r.areas.absorber, 2 * 1.0 ** 2 + 4 * 1.55 * 1.0, "area");
near(r.areas.wood, 2 * 1.032 ** 2 + 4 * 1.582 * 1.032, "wood");
// 9. spare % and price propagate
assert.ok(r.plan.spareBlocks > 0); assert.equal(r.cost, r.plan.totalBlocks * 100);
console.log({ blocks: r.plan.totalBlocks, whole: r.plan.wholeBlocks, cut: r.plan.cutBlocks, scrapPyramids: r.plan.scrapPyramids });
console.log("grep 0.05/50 mm in chamber.js:", /0\.05\b|50\s*mm/.test((await import("node:fs")).readFileSync(new URL("./chamber.js", import.meta.url), "utf8")) ? "FOUND" : "none");
console.log("ALL CHECKS PASSED");
