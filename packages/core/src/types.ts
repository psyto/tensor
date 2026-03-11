/* ------------------------------------------------------------------ */
/*  Shared types for Tensor core math library                         */
/* ------------------------------------------------------------------ */

// ---- Position types ------------------------------------------------

export interface Position {
  asset: string;
  side: "long" | "short";
  size: number;
  entry_price: number;
  mark_price: number;
  instrument_type: "perpetual" | "option" | "spot" | "lending";
  option_type?: "call" | "put";
  strike?: number;
  expiry?: string;
}

export interface VolSurface {
  /** IV values indexed [expiry_bucket][moneyness_node], annualized (e.g., 0.30 = 30%) */
  surface: number[][];
  /** Moneyness nodes (strike/spot ratio, e.g., 0.7, 0.8, ..., 1.2) */
  moneyness_nodes: number[];
  /** Expiry bucket boundaries in days */
  expiry_days: number[];
}

export interface OptionPosition {
  asset: string;
  option_type: "call" | "put";
  side: "long" | "short";
  size: number;
  strike: number;
  expiry: string;
  underlying_price: number;
  implied_volatility: number;
  risk_free_rate?: number;
  /** Optional vol surface for strike/expiry-dependent IV */
  vol_surface?: VolSurface;
}

// ---- Margin types --------------------------------------------------

export interface PositionMarginDetail {
  asset: string;
  position_margin: number;
  weight: number;
}

export interface MarginResult {
  initial_margin: number;
  maintenance_margin: number;
  margin_used: number;
  margin_available: number;
  positions: PositionMarginDetail[];
}

export type HealthStatus = "healthy" | "warning" | "critical" | "liquidatable";

export interface HealthResult {
  equity: number;
  total_maintenance_margin: number;
  margin_ratio: number;
  liquidation_distance: number;
  health: HealthStatus;
}

export interface NettingGroup {
  asset: string;
  long_delta: number;
  short_delta: number;
  net_delta: number;
  margin_reduction: number;
}

export interface DeltaNetResult {
  gross_margin: number;
  netted_margin: number;
  savings: number;
  savings_pct: number;
  netting_groups: NettingGroup[];
}

// ---- Greeks types --------------------------------------------------

export interface Greeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface PositionGreeks extends Greeks {
  asset: string;
  option_type: "call" | "put";
  side: "long" | "short";
  size: number;
}

export interface PortfolioGreeks extends Greeks {
  positions: PositionGreeks[];
  net_exposure: number;
}

// ---- Intent types --------------------------------------------------

export interface Leg {
  asset: string;
  side: "buy" | "sell";
  size: number;
  instrument_type: "perpetual" | "option" | "spot";
  option_type?: "call" | "put";
  strike?: number;
  expiry?: string;
  limit_price?: number;
}

export interface TradingIntent {
  strategy: string;
  legs: Leg[];
  max_slippage_bps?: number;
  deadline?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimated_margin_impact: number;
  strategy_recognized: boolean;
  strategy_type: string | null;
}

export interface ExecutionStep {
  sequence: number;
  action: "open" | "close" | "modify";
  asset: string;
  side: "buy" | "sell";
  size: number;
  instrument_type: string;
  reason: string;
  estimated_fill_price?: number;
}

export interface SolverConstraints {
  max_steps?: number;
  prefer_atomic?: boolean;
  /** Execution budget in chain-native units (e.g. compute units on Solana, gas on EVM) */
  execution_budget?: number;
}

export interface SolverResult {
  feasible: boolean;
  steps: ExecutionStep[];
  total_steps: number;
  /** Estimated execution cost in chain-native units */
  estimated_cost: number;
  estimated_margin_required: number;
  optimization_notes: string[];
  /** Winning solver bid (if auction was run) */
  winning_bid?: SolverBid;
}

// ---- Solver types (Phase 4) -------------------------------------------

export interface SolverBid {
  solver: string;
  bid_price: number;
  bid_timestamp: string;
  is_active: boolean;
}

export interface SolverEntry {
  solver: string;
  stake: number;
  total_fills: number;
  total_volume: number;
  slash_count: number;
  is_active: boolean;
  registered_at: string;
}

// ---- Gamma limits (Phase 4) -------------------------------------------

export interface GammaLimits {
  /** Max absolute gamma notional per account (0 = unlimited) */
  max_account_gamma_notional: number;
  /** Max absolute gamma notional per market (0 = unlimited) */
  max_market_gamma_notional: number;
}
