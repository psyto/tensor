import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { anchorDiscriminator, liquidateIx } from "../ix.js";
import { AccountHealth } from "../accounts.js";

describe("liquidateIx", () => {
  const programId = PublicKey.unique();
  const marginAccount = PublicKey.unique();
  const market = PublicKey.unique();
  const config = PublicKey.unique();
  const liquidator = PublicKey.unique();

  it("creates instruction with correct program ID", () => {
    const ix = liquidateIx(marginAccount, market, config, liquidator, programId);
    expect(ix.programId.equals(programId)).toBe(true);
  });

  it("has 4 account keys in correct order", () => {
    const ix = liquidateIx(marginAccount, market, config, liquidator, programId);
    expect(ix.keys).toHaveLength(4);
    expect(ix.keys[0].pubkey.equals(marginAccount)).toBe(true);
    expect(ix.keys[1].pubkey.equals(market)).toBe(true);
    expect(ix.keys[2].pubkey.equals(config)).toBe(true);
    expect(ix.keys[3].pubkey.equals(liquidator)).toBe(true);
  });

  it("margin_account is writable, not signer", () => {
    const ix = liquidateIx(marginAccount, market, config, liquidator, programId);
    expect(ix.keys[0].isWritable).toBe(true);
    expect(ix.keys[0].isSigner).toBe(false);
  });

  it("market is writable, not signer", () => {
    const ix = liquidateIx(marginAccount, market, config, liquidator, programId);
    expect(ix.keys[1].isWritable).toBe(true);
    expect(ix.keys[1].isSigner).toBe(false);
  });

  it("config is writable, not signer", () => {
    const ix = liquidateIx(marginAccount, market, config, liquidator, programId);
    expect(ix.keys[2].isWritable).toBe(true);
    expect(ix.keys[2].isSigner).toBe(false);
  });

  it("liquidator is signer and writable", () => {
    const ix = liquidateIx(marginAccount, market, config, liquidator, programId);
    expect(ix.keys[3].isSigner).toBe(true);
    expect(ix.keys[3].isWritable).toBe(true);
  });

  it("instruction data is the liquidate discriminator", () => {
    const ix = liquidateIx(marginAccount, market, config, liquidator, programId);
    const expectedDisc = anchorDiscriminator("liquidate");
    expect(Buffer.from(ix.data).equals(expectedDisc)).toBe(true);
  });

  it("discriminator differs from other instructions", () => {
    const liqDisc = anchorDiscriminator("liquidate");
    const settleDisc = anchorDiscriminator("settle_auction");
    const marginDisc = anchorDiscriminator("compute_margin");
    expect(liqDisc.equals(settleDisc)).toBe(false);
    expect(liqDisc.equals(marginDisc)).toBe(false);
  });
});

describe("AccountHealth enum values", () => {
  it("Liquidatable = 2, Bankrupt = 3", () => {
    expect(AccountHealth.Liquidatable).toBe(2);
    expect(AccountHealth.Bankrupt).toBe(3);
  });

  it("has correct ordering for triage", () => {
    expect(AccountHealth.Healthy).toBeLessThan(AccountHealth.Warning);
    expect(AccountHealth.Warning).toBeLessThan(AccountHealth.Liquidatable);
    expect(AccountHealth.Liquidatable).toBeLessThan(AccountHealth.Bankrupt);
  });
});
