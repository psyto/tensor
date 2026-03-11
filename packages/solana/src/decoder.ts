import { PublicKey } from "@solana/web3.js";
import {
  AccountHealth,
  MarginMode,
  InvestorCategory,
  OptionSide,
  OptionKind,
  LendingSide,
  ZkCreditTier,
  IntentStatus,
  IntentType,
  type ProductType,
  type OnChainPerpPosition,
  type OnChainSpotBalance,
  type OnChainOptionPosition,
  type OnChainLendingPosition,
  type OnChainPortfolioGreeks,
  type OnChainMarginAccount,
  type OnChainMarginMarket,
  type OnChainSolverEntry,
  type OnChainSolverRegistry,
  type OnChainIntentLeg,
  type OnChainSolverBid,
  type OnChainIntentAccount,
} from "./accounts.js";

// ── Buffer reader ──────────────────────────────────────────────────

export class BorshReader {
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

  u128(): bigint {
    const lo = this.buf.readBigUInt64LE(this.offset);
    const hi = this.buf.readBigUInt64LE(this.offset + 8);
    this.offset += 16;
    return (hi << 64n) | lo;
  }

  i128(): bigint {
    const lo = this.buf.readBigUInt64LE(this.offset);
    const hi = this.buf.readBigInt64LE(this.offset + 8);
    this.offset += 16;
    return (hi << 64n) | lo;
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

// SolverEntry: Pubkey(32) + u64(8) + u64(8) + u128(16) + u16(2) + bool(1) + i64(8) = 75 bytes
export function decodeSolverEntry(r: BorshReader): OnChainSolverEntry {
  return {
    solver: r.pubkey(),
    stake: r.u64(),
    totalFills: r.u64(),
    totalVolume: r.u128(),
    slashCount: r.u16(),
    isActive: r.bool(),
    registeredAt: r.i64(),
  };
}

// IntentLeg: u8 + u16 + i64 + u64 + bool = 20 bytes
export function decodeIntentLeg(r: BorshReader): OnChainIntentLeg {
  return {
    productType: r.u8() as ProductType,
    marketIndex: r.u16(),
    size: r.i64(),
    limitPrice: r.u64(),
    isActive: r.bool(),
  };
}

// SolverBid: Pubkey(32) + u64(8) + i64(8) + bool(1) = 49 bytes
export function decodeSolverBid(r: BorshReader): OnChainSolverBid {
  return {
    solver: r.pubkey(),
    bidPrice: r.u64(),
    bidTimestamp: r.i64(),
    isActive: r.bool(),
  };
}

// ── Top-level decoders ─────────────────────────────────────────────

const MAX_PERP_POSITIONS = 8;
const MAX_SPOT_BALANCES = 16;
const MAX_OPTION_POSITIONS = 8;
const MAX_LENDING_POSITIONS = 8;
const MAX_VOL_NODES = 9;
const MAX_EXPIRY_BUCKETS = 4;
const MAX_SOLVERS = 16;
const MAX_LEGS = 4;
const MAX_BIDS = 8;

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

  const index = r.u16();
  const symbol = r.string();
  const baseMint = r.pubkey();
  const oracle = r.pubkey();
  const varianceTracker = r.pubkey();
  const spotEnabled = r.bool();
  const perpEnabled = r.bool();
  const optionsEnabled = r.bool();
  const lendingEnabled = r.bool();
  const initialMarginBps = r.u64();
  const maintenanceRatioBps = r.u64();
  const maxPositionSize = r.u64();
  const markPrice = r.u64();
  const impliedVolBps = r.u64();
  const fundingRateBps = r.i64();
  const cumulativeFundingIndex = r.i128();
  const lastFundingUpdate = r.i64();
  const openInterestLong = r.u64();
  const openInterestShort = r.u64();
  const totalVolume = r.u128();
  const isActive = r.bool();
  const aggregateGammaLong = r.i64();
  const aggregateGammaShort = r.i64();

  // vol_surface: [[u64; 9]; 4] — fixed-size array, no length prefix
  const volSurface: bigint[][] = [];
  for (let row = 0; row < MAX_EXPIRY_BUCKETS; row++) {
    const cols: bigint[] = [];
    for (let col = 0; col < MAX_VOL_NODES; col++) {
      cols.push(r.u64());
    }
    volSurface.push(cols);
  }

  // vol_moneyness_nodes: [u64; 9]
  const volMoneynessNodes: bigint[] = [];
  for (let i = 0; i < MAX_VOL_NODES; i++) {
    volMoneynessNodes.push(r.u64());
  }

  // vol_expiry_days: [u16; 4]
  const volExpiryDays: number[] = [];
  for (let i = 0; i < MAX_EXPIRY_BUCKETS; i++) {
    volExpiryDays.push(r.u16());
  }

  const volNodeCount = r.u8();
  const volExpiryCount = r.u8();
  const bump = r.u8();

  return {
    index,
    symbol,
    baseMint,
    oracle,
    varianceTracker,
    spotEnabled,
    perpEnabled,
    optionsEnabled,
    lendingEnabled,
    initialMarginBps,
    maintenanceRatioBps,
    maxPositionSize,
    markPrice,
    impliedVolBps,
    fundingRateBps,
    cumulativeFundingIndex,
    lastFundingUpdate,
    openInterestLong,
    openInterestShort,
    totalVolume,
    isActive,
    aggregateGammaLong,
    aggregateGammaShort,
    volSurface,
    volMoneynessNodes,
    volExpiryDays,
    volNodeCount,
    volExpiryCount,
    bump,
  };
}

/**
 * Decode a SolverRegistry from raw account data.
 * Skips the 8-byte Anchor discriminator.
 */
export function decodeSolverRegistry(data: Buffer): OnChainSolverRegistry {
  const r = new BorshReader(data);
  r.skip(8); // Anchor discriminator

  const authority = r.pubkey();

  const solvers: OnChainSolverEntry[] = [];
  for (let i = 0; i < MAX_SOLVERS; i++) {
    solvers.push(decodeSolverEntry(r));
  }

  const solverCount = r.u8();
  const bump = r.u8();

  return {
    authority,
    solvers,
    solverCount,
    bump,
  };
}

/**
 * Decode an IntentAccount from raw account data.
 * Skips the 8-byte Anchor discriminator.
 */
export function decodeIntentAccount(data: Buffer): OnChainIntentAccount {
  const r = new BorshReader(data);
  r.skip(8); // Anchor discriminator

  const marginAccount = r.pubkey();
  const intentId = r.u64();
  const intentType = r.u8() as IntentType;
  const status = r.u8() as IntentStatus;

  const legs: OnChainIntentLeg[] = [];
  for (let i = 0; i < MAX_LEGS; i++) {
    legs.push(decodeIntentLeg(r));
  }

  const legCount = r.u8();
  const filledLegs = r.u8();
  const maxSlippageBps = r.u16();
  const minFillRatioBps = r.u16();
  const deadline = r.i64();
  const maxTotalCost = r.u64();
  const totalMarginUsed = r.u64();
  const createdAt = r.i64();
  const updatedAt = r.i64();

  const bids: OnChainSolverBid[] = [];
  for (let i = 0; i < MAX_BIDS; i++) {
    bids.push(decodeSolverBid(r));
  }

  const bidCount = r.u8();
  const auctionEnd = r.i64();
  const winningSolver = r.pubkey();
  const bump = r.u8();

  return {
    marginAccount,
    intentId,
    intentType,
    status,
    legs,
    legCount,
    filledLegs,
    maxSlippageBps,
    minFillRatioBps,
    deadline,
    maxTotalCost,
    totalMarginUsed,
    createdAt,
    updatedAt,
    bids,
    bidCount,
    auctionEnd,
    winningSolver,
    bump,
  };
}
