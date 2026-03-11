import { describe, it, expect } from "vitest";
import { buildVolSurfaceParams, buildVolSurfaceFromAtmVol } from "../vol-keeper";

describe("buildVolSurfaceParams", () => {
  it("produces correct dimensions from oracle variance", () => {
    // variance = 9_000_000 bps -> sqrt = 3000 -> IV = 0.30
    const params = buildVolSurfaceParams(9_000_000);
    expect(params.node_count).toBe(9);
    expect(params.expiry_count).toBe(4);
    expect(params.vol_surface).toHaveLength(4);
    expect(params.vol_surface[0]).toHaveLength(9);
  });

  it("ATM 30d vol matches input", () => {
    const params = buildVolSurfaceParams(9_000_000);
    // ATM index for 1.0 moneyness = index 5, 30d = index 1
    expect(params.vol_surface[1][5]).toBe(3000); // 30% = 3000 bps
  });

  it("OTM put has higher vol than ATM", () => {
    const params = buildVolSurfaceParams(9_000_000);
    // moneyness 0.7 at index 0, ATM at index 5, same expiry row
    expect(params.vol_surface[1][0]).toBeGreaterThan(params.vol_surface[1][5]);
  });

  it("short-dated ATM vol exceeds long-dated ATM vol", () => {
    const params = buildVolSurfaceParams(9_000_000);
    // 7d (row 0) ATM should be > 180d (row 3) ATM
    expect(params.vol_surface[0][5]).toBeGreaterThan(params.vol_surface[3][5]);
  });

  it("zero variance produces zero surface", () => {
    const params = buildVolSurfaceParams(0);
    for (const row of params.vol_surface) {
      for (const val of row) {
        expect(val).toBe(0);
      }
    }
  });
});

describe("buildVolSurfaceFromAtmVol", () => {
  it("converts decimal vol to bps surface", () => {
    const params = buildVolSurfaceFromAtmVol(0.30);
    expect(params.vol_surface[1][5]).toBe(3000); // ATM 30d
    expect(params.moneyness_nodes[5]).toBe(1_000_000); // 1.0 in 1e6
  });

  it("produces correct dimensions", () => {
    const params = buildVolSurfaceFromAtmVol(0.50);
    expect(params.node_count).toBe(9);
    expect(params.expiry_count).toBe(4);
    expect(params.vol_surface).toHaveLength(4);
    expect(params.vol_surface[0]).toHaveLength(9);
  });

  it("higher input vol produces proportionally higher surface", () => {
    const params30 = buildVolSurfaceFromAtmVol(0.30);
    const params60 = buildVolSurfaceFromAtmVol(0.60);
    // ATM 30d should be exactly 2x
    expect(params60.vol_surface[1][5]).toBe(params30.vol_surface[1][5] * 2);
  });

  it("moneyness nodes cover expected range", () => {
    const params = buildVolSurfaceFromAtmVol(0.30);
    expect(params.moneyness_nodes[0]).toBe(700_000); // 0.7
    expect(params.moneyness_nodes[8]).toBe(1_200_000); // 1.2
  });

  it("expiry days match defaults", () => {
    const params = buildVolSurfaceFromAtmVol(0.30);
    expect(params.expiry_days[0]).toBe(7);
    expect(params.expiry_days[1]).toBe(30);
    expect(params.expiry_days[2]).toBe(90);
    expect(params.expiry_days[3]).toBe(180);
  });
});
