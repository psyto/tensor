import type {
  TradingIntent,
  SolverBid,
  SolverResult,
  ExecutionStep,
} from "./types";
import { solveIntent, evaluateAuction, rankBids } from "./intents";

/**
 * Configuration for a solver client instance.
 */
export interface SolverClientConfig {
  /** Solver's public key / address */
  solverId: string;
  /** Minimum profit margin in bps to accept a bid (e.g. 10 = 0.1%) */
  minProfitBps: number;
  /** Gas cost per execution step in native units */
  gasCostPerStep: number;
  /** Maximum number of concurrent intents to process */
  maxConcurrentIntents: number;
}

/**
 * Result of evaluating whether to bid on an intent.
 */
export interface BidEvaluation {
  shouldBid: boolean;
  bidPrice: number;
  expectedProfit: number;
  reason: string;
}

/**
 * Evaluate whether to submit a bid on a given intent.
 *
 * Considers:
 * - Market price vs limit price spread
 * - Gas costs
 * - Minimum profit threshold
 * - Whether the intent is hedged (lower risk)
 */
export function evaluateBidOpportunity(
  intent: TradingIntent,
  marketPrices: Record<string, number>,
  config: SolverClientConfig,
): BidEvaluation {
  const solver = solveIntent(intent);
  if (!solver.feasible) {
    return {
      shouldBid: false,
      bidPrice: 0,
      expectedProfit: 0,
      reason: "Intent is infeasible",
    };
  }

  // Estimate total gas cost
  const totalGasCost = solver.total_steps * config.gasCostPerStep;

  // Calculate potential profit from each leg
  let totalProfit = 0;
  for (const leg of intent.legs) {
    const marketPrice = marketPrices[leg.asset] ?? 0;
    if (marketPrice === 0) continue;

    const limitPrice = leg.limit_price ?? marketPrice;
    const spread = leg.side === "buy"
      ? limitPrice - marketPrice  // buyer willing to pay more than market
      : marketPrice - limitPrice; // seller willing to accept less than market

    totalProfit += spread * leg.size;
  }

  // Subtract gas costs
  const netProfit = totalProfit - totalGasCost;

  // Check minimum profit threshold
  const notional = intent.legs.reduce(
    (sum, l) => sum + l.size * (marketPrices[l.asset] ?? 0),
    0,
  );
  const profitBps = notional > 0 ? (netProfit / notional) * 10_000 : 0;

  if (profitBps < config.minProfitBps) {
    return {
      shouldBid: false,
      bidPrice: 0,
      expectedProfit: netProfit,
      reason: `Profit ${profitBps.toFixed(1)} bps below minimum ${config.minProfitBps} bps`,
    };
  }

  // Determine bid price: market price adjusted by half the available spread
  // This splits the surplus between solver and user
  const primaryLeg = intent.legs[0];
  const primaryMarketPrice = marketPrices[primaryLeg.asset] ?? 0;
  const primaryLimit = primaryLeg.limit_price ?? primaryMarketPrice;
  const halfSpread = (primaryLimit - primaryMarketPrice) / 2;

  const bidPrice = primaryLeg.side === "buy"
    ? primaryMarketPrice + halfSpread  // offer below user's max
    : primaryMarketPrice - halfSpread; // bid above user's min

  return {
    shouldBid: true,
    bidPrice,
    expectedProfit: netProfit,
    reason: `Profitable: ${profitBps.toFixed(1)} bps net profit`,
  };
}

/**
 * Given a set of bids and auction parameters, determine the winning bid
 * and whether it's profitable to execute.
 */
export function processAuction(
  bids: SolverBid[],
  side: "buy" | "sell",
  gasCost: number,
  marketPrice: number,
): {
  winner: SolverBid | null;
  ranked: SolverBid[];
  isProfitable: boolean;
} {
  const ranked = rankBids(bids, side);
  const winner = evaluateAuction(bids, side);

  if (!winner) {
    return { winner: null, ranked, isProfitable: false };
  }

  // Check if winner's price is profitable to execute
  const isProfitable = side === "buy"
    ? winner.bid_price >= marketPrice + gasCost
    : winner.bid_price <= marketPrice - gasCost;

  return { winner, ranked, isProfitable };
}

/**
 * Crank bot logic: check if any auctions have ended and need settlement.
 *
 * @param currentTime  Current unix timestamp
 * @param intentAuctionEnds  Map of intentId -> auction_end timestamp
 * @returns List of intent IDs that need settle_auction called
 */
export function findSettleableAuctions(
  currentTime: number,
  intentAuctionEnds: Record<string, number>,
): string[] {
  return Object.entries(intentAuctionEnds)
    .filter(([_, auctionEnd]) => auctionEnd > 0 && currentTime > auctionEnd)
    .map(([intentId]) => intentId);
}
