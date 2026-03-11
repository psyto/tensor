import { describe, it, expect } from "vitest";
import {
  buildVolSurface,
  volSurfaceToOnChain,
  fitVolSurfaceFromOracle,
  DEFAULT_MONEYNESS_NODES,
  DEFAULT_EXPIRY_DAYS,
  DEFAULT_SKEW_MULTIPLIERS,
  DEFAULT_TERM_MULTIPLIERS,
} from "../vol-surface";
import { interpolateVol } from "../greeks";

describe("buildVolSurface", () => {
  it("generates surface with correct dimensions", () => {
    const surface = buildVolSurface(0.30);
    expect(surface.surface).toHaveLength(DEFAULT_TERM_MULTIPLIERS.length);
    expect(surface.surface[0]).toHaveLength(DEFAULT_SKEW_MULTIPLIERS.length);
    expect(surface.moneyness_nodes).toHaveLength(DEFAULT_MONEYNESS_NODES.length);
    expect(surface.expiry_days).toHaveLength(DEFAULT_EXPIRY_DAYS.length);
  });

  it("ATM node at 30d equals input vol", () => {
    const surface = buildVolSurface(0.30);
    // ATM is index 5 (1.0 moneyness), 30d is index 1
    const atmIdx = DEFAULT_MONEYNESS_NODES.indexOf(1.0);
    const thirtyDIdx = DEFAULT_EXPIRY_DAYS.indexOf(30);
    expect(surface.surface[thirtyDIdx][atmIdx]).toBeCloseTo(0.30, 6);
  });

  it("OTM put IV > ATM IV (smile)", () => {
    const surface = buildVolSurface(0.30);
    const atmIdx = DEFAULT_MONEYNESS_NODES.indexOf(1.0);
    const otmPutIdx = DEFAULT_MONEYNESS_NODES.indexOf(0.8);
    // Same expiry bucket
    expect(surface.surface[1][otmPutIdx]).toBeGreaterThan(surface.surface[1][atmIdx]);
  });

  it("short-dated vol > long-dated vol (term structure)", () => {
    const surface = buildVolSurface(0.30);
    const atmIdx = DEFAULT_MONEYNESS_NODES.indexOf(1.0);
    // 7d (index 0) should have higher vol than 180d (index 3)
    expect(surface.surface[0][atmIdx]).toBeGreaterThan(surface.surface[3][atmIdx]);
  });

  it("deep OTM put has the highest vol on the surface", () => {
    const surface = buildVolSurface(0.30);
    // 0.7x moneyness at 7d should be the highest point
    const maxVal = surface.surface[0][0]; // deep OTM put, shortest expiry
    for (const row of surface.surface) {
      for (const val of row) {
        expect(maxVal).toBeGreaterThanOrEqual(val - 0.001);
      }
    }
  });
});

describe("volSurfaceToOnChain", () => {
  it("converts decimal IV to bps", () => {
    const surface = buildVolSurface(0.30);
    const onChain = volSurfaceToOnChain(surface);

    const atmIdx = DEFAULT_MONEYNESS_NODES.indexOf(1.0);
    const thirtyDIdx = DEFAULT_EXPIRY_DAYS.indexOf(30);
    // 0.30 * 10000 = 3000 bps
    expect(onChain.vol_surface[thirtyDIdx][atmIdx]).toBe(3000);
  });

  it("converts moneyness to 1e6 fixed-point", () => {
    const surface = buildVolSurface(0.30);
    const onChain = volSurfaceToOnChain(surface);

    // 1.0 → 1_000_000
    const atmIdx = DEFAULT_MONEYNESS_NODES.indexOf(1.0);
    expect(onChain.moneyness_nodes[atmIdx]).toBe(1_000_000);
    // 0.7 → 700_000
    expect(onChain.moneyness_nodes[0]).toBe(700_000);
  });

  it("pads arrays to fixed size", () => {
    const surface = buildVolSurface(0.30);
    const onChain = volSurfaceToOnChain(surface);

    expect(onChain.vol_surface).toHaveLength(4); // MAX_EXPIRY_BUCKETS
    expect(onChain.vol_surface[0]).toHaveLength(9); // MAX_VOL_NODES
    expect(onChain.moneyness_nodes).toHaveLength(9);
    expect(onChain.expiry_days).toHaveLength(4);
  });

  it("reports correct counts", () => {
    const surface = buildVolSurface(0.30);
    const onChain = volSurfaceToOnChain(surface);

    expect(onChain.node_count).toBe(DEFAULT_MONEYNESS_NODES.length);
    expect(onChain.expiry_count).toBe(DEFAULT_EXPIRY_DAYS.length);
  });
});

describe("fitVolSurfaceFromOracle", () => {
  it("produces valid surface from oracle variance", () => {
    // variance = 900_000_000 bps → sqrt = 30000 → IV = 3.0 (300%)
    // More realistic: variance = 9_000_000 → sqrt = 3000 → IV = 0.30 (30%)
    const result = fitVolSurfaceFromOracle(9_000_000);
    expect(result.node_count).toBe(9);
    expect(result.expiry_count).toBe(4);
    // ATM at 30d should be sqrt(9_000_000) = 3000 bps
    const atmIdx = DEFAULT_MONEYNESS_NODES.indexOf(1.0);
    expect(result.vol_surface[1][atmIdx]).toBe(3000);
  });
});

describe("interpolateVol with generated surface", () => {
  it("returns reasonable IV for ATM option", () => {
    const surface = buildVolSurface(0.30);
    const iv = interpolateVol(surface, 100, 100, 30);
    expect(iv).toBeCloseTo(0.30, 2);
  });

  it("OTM put gets higher IV than ATM", () => {
    const surface = buildVolSurface(0.30);
    const atmIv = interpolateVol(surface, 100, 100, 30);
    const otmIv = interpolateVol(surface, 80, 100, 30); // 0.8 moneyness
    expect(otmIv).toBeGreaterThan(atmIv);
  });

  it("interpolates between moneyness nodes", () => {
    const surface = buildVolSurface(0.30);
    const iv95 = interpolateVol(surface, 95, 100, 30); // 0.95 moneyness
    const iv100 = interpolateVol(surface, 100, 100, 30); // 1.0 moneyness
    const iv90 = interpolateVol(surface, 90, 100, 30); // 0.9 moneyness
    // 0.95 should be between 0.9 and 1.0
    expect(iv95).toBeGreaterThan(iv100);
    expect(iv95).toBeLessThan(iv90);
  });
});
