import { PublicKey } from "@solana/web3.js";
import {
  AccountHealth,
  MarginMode,
  InvestorCategory,
  OptionSide,
  OptionKind,
  LendingSide,
  ZkCreditTier,
  type OnChainPerpPosition,
  type OnChainSpotBalance,
  type OnChainOptionPosition,
  type OnChainLendingPosition,
  type OnChainPortfolioGreeks,
  type OnChainMarginAccount,
  type OnChainMarginMarket,
} from "./accounts.js";

// ── Buffer reader ──────────────────────────────────────────────────

class BorshReader {
  private offset = 0;
  constructor(private buf: Buffer) {}

  skip(n: number): void {
    this.offset += n;
  }

  u8(): number {
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  u16(): number {
    const v = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  u64(): bigint {
    const v = this.buf.readBigUInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  i64(): bigint {
    const v = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  pubkey(): PublicKey {
    const bytes = this.buf.subarray(this.offset, this.offset + 32);
    this.offset += 32;
    return new PublicKey(bytes);
  }

  /** Borsh string: u32 length prefix + UTF-8 bytes */
  string(): string {
    const len = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    const s = this.buf.toString("utf8", this.offset, this.offset + len);
    this.offset += len;
    return s;
  }
}

// ── Sub-struct decoders ────────────────────────────────────────────

// PerpPosition: u16 + i64 + u64 + i64×4 + i64 + bool = 59 bytes
function decodePerpPosition(r: BorshReader): OnChainPerpPosition {
  return {
    marketIndex: r.u16(),
    size: r.i64(),
    entryPrice: r.u64(),
    realizedPnl: r.i64(),
    unrealizedPnl: r.i64(),
    cumulativeFunding: r.i64(),
    lastFundingIndex: r.i64(),
    openedAt: r.i64(),
    isActive: r.bool(),
  };
}

// SpotBalance: Pubkey + u64 + u64 + u16 + bool = 51 bytes
function decodeSpotBalance(r: BorshReader): OnChainSpotBalance {
  return {
    mint: r.pubkey(),
    balance: r.u64(),
    value: r.u64(),
    marketIndex: r.u16(),
    isActive: r.bool(),
  };
}

// OptionPosition: u16 + u8 + u8 + u64×3 + i64 + u64 + i64×4 + i64 + bool = 95 bytes
function decodeOptionPosition(r: BorshReader): OnChainOptionPosition {
  return {
    marketIndex: r.u16(),
    side: r.u8() as OptionSide,
    kind: r.u8() as OptionKind,
    strike: r.u64(),
    barrier: r.u64(),
    contracts: r.i64(),
    notionalPerContract: r.u64(),
    expiry: r.i64(),
    premium: r.u64(),
    deltaPerContract: r.i64(),
    gammaPerContract: r.i64(),
    vegaPerContract: r.i64(),
    thetaPerContract: r.i64(),
    openedAt: r.i64(),
    isActive: r.bool(),
  };
}

// LendingPosition: Pubkey + u16 + u8 + u64 + i64 + u16 + u16 + u64 + i64 + bool = 72 bytes
function decodeLendingPosition(r: BorshReader): OnChainLendingPosition {
  return {
    mint: r.pubkey(),
    marketIndex: r.u16(),
    side: r.u8() as LendingSide,
    principal: r.u64(),
    accruedInterest: r.i64(),
    rateBps: r.u16(),
    haircutBps: r.u16(),
    effectiveValue: r.u64(),
    lastAccrual: r.i64(),
    isActive: r.bool(),
  };
}

// PortfolioGreeks: i64×4 + u64 + i64 = 48 bytes
function decodePortfolioGreeks(r: BorshReader): OnChainPortfolioGreeks {
  return {
    delta: r.i64(),
    gamma: r.i64(),
    vega: r.i64(),
    theta: r.i64(),
    totalNotional: r.u64(),
    computedAt: r.i64(),
  };
}

// ── Top-level decoders ─────────────────────────────────────────────

const MAX_PERP_POSITIONS = 8;
const MAX_SPOT_BALANCES = 16;
const MAX_OPTION_POSITIONS = 8;
const MAX_LENDING_POSITIONS = 8;

/**
 * Decode a MarginAccount from raw account data.
 * Skips the 8-byte Anchor discriminator.
 */
export function decodeMarginAccount(data: Buffer): OnChainMarginAccount {
  const r = new BorshReader(data);
  r.skip(8); // Anchor discriminator

  const owner = r.pubkey();
  const delegate = r.pubkey();
  const collateral = r.u64();
  const lockedCollateral = r.u64();

  const perpPositions: OnChainPerpPosition[] = [];
  for (let i = 0; i < MAX_PERP_POSITIONS; i++) {
    perpPositions.push(decodePerpPosition(r));
  }
  const perpCount = r.u8();

  const spotBalances: OnChainSpotBalance[] = [];
  for (let i = 0; i < MAX_SPOT_BALANCES; i++) {
    spotBalances.push(decodeSpotBalance(r));
  }
  const spotCount = r.u8();

  const optionPositions: OnChainOptionPosition[] = [];
  for (let i = 0; i < MAX_OPTION_POSITIONS; i++) {
    optionPositions.push(decodeOptionPosition(r));
  }
  const optionCount = r.u8();

  const lendingPositions: OnChainLendingPosition[] = [];
  for (let i = 0; i < MAX_LENDING_POSITIONS; i++) {
    lendingPositions.push(decodeLendingPosition(r));
  }
  const lendingCount = r.u8();

  const greeks = decodePortfolioGreeks(r);
  const initialMarginRequired = r.u64();
  const maintenanceMarginRequired = r.u64();
  const equity = r.i64();
  const marginRatioBps = r.u16();
  const health = r.u8() as AccountHealth;
  const marginMode = r.u8() as MarginMode;
  const investorCategory = r.u8() as InvestorCategory;
  const identity = r.pubkey();
  const zkCreditScore = r.u16();
  const zkCreditTier = r.u8() as ZkCreditTier;
  const zkScoreUpdatedAt = r.i64();
  const zkCreditOracle = r.pubkey();
  const activeIntentCount = r.u8();
  const createdAt = r.i64();
  const lastMarginUpdate = r.i64();
  const totalTrades = r.u64();
  const totalRealizedPnl = r.i64();
  const bump = r.u8();

  return {
    owner,
    delegate,
    collateral,
    lockedCollateral,
    perpPositions,
    perpCount,
    spotBalances,
    spotCount,
    optionPositions,
    optionCount,
    lendingPositions,
    lendingCount,
    greeks,
    initialMarginRequired,
    maintenanceMarginRequired,
    equity,
    marginRatioBps,
    health,
    marginMode,
    investorCategory,
    identity,
    zkCreditScore,
    zkCreditTier,
    zkScoreUpdatedAt,
    zkCreditOracle,
    activeIntentCount,
    createdAt,
    lastMarginUpdate,
    totalTrades,
    totalRealizedPnl,
    bump,
  };
}

/**
 * Decode a MarginMarket from raw account data.
 * Skips the 8-byte Anchor discriminator.
 */
export function decodeMarginMarket(data: Buffer): OnChainMarginMarket {
  const r = new BorshReader(data);
  r.skip(8); // Anchor discriminator

  return {
    index: r.u16(),
    symbol: r.string(),
    baseMint: r.pubkey(),
    markPrice: r.u64(),
    impliedVolBps: r.u64(),
    fundingRateBps: r.i64(),
    isActive: r.bool(),
    bump: r.u8(),
  };
}
