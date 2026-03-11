import { describe, it, expect } from "vitest";
import {
  evaluateBidOpportunity,
  processAuction,
  findSettleableAuctions,
} from "../solver-client";
import type { TradingIntent, SolverBid } from "../types";

function makeIntent(overrides: Partial<TradingIntent> = {}): TradingIntent {
  return {
    strategy: "delta-neutral",
    legs: [
      {
        asset: "SOL-PERP",
        side: "buy",
        size: 10,
        instrument_type: "perpetual",
        limit_price: 155,
      },
    ],
    ...overrides,
  };
}

const defaultConfig = {
  solverId: "solver1",
  minProfitBps: 5,
  gasCostPerStep: 0.01,
  maxConcurrentIntents: 10,
};

describe("evaluateBidOpportunity", () => {
  it("returns shouldBid=true when profitable", () => {
    const result = evaluateBidOpportunity(
      makeIntent(),
      { "SOL-PERP": 150 },
      defaultConfig,
    );
    expect(result.shouldBid).toBe(true);
    expect(result.expectedProfit).toBeGreaterThan(0);
    expect(result.bidPrice).toBeGreaterThan(0);
  });

  it("returns shouldBid=false when market price exceeds limit", () => {
    const result = evaluateBidOpportunity(
      makeIntent({
        legs: [
          {
            asset: "SOL-PERP",
            side: "buy",
            size: 10,
            instrument_type: "perpetual",
            limit_price: 149, // below market
          },
        ],
      }),
      { "SOL-PERP": 150 },
      defaultConfig,
    );
    expect(result.shouldBid).toBe(false);
  });

  it("bid price splits spread between solver and user", () => {
    const result = evaluateBidOpportunity(
      makeIntent(),
      { "SOL-PERP": 150 },
      defaultConfig,
    );
    // Limit=155, market=150, halfSpread=2.5, bidPrice=152.5
    expect(result.bidPrice).toBeCloseTo(152.5, 1);
  });

  it("respects minProfitBps threshold", () => {
    const strictConfig = { ...defaultConfig, minProfitBps: 1000 }; // 10%
    const result = evaluateBidOpportunity(
      makeIntent(),
      { "SOL-PERP": 150 },
      strictConfig,
    );
    // 5/150 spread ≈ 333 bps, below 1000
    expect(result.shouldBid).toBe(false);
    expect(result.reason).toContain("below minimum");
  });
});

describe("processAuction", () => {
  const bids: SolverBid[] = [
    { solver: "s1", bid_price: 152, bid_timestamp: "2026-01-01T00:00:00Z", is_active: true },
    { solver: "s2", bid_price: 150, bid_timestamp: "2026-01-01T00:01:00Z", is_active: true },
    { solver: "s3", bid_price: 154, bid_timestamp: "2026-01-01T00:02:00Z", is_active: true },
  ];

  it("selects lowest price for buy side", () => {
    const result = processAuction(bids, "buy", 0.5, 149);
    expect(result.winner?.solver).toBe("s2");
    expect(result.winner?.bid_price).toBe(150);
  });

  it("selects highest price for sell side", () => {
    const result = processAuction(bids, "sell", 0.5, 155);
    expect(result.winner?.solver).toBe("s3");
    expect(result.winner?.bid_price).toBe(154);
  });

  it("ranks bids correctly for buy side", () => {
    const result = processAuction(bids, "buy", 0, 149);
    expect(result.ranked[0].bid_price).toBe(150);
    expect(result.ranked[1].bid_price).toBe(152);
    expect(result.ranked[2].bid_price).toBe(154);
  });

  it("returns null winner when no bids", () => {
    const result = processAuction([], "buy", 0, 100);
    expect(result.winner).toBeNull();
    expect(result.isProfitable).toBe(false);
  });

  it("checks profitability against gas cost", () => {
    const result = processAuction(bids, "buy", 5, 149);
    // Winner bids 150, market 149, gas 5 → need bid >= 154 → not profitable
    expect(result.isProfitable).toBe(false);
  });
});

describe("findSettleableAuctions", () => {
  it("finds auctions that have ended", () => {
    const auctions = {
      "intent1": 1000,
      "intent2": 2000,
      "intent3": 3000,
    };
    const result = findSettleableAuctions(1500, auctions);
    expect(result).toEqual(["intent1"]);
  });

  it("ignores auctions with 0 end time (no auction)", () => {
    const auctions = {
      "intent1": 0,
      "intent2": 1000,
    };
    const result = findSettleableAuctions(1500, auctions);
    expect(result).toEqual(["intent2"]);
  });

  it("returns empty when no auctions have ended", () => {
    const auctions = {
      "intent1": 5000,
      "intent2": 6000,
    };
    const result = findSettleableAuctions(1500, auctions);
    expect(result).toEqual([]);
  });

  it("finds multiple settleable auctions", () => {
    const auctions = {
      "a": 100,
      "b": 200,
      "c": 300,
      "d": 5000,
    };
    const result = findSettleableAuctions(400, auctions);
    expect(result).toHaveLength(3);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
  });
});
