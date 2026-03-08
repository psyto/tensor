import { Connection, PublicKey } from "@solana/web3.js";
import type { ChainAdapter, Chain, Position, TradingIntent } from "@tensor/core";
import { TENSOR_PROGRAM_ID, findMarginAccountPDA } from "./pda.js";
import { PRECISION, type OnChainMarginAccount } from "./accounts.js";
import { decodeMarginAccount, decodeMarginMarket } from "./decoder.js";

/**
 * Solana implementation of the Tensor ChainAdapter.
 * Reads MarginAccount and MarginMarket state from the on-chain Anchor program
 * using direct borsh deserialization (no IDL dependency).
 */
export class SolanaAdapter implements ChainAdapter {
  readonly chain: Chain = "solana";

  constructor(
    private readonly connection: Connection,
    private readonly programId: PublicKey = TENSOR_PROGRAM_ID,
  ) {}

  async getPositions(account: string): Promise<Position[]> {
    const marginAccount = await this.fetchMarginAccount(new PublicKey(account));
    if (!marginAccount) return [];

    const positions: Position[] = [];

    // Convert perp positions
    for (let i = 0; i < marginAccount.perpCount; i++) {
      const perp = marginAccount.perpPositions[i];
      if (!perp.isActive) continue;
      positions.push({
        asset: `MARKET-${perp.marketIndex}`,
        side: perp.size >= 0n ? "long" : "short",
        size: Math.abs(Number(perp.size)) / PRECISION,
        entry_price: Number(perp.entryPrice) / PRECISION,
        mark_price: 0,
        instrument_type: "perpetual",
      });
    }

    // Convert spot balances
    for (let i = 0; i < marginAccount.spotCount; i++) {
      const spot = marginAccount.spotBalances[i];
      if (!spot.isActive) continue;
      positions.push({
        asset: `MARKET-${spot.marketIndex}`,
        side: "long",
        size: Number(spot.balance) / PRECISION,
        entry_price: 0,
        mark_price: Number(spot.value) / PRECISION,
        instrument_type: "spot",
      });
    }

    // Convert option positions
    for (let i = 0; i < marginAccount.optionCount; i++) {
      const opt = marginAccount.optionPositions[i];
      if (!opt.isActive) continue;
      positions.push({
        asset: `MARKET-${opt.marketIndex}`,
        side: opt.contracts >= 0n ? "long" : "short",
        size: Math.abs(Number(opt.contracts)) / PRECISION,
        entry_price: Number(opt.strike) / PRECISION,
        mark_price: 0,
        instrument_type: "option",
        option_type: opt.side === 0 ? "call" : "put",
        strike: Number(opt.strike) / PRECISION,
        expiry: new Date(Number(opt.expiry) * 1000).toISOString(),
      });
    }

    // Convert lending positions
    for (let i = 0; i < marginAccount.lendingCount; i++) {
      const lend = marginAccount.lendingPositions[i];
      if (!lend.isActive) continue;
      positions.push({
        asset: `MARKET-${lend.marketIndex}`,
        side: lend.side === 0 ? "long" : "short",
        size: Number(lend.principal) / PRECISION,
        entry_price: 0,
        mark_price: Number(lend.effectiveValue) / PRECISION,
        instrument_type: "lending",
      });
    }

    return positions;
  }

  async getCollateral(account: string): Promise<number> {
    const marginAccount = await this.fetchMarginAccount(new PublicKey(account));
    if (!marginAccount) return 0;
    return Number(marginAccount.collateral) / PRECISION;
  }

  async getMarkPrices(assets: string[]): Promise<Record<string, number>> {
    // MarginMarket accounts store mark prices, updated by keepers.
    // To fetch all markets, callers should use getMarginMarket() directly
    // for each market index. This method returns prices for known markets
    // by scanning program accounts.
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [{ dataSize: 200 }], // Approximate MarginMarket size filter
    });

    const prices: Record<string, number> = {};
    for (const { account } of accounts) {
      try {
        const market = decodeMarginMarket(account.data as Buffer);
        if (!market.isActive) continue;
        const key = `MARKET-${market.index}`;
        if (assets.includes(key)) {
          prices[key] = Number(market.markPrice) / PRECISION;
        }
      } catch {
        // Not a MarginMarket account, skip
      }
    }
    return prices;
  }

  async submitIntent(
    _intent: TradingIntent,
  ): Promise<{ txId: string }> {
    throw new Error(
      "SolanaAdapter is read-only. Use the Anchor program directly to submit intents.",
    );
  }

  // ─── Public helpers ────────────────────────────────────────────────

  /**
   * Fetch and decode a MarginAccount by owner public key.
   * Returns null if the account doesn't exist.
   */
  async fetchMarginAccount(
    owner: PublicKey,
  ): Promise<OnChainMarginAccount | null> {
    const [pda] = findMarginAccountPDA(owner, this.programId);
    const accountInfo = await this.connection.getAccountInfo(pda);
    if (!accountInfo) return null;
    return decodeMarginAccount(accountInfo.data as Buffer);
  }
}
