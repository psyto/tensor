import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  BorshReader,
  decodeMarginMarket,
  decodeSolverRegistry,
  decodeIntentAccount,
} from "../decoder.js";
import { IntentStatus, IntentType, ProductType } from "../accounts.js";

// ── Helpers ─────────────────────────────────────────────────────

/** Write Anchor discriminator (8 zero bytes for testing) */
function writeDiscriminator(buf: Buffer, offset: number): number {
  // Use zeros as discriminator for tests
  buf.fill(0, offset, offset + 8);
  return offset + 8;
}

/** Write a pubkey (32 bytes) at offset, return new offset */
function writePubkey(buf: Buffer, offset: number, pk: PublicKey): number {
  pk.toBuffer().copy(buf, offset);
  return offset + 32;
}

/** Write a borsh string (u32 len + utf8 bytes) at offset, return new offset */
function writeBorshString(buf: Buffer, offset: number, str: string): number {
  const bytes = Buffer.from(str, "utf8");
  buf.writeUInt32LE(bytes.length, offset);
  offset += 4;
  bytes.copy(buf, offset);
  return offset + bytes.length;
}

// ── BorshReader u128/i128 ───────────────────────────────────────

describe("BorshReader u128/i128", () => {
  it("reads u128 from two halves", () => {
    const buf = Buffer.alloc(16);
    buf.writeBigUInt64LE(42n, 0); // lo
    buf.writeBigUInt64LE(1n, 8);  // hi
    const r = new BorshReader(buf);
    const val = r.u128();
    // (1 << 64) + 42 = 18446744073709551616 + 42
    expect(val).toBe((1n << 64n) | 42n);
  });

  it("reads i128 with negative high half", () => {
    const buf = Buffer.alloc(16);
    buf.writeBigUInt64LE(0n, 0);   // lo
    buf.writeBigInt64LE(-1n, 8);   // hi = -1 (all bits set)
    const r = new BorshReader(buf);
    const val = r.i128();
    // -1 << 64 = -18446744073709551616
    expect(val).toBe(-1n << 64n);
  });

  it("reads u128 zero", () => {
    const buf = Buffer.alloc(16);
    const r = new BorshReader(buf);
    expect(r.u128()).toBe(0n);
  });
});

// ── decodeMarginMarket ──────────────────────────────────────────

