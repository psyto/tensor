import type {
  Position,
  MarginResult,
  HealthResult,
  PortfolioGreeks,
  OptionPosition,
  TradingIntent,
  SolverResult,
  SolverConstraints,
} from "./types.js";

/**
 * Supported chain identifiers.
 * Follows the Chain union pattern from @sentinel/core.
 */
export type Chain = "solana" | "evm";

/**
 * Chain-agnostic adapter for reading on-chain state and submitting transactions.
 * Implement this for each chain (Solana, EVM, etc.).
 *
 * Follows the injectable-interface pattern from @stratum/core.
 */
export interface ChainAdapter {
  /** Chain identifier */
  readonly chain: Chain;

  /** Fetch current positions for an account */
  getPositions(account: string): Promise<Position[]>;

  /** Fetch current collateral value for an account */
  getCollateral(account: string): Promise<number>;

  /** Fetch current mark prices for given assets */
  getMarkPrices(assets: string[]): Promise<Record<string, number>>;

  /** Submit an intent for execution */
  submitIntent(intent: TradingIntent): Promise<{ txId: string }>;
}

/**
 * Chain-specific execution cost estimator.
 * Allows the solver to estimate costs in chain-native units.
 */
export interface CostEstimator {
  /** Chain identifier */
  readonly chain: Chain;

  /** Estimated cost per execution step in chain-native units */
  readonly costPerStep: number;

  /** Unit name for display (e.g. "lamports", "gas") */
  readonly unitName: string;

  /** Estimate total cost for a number of steps */
  estimateCost(steps: number): number;
}

/** Default Solana cost estimator (200k compute units per step) */
export const solanaCostEstimator: CostEstimator = {
  chain: "solana",
  costPerStep: 200_000,
  unitName: "compute units",
  estimateCost: (steps) => steps * 200_000,
};

/** Default EVM cost estimator (150k gas per step) */
export const evmCostEstimator: CostEstimator = {
  chain: "evm",
  costPerStep: 150_000,
  unitName: "gas",
  estimateCost: (steps) => steps * 150_000,
};
