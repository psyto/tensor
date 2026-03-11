import type { PublicKey } from "@solana/web3.js";

export const PRECISION = 1_000_000;

// ── Enums (matching on-chain u8 discriminants) ──

export enum AccountHealth {
  Healthy = 0,
  Warning = 1,
  Liquidatable = 2,
  Bankrupt = 3,
}

export enum MarginMode {
  Isolated = 0,
  Cross = 1,
  Portfolio = 2,
}

export enum ProductType {
  Spot = 0,
  Perpetual = 1,
  Option = 2,
  Lending = 3,
  VarianceSwap = 4,
}

export enum OptionSide {
  Call = 0,
  Put = 1,
}

export enum LendingSide {
  Supply = 0,
  Borrow = 1,
}

export enum InvestorCategory {
  Retail = 0,
  Qualified = 1,
  Institutional = 2,
}

export enum OptionKind {
  Vanilla = 0,
  Asian = 1,
  BarrierKnockOut = 2,
  BarrierKnockIn = 3,
}

export enum ZkCreditTier {
  None = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Platinum = 4,
}

export enum IntentStatus {
  Pending = 0,
  PartiallyFilled = 1,
  Filled = 2,
  Cancelled = 3,
  Expired = 4,
}

// ── Position structs ──

export interface OnChainPerpPosition {
  marketIndex: number;
  size: bigint;
  entryPrice: bigint;
  realizedPnl: bigint;
  unrealizedPnl: bigint;
  cumulativeFunding: bigint;
  lastFundingIndex: bigint;
  openedAt: bigint;
  isActive: boolean;
}

export interface OnChainSpotBalance {
  mint: PublicKey;
  balance: bigint;
  value: bigint;
  marketIndex: number;
  isActive: boolean;
}

export interface OnChainOptionPosition {
  marketIndex: number;
  side: OptionSide;
  kind: OptionKind;
  strike: bigint;
  barrier: bigint;
  contracts: bigint;
  notionalPerContract: bigint;
  expiry: bigint;
  premium: bigint;
  deltaPerContract: bigint;
  gammaPerContract: bigint;
  vegaPerContract: bigint;
  thetaPerContract: bigint;
  openedAt: bigint;
  isActive: boolean;
}

export interface OnChainLendingPosition {
  mint: PublicKey;
  marketIndex: number;
  side: LendingSide;
  principal: bigint;
  accruedInterest: bigint;
  rateBps: number;
  haircutBps: number;
  effectiveValue: bigint;
  lastAccrual: bigint;
  isActive: boolean;
}

export interface OnChainPortfolioGreeks {
  delta: bigint;
  gamma: bigint;
  vega: bigint;
  theta: bigint;
  totalNotional: bigint;
  computedAt: bigint;
}

// ── Full account ──

export interface OnChainMarginAccount {
  owner: PublicKey;
  delegate: PublicKey;
  collateral: bigint;
  lockedCollateral: bigint;
  perpPositions: OnChainPerpPosition[];
  perpCount: number;
  spotBalances: OnChainSpotBalance[];
  spotCount: number;
  optionPositions: OnChainOptionPosition[];
  optionCount: number;
  lendingPositions: OnChainLendingPosition[];
  lendingCount: number;
  greeks: OnChainPortfolioGreeks;
  initialMarginRequired: bigint;
  maintenanceMarginRequired: bigint;
  equity: bigint;
  marginRatioBps: number;
  health: AccountHealth;
  marginMode: MarginMode;
  investorCategory: InvestorCategory;
  identity: PublicKey;
  zkCreditScore: number;
  zkCreditTier: ZkCreditTier;
  zkScoreUpdatedAt: bigint;
  zkCreditOracle: PublicKey;
  activeIntentCount: number;
  createdAt: bigint;
  lastMarginUpdate: bigint;
  totalTrades: bigint;
  totalRealizedPnl: bigint;
  bump: number;
}

export interface OnChainMarginMarket {
  index: number;
  symbol: string;
  baseMint: PublicKey;
  oracle: PublicKey;
  varianceTracker: PublicKey;
  spotEnabled: boolean;
  perpEnabled: boolean;
  optionsEnabled: boolean;
  lendingEnabled: boolean;
  initialMarginBps: bigint;
  maintenanceRatioBps: bigint;
  maxPositionSize: bigint;
  markPrice: bigint;
  impliedVolBps: bigint;
  fundingRateBps: bigint;
  cumulativeFundingIndex: bigint;
  lastFundingUpdate: bigint;
  openInterestLong: bigint;
  openInterestShort: bigint;
  totalVolume: bigint;
  isActive: boolean;
  aggregateGammaLong: bigint;
  aggregateGammaShort: bigint;
  volSurface: bigint[][];
  volMoneynessNodes: bigint[];
  volExpiryDays: number[];
  volNodeCount: number;
  volExpiryCount: number;
  bump: number;
}

// ── Solver types ──

export interface OnChainSolverEntry {
  solver: PublicKey;
  stake: bigint;
  totalFills: bigint;
  totalVolume: bigint;
  slashCount: number;
  isActive: boolean;
  registeredAt: bigint;
}

export interface OnChainSolverRegistry {
  authority: PublicKey;
  solvers: OnChainSolverEntry[];
  solverCount: number;
  bump: number;
}

// ── Intent types ──

export interface OnChainIntentLeg {
  productType: ProductType;
  marketIndex: number;
  size: bigint;
  limitPrice: bigint;
  isActive: boolean;
}

export interface OnChainSolverBid {
  solver: PublicKey;
  bidPrice: bigint;
  bidTimestamp: bigint;
  isActive: boolean;
}

export enum IntentType {
  Market = 0,
  Limit = 1,
  RFQ = 2,
}

export interface OnChainIntentAccount {
  marginAccount: PublicKey;
  intentId: bigint;
  intentType: IntentType;
  status: IntentStatus;
  legs: OnChainIntentLeg[];
  legCount: number;
  filledLegs: number;
  maxSlippageBps: number;
  minFillRatioBps: number;
  deadline: bigint;
  maxTotalCost: bigint;
  totalMarginUsed: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  bids: OnChainSolverBid[];
  bidCount: number;
  auctionEnd: bigint;
  winningSolver: PublicKey;
  bump: number;
}