describe("decodeMarginMarket", () => {
  it("decodes market with vol surface", () => {
    const symbol = "SOL-PERP";
    const baseMint = PublicKey.unique();
    const oracle = PublicKey.unique();
    const varianceTracker = PublicKey.unique();

    // Calculate buffer size:
    // 8 (disc) + 2 (index) + (4 + symbol.length) (string) + 32*3 (pubkeys) +
    // 4 (bools) + 8*3 (margin fields) + 8*3 (mark/vol/funding) + 16 (i128) +
    // 8 (lastFunding) + 8*2 (OI) + 16 (totalVolume) + 1 (isActive) +
    // 8*2 (gamma) + 8*36 (volSurface) + 8*9 (moneyness) + 2*4 (expiryDays) +
    // 1 + 1 + 1 (counts + bump)
    const size = 8 + 2 + (4 + symbol.length) + 32 * 3 + 4 + 8 * 3 + 8 * 3 + 16 +
      8 + 8 * 2 + 16 + 1 + 8 * 2 + 8 * 36 + 8 * 9 + 2 * 4 + 1 + 1 + 1;
    const buf = Buffer.alloc(size);
    let off = 0;

    // Discriminator
    off = writeDiscriminator(buf, off); // 8

    // index
    buf.writeUInt16LE(3, off); off += 2;

    // symbol (borsh string)
    off = writeBorshString(buf, off, symbol);

    // baseMint, oracle, varianceTracker
    off = writePubkey(buf, off, baseMint);
    off = writePubkey(buf, off, oracle);
    off = writePubkey(buf, off, varianceTracker);

    // bools: spotEnabled, perpEnabled, optionsEnabled, lendingEnabled
    buf.writeUInt8(1, off); off += 1; // spotEnabled = true
    buf.writeUInt8(1, off); off += 1; // perpEnabled = true
    buf.writeUInt8(0, off); off += 1; // optionsEnabled = false
    buf.writeUInt8(0, off); off += 1; // lendingEnabled = false

    // initialMarginBps, maintenanceRatioBps, maxPositionSize
    buf.writeBigUInt64LE(500n, off); off += 8;
    buf.writeBigUInt64LE(250n, off); off += 8;
    buf.writeBigUInt64LE(1000000n, off); off += 8;

    // markPrice, impliedVolBps, fundingRateBps
    buf.writeBigUInt64LE(150_000_000n, off); off += 8; // markPrice
    buf.writeBigUInt64LE(3000n, off); off += 8;         // impliedVolBps
    buf.writeBigInt64LE(-50n, off); off += 8;           // fundingRateBps

    // cumulativeFundingIndex (i128) — write as two halves
    buf.writeBigUInt64LE(12345n, off); off += 8;  // lo
    buf.writeBigInt64LE(0n, off); off += 8;       // hi

    // lastFundingUpdate
    buf.writeBigInt64LE(1700000000n, off); off += 8;

    // openInterestLong, openInterestShort
    buf.writeBigUInt64LE(50000n, off); off += 8;
    buf.writeBigUInt64LE(48000n, off); off += 8;

    // totalVolume (u128)
    buf.writeBigUInt64LE(999999n, off); off += 8;
    buf.writeBigUInt64LE(0n, off); off += 8;

    // isActive
    buf.writeUInt8(1, off); off += 1;

    // aggregateGammaLong, aggregateGammaShort
    buf.writeBigInt64LE(100n, off); off += 8;
    buf.writeBigInt64LE(-50n, off); off += 8;

    // vol_surface: [[u64; 9]; 4] — fill with incrementing values
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 9; col++) {
        const val = BigInt(row * 100 + col * 10 + 1000);
        buf.writeBigUInt64LE(val, off); off += 8;
      }
    }

    // vol_moneyness_nodes: [u64; 9]
    const moneynessValues = [700000n, 750000n, 800000n, 850000n, 900000n, 950000n, 1000000n, 1050000n, 1100000n];
    for (const val of moneynessValues) {
      buf.writeBigUInt64LE(val, off); off += 8;
    }

    // vol_expiry_days: [u16; 4]
    const expiryValues = [7, 14, 30, 90];
    for (const val of expiryValues) {
      buf.writeUInt16LE(val, off); off += 2;
    }

    // volNodeCount, volExpiryCount, bump
    buf.writeUInt8(9, off); off += 1;
    buf.writeUInt8(4, off); off += 1;
    buf.writeUInt8(254, off); off += 1;

    // Decode
    const market = decodeMarginMarket(buf);

    expect(market.index).toBe(3);
    expect(market.symbol).toBe("SOL-PERP");
    expect(market.baseMint.equals(baseMint)).toBe(true);
    expect(market.oracle.equals(oracle)).toBe(true);
    expect(market.varianceTracker.equals(varianceTracker)).toBe(true);
    expect(market.spotEnabled).toBe(true);
    expect(market.perpEnabled).toBe(true);
    expect(market.optionsEnabled).toBe(false);
    expect(market.lendingEnabled).toBe(false);
    expect(market.initialMarginBps).toBe(500n);
    expect(market.maintenanceRatioBps).toBe(250n);
    expect(market.maxPositionSize).toBe(1000000n);
    expect(market.markPrice).toBe(150_000_000n);
    expect(market.impliedVolBps).toBe(3000n);
    expect(market.fundingRateBps).toBe(-50n);
    expect(market.cumulativeFundingIndex).toBe(12345n);
    expect(market.lastFundingUpdate).toBe(1700000000n);
    expect(market.openInterestLong).toBe(50000n);
    expect(market.openInterestShort).toBe(48000n);
    expect(market.totalVolume).toBe(999999n);
    expect(market.isActive).toBe(true);
    expect(market.aggregateGammaLong).toBe(100n);
    expect(market.aggregateGammaShort).toBe(-50n);

    // Vol surface check
    expect(market.volSurface).toHaveLength(4);
    expect(market.volSurface[0]).toHaveLength(9);
    expect(market.volSurface[0][0]).toBe(1000n);
    expect(market.volSurface[0][1]).toBe(1010n);
    expect(market.volSurface[3][8]).toBe(1380n);

    // Moneyness nodes
    expect(market.volMoneynessNodes).toHaveLength(9);
    expect(market.volMoneynessNodes[0]).toBe(700000n);
    expect(market.volMoneynessNodes[6]).toBe(1000000n);

    // Expiry days
    expect(market.volExpiryDays).toEqual([7, 14, 30, 90]);

    expect(market.volNodeCount).toBe(9);
    expect(market.volExpiryCount).toBe(4);
    expect(market.bump).toBe(254);
  });
});

// ── decodeSolverRegistry ────────────────────────────────────────

