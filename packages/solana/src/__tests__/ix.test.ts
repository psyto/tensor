import { describe, it, expect } from "vitest";
import {
  anchorDiscriminator,
  settleAuctionIx,
  computeMarginIx,
  updateVolSurfaceIx,
  type UpdateVolSurfaceParams,
} from "../ix.js";
import { PublicKey } from "@solana/web3.js";

describe("anchorDiscriminator", () => {
  it("produces 8-byte discriminator", () => {
    const disc = anchorDiscriminator("settle_auction");
    expect(disc.length).toBe(8);
  });

  it("is deterministic", () => {
    const a = anchorDiscriminator("settle_auction");
    const b = anchorDiscriminator("settle_auction");
    expect(a.equals(b)).toBe(true);
  });

  it("differs for different instructions", () => {
    const a = anchorDiscriminator("settle_auction");
    const b = anchorDiscriminator("compute_margin");
    expect(a.equals(b)).toBe(false);
  });
});

describe("settleAuctionIx", () => {
  it("creates valid instruction", () => {
    const intent = PublicKey.unique();
    const programId = PublicKey.unique();
    const ix = settleAuctionIx(intent, programId);
    expect(ix.programId.equals(programId)).toBe(true);
    expect(ix.keys).toHaveLength(1);
    expect(ix.keys[0].pubkey.equals(intent)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(false);
    expect(ix.keys[0].isWritable).toBe(true);
  });

  it("data starts with settle_auction discriminator", () => {
    const ix = settleAuctionIx(PublicKey.unique(), PublicKey.unique());
    const expected = anchorDiscriminator("settle_auction");
    expect(Buffer.from(ix.data).subarray(0, 8).equals(expected)).toBe(true);
  });

  it("data is exactly 8 bytes (discriminator only)", () => {
    const ix = settleAuctionIx(PublicKey.unique(), PublicKey.unique());
    expect(ix.data.length).toBe(8);
  });
});

describe("computeMarginIx", () => {
  it("includes margin, config, and market accounts", () => {
    const margin = PublicKey.unique();
    const config = PublicKey.unique();
    const market1 = PublicKey.unique();
    const market2 = PublicKey.unique();
    const programId = PublicKey.unique();
    const ix = computeMarginIx(margin, config, [market1, market2], programId);

    expect(ix.keys).toHaveLength(4); // margin + config + 2 markets
    expect(ix.keys[0].pubkey.equals(margin)).toBe(true);
    expect(ix.keys[0].isWritable).toBe(true);
    expect(ix.keys[1].pubkey.equals(config)).toBe(true);
    expect(ix.keys[1].isWritable).toBe(false);
    expect(ix.keys[2].pubkey.equals(market1)).toBe(true);
    expect(ix.keys[3].pubkey.equals(market2)).toBe(true);
  });

  it("works with zero market accounts", () => {
    const ix = computeMarginIx(
      PublicKey.unique(),
      PublicKey.unique(),
      [],
      PublicKey.unique(),
    );
    expect(ix.keys).toHaveLength(2); // margin + config only
  });

  it("data starts with compute_margin discriminator", () => {
    const ix = computeMarginIx(
      PublicKey.unique(),
      PublicKey.unique(),
      [],
      PublicKey.unique(),
    );
    const expected = anchorDiscriminator("compute_margin");
    expect(Buffer.from(ix.data).subarray(0, 8).equals(expected)).toBe(true);
  });
});

describe("updateVolSurfaceIx", () => {
  const makeParams = (): UpdateVolSurfaceParams => ({
    vol_surface: [
      [100, 200, 300, 400, 500, 600, 700, 800, 900],
      [110, 210, 310, 410, 510, 610, 710, 810, 910],
      [120, 220, 320, 420, 520, 620, 720, 820, 920],
      [130, 230, 330, 430, 530, 630, 730, 830, 930],
    ],
    moneyness_nodes: [800000, 850000, 900000, 950000, 1000000, 1050000, 1100000, 1150000, 1200000],
    expiry_days: [7, 14, 30, 90],
    node_count: 9,
    expiry_count: 4,
  });

  it("creates instruction with 3 accounts", () => {
    const market = PublicKey.unique();
    const config = PublicKey.unique();
    const authority = PublicKey.unique();
    const programId = PublicKey.unique();
    const ix = updateVolSurfaceIx(market, config, authority, makeParams(), programId);

    expect(ix.keys).toHaveLength(3);
    expect(ix.keys[0].isWritable).toBe(true);
    expect(ix.keys[2].isSigner).toBe(true);
  });

  it("data starts with update_vol_surface discriminator", () => {
    const ix = updateVolSurfaceIx(
      PublicKey.unique(),
      PublicKey.unique(),
      PublicKey.unique(),
      makeParams(),
      PublicKey.unique(),
    );
    const expected = anchorDiscriminator("update_vol_surface");
    expect(Buffer.from(ix.data).subarray(0, 8).equals(expected)).toBe(true);
  });

  it("data has correct total length", () => {
    const ix = updateVolSurfaceIx(
      PublicKey.unique(),
      PublicKey.unique(),
      PublicKey.unique(),
      makeParams(),
      PublicKey.unique(),
    );
    // 8 (disc) + 4*9*4 (vol) + 9*4 (moneyness) + 4*4 (expiry) + 1 + 1 = 8 + 144 + 36 + 16 + 2 = 206
    expect(ix.data.length).toBe(206);
  });
});
