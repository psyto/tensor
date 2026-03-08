export { SolanaAdapter } from "./SolanaAdapter.js";
export {
  TENSOR_PROGRAM_ID,
  findMarginAccountPDA,
  findMarginMarketPDA,
  findMarginConfigPDA,
  findIntentAccountPDA,
} from "./pda.js";
export {
  PRECISION,
  AccountHealth,
  MarginMode,
  ProductType,
  OptionSide,
  OptionKind,
  LendingSide,
  InvestorCategory,
  ZkCreditTier,
  IntentStatus,
  type OnChainPerpPosition,
  type OnChainSpotBalance,
  type OnChainOptionPosition,
  type OnChainLendingPosition,
  type OnChainPortfolioGreeks,
  type OnChainMarginAccount,
  type OnChainMarginMarket,
} from "./accounts.js";
export { decodeMarginAccount, decodeMarginMarket } from "./decoder.js";

// Re-export core types
export {
  type Chain,
  type ChainAdapter,
  type CostEstimator,
  solanaCostEstimator,
  type Position,
  type MarginResult,
  type HealthResult,
  type TradingIntent,
  type SolverResult,
  type SolverConstraints,
} from "@tensor/core";