describe("decodeSolverRegistry", () => {
  it("decodes registry with 2 active solvers", () => {
    const authority = PublicKey.unique();
    const solver1 = PublicKey.unique();
    const solver2 = PublicKey.unique();

    // SolverEntry size: 32 + 8 + 8 + 16 + 2 + 1 + 8 = 75 bytes
    const SOLVER_ENTRY_SIZE = 75;
    const size = 8 + 32 + (16 * SOLVER_ENTRY_SIZE) + 1 + 1;
    const buf = Buffer.alloc(size);
    let off = 0;

    off = writeDiscriminator(buf, off);
    off = writePubkey(buf, off, authority);

    // Write 16 solver entries (first 2 active, rest zeroed)
    for (let i = 0; i < 16; i++) {
      if (i === 0) {
        off = writePubkey(buf, off, solver1);
        buf.writeBigUInt64LE(1000n, off); off += 8;   // stake
        buf.writeBigUInt64LE(50n, off); off += 8;      // totalFills
        buf.writeBigUInt64LE(500000n, off); off += 8;  // totalVolume lo
        buf.writeBigUInt64LE(0n, off); off += 8;       // totalVolume hi
        buf.writeUInt16LE(0, off); off += 2;           // slashCount
        buf.writeUInt8(1, off); off += 1;              // isActive
        buf.writeBigInt64LE(1700000000n, off); off += 8; // registeredAt
      } else if (i === 1) {
        off = writePubkey(buf, off, solver2);
        buf.writeBigUInt64LE(2000n, off); off += 8;
        buf.writeBigUInt64LE(100n, off); off += 8;
        buf.writeBigUInt64LE(1000000n, off); off += 8;
        buf.writeBigUInt64LE(0n, off); off += 8;
        buf.writeUInt16LE(1, off); off += 2;
        buf.writeUInt8(1, off); off += 1;
        buf.writeBigInt64LE(1700001000n, off); off += 8;
      } else {
        // Zero-fill the rest
        off += SOLVER_ENTRY_SIZE;
      }
    }

    buf.writeUInt8(2, off); off += 1;   // solverCount
    buf.writeUInt8(253, off); off += 1;  // bump

    const registry = decodeSolverRegistry(buf);

    expect(registry.authority.equals(authority)).toBe(true);
    expect(registry.solverCount).toBe(2);
    expect(registry.bump).toBe(253);
    expect(registry.solvers).toHaveLength(16);

    // Solver 1
    expect(registry.solvers[0].solver.equals(solver1)).toBe(true);
    expect(registry.solvers[0].stake).toBe(1000n);
    expect(registry.solvers[0].totalFills).toBe(50n);
    expect(registry.solvers[0].totalVolume).toBe(500000n);
    expect(registry.solvers[0].slashCount).toBe(0);
    expect(registry.solvers[0].isActive).toBe(true);
    expect(registry.solvers[0].registeredAt).toBe(1700000000n);

    // Solver 2
    expect(registry.solvers[1].solver.equals(solver2)).toBe(true);
    expect(registry.solvers[1].stake).toBe(2000n);
    expect(registry.solvers[1].totalFills).toBe(100n);
    expect(registry.solvers[1].totalVolume).toBe(1000000n);
    expect(registry.solvers[1].slashCount).toBe(1);
    expect(registry.solvers[1].isActive).toBe(true);

    // Inactive solver slot
    expect(registry.solvers[2].isActive).toBe(false);
    expect(registry.solvers[2].stake).toBe(0n);
  });
});

// ── decodeIntentAccount ─────────────────────────────────────────

describe("decodeIntentAccount", () => {
  it("decodes intent with bids and auction data", () => {
    const marginAccount = PublicKey.unique();
    const winningSolver = PublicKey.unique();
    const bidder1 = PublicKey.unique();
    const bidder2 = PublicKey.unique();

    // IntentLeg size: 1 + 2 + 8 + 8 + 1 = 20 bytes
    const LEG_SIZE = 20;
    // SolverBid size: 32 + 8 + 8 + 1 = 49 bytes
    const BID_SIZE = 49;

    const size = 8 + 32 + 8 + 1 + 1 + (4 * LEG_SIZE) + 1 + 1 + 2 + 2 + 8 + 8 + 8 + 8 + 8 +
      (8 * BID_SIZE) + 1 + 8 + 32 + 1;
    const buf = Buffer.alloc(size);
    let off = 0;

    off = writeDiscriminator(buf, off);
    off = writePubkey(buf, off, marginAccount);

    // intentId
    buf.writeBigUInt64LE(42n, off); off += 8;
    // intentType
    buf.writeUInt8(IntentType.RFQ, off); off += 1;
    // status
    buf.writeUInt8(IntentStatus.PartiallyFilled, off); off += 1;

    // 4 legs (first 2 active)
    for (let i = 0; i < 4; i++) {
      if (i < 2) {
        buf.writeUInt8(i === 0 ? ProductType.Perpetual : ProductType.Option, off); off += 1;
        buf.writeUInt16LE(i, off); off += 2;
        buf.writeBigInt64LE(BigInt(1000 * (i + 1)), off); off += 8;
        buf.writeBigUInt64LE(BigInt(50000 * (i + 1)), off); off += 8;
        buf.writeUInt8(1, off); off += 1; // isActive
      } else {
        off += LEG_SIZE;
      }
    }

    // legCount, filledLegs
    buf.writeUInt8(2, off); off += 1;
    buf.writeUInt8(1, off); off += 1;

    // maxSlippageBps, minFillRatioBps
    buf.writeUInt16LE(100, off); off += 2;
    buf.writeUInt16LE(5000, off); off += 2;

    // deadline
    buf.writeBigInt64LE(1700050000n, off); off += 8;

    // maxTotalCost, totalMarginUsed
    buf.writeBigUInt64LE(10000000n, off); off += 8;
    buf.writeBigUInt64LE(5000000n, off); off += 8;

    // createdAt, updatedAt
    buf.writeBigInt64LE(1700000000n, off); off += 8;
    buf.writeBigInt64LE(1700001000n, off); off += 8;

    // 8 bids (first 2 active)
    for (let i = 0; i < 8; i++) {
      if (i === 0) {
        off = writePubkey(buf, off, bidder1);
        buf.writeBigUInt64LE(49500n, off); off += 8;
        buf.writeBigInt64LE(1700000500n, off); off += 8;
        buf.writeUInt8(1, off); off += 1;
      } else if (i === 1) {
        off = writePubkey(buf, off, bidder2);
        buf.writeBigUInt64LE(49800n, off); off += 8;
        buf.writeBigInt64LE(1700000600n, off); off += 8;
        buf.writeUInt8(1, off); off += 1;
      } else {
        off += BID_SIZE;
      }
    }

    // bidCount
    buf.writeUInt8(2, off); off += 1;

    // auctionEnd
    buf.writeBigInt64LE(1700002000n, off); off += 8;

    // winningSolver
    off = writePubkey(buf, off, winningSolver);

    // bump
    buf.writeUInt8(252, off); off += 1;

    // Decode
    const intent = decodeIntentAccount(buf);

    expect(intent.marginAccount.equals(marginAccount)).toBe(true);
    expect(intent.intentId).toBe(42n);
    expect(intent.intentType).toBe(IntentType.RFQ);
    expect(intent.status).toBe(IntentStatus.PartiallyFilled);

    // Legs
    expect(intent.legs).toHaveLength(4);
    expect(intent.legCount).toBe(2);
    expect(intent.legs[0].productType).toBe(ProductType.Perpetual);
    expect(intent.legs[0].marketIndex).toBe(0);
    expect(intent.legs[0].size).toBe(1000n);
    expect(intent.legs[0].limitPrice).toBe(50000n);
    expect(intent.legs[0].isActive).toBe(true);
    expect(intent.legs[1].productType).toBe(ProductType.Option);
    expect(intent.legs[1].size).toBe(2000n);
    expect(intent.legs[2].isActive).toBe(false);

    expect(intent.filledLegs).toBe(1);
    expect(intent.maxSlippageBps).toBe(100);
    expect(intent.minFillRatioBps).toBe(5000);
    expect(intent.deadline).toBe(1700050000n);
    expect(intent.maxTotalCost).toBe(10000000n);
    expect(intent.totalMarginUsed).toBe(5000000n);
    expect(intent.createdAt).toBe(1700000000n);
    expect(intent.updatedAt).toBe(1700001000n);

    // Bids
    expect(intent.bids).toHaveLength(8);
    expect(intent.bidCount).toBe(2);
    expect(intent.bids[0].solver.equals(bidder1)).toBe(true);
    expect(intent.bids[0].bidPrice).toBe(49500n);
    expect(intent.bids[0].bidTimestamp).toBe(1700000500n);
    expect(intent.bids[0].isActive).toBe(true);
    expect(intent.bids[1].solver.equals(bidder2)).toBe(true);
    expect(intent.bids[1].bidPrice).toBe(49800n);
    expect(intent.bids[2].isActive).toBe(false);

    expect(intent.auctionEnd).toBe(1700002000n);
    expect(intent.winningSolver.equals(winningSolver)).toBe(true);
    expect(intent.bump).toBe(252);
  });
});
