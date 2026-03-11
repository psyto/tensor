#!/usr/bin/env node
import { startLiquidator } from "./liquidator.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const rpcUrl = process.env.RPC_URL ?? "http://localhost:8899";
const keyPath = process.env.KEYPAIR_PATH ?? resolve(process.env.HOME!, ".config/solana/id.json");

const secretKey = new Uint8Array(JSON.parse(readFileSync(keyPath, "utf-8")));

console.log("Starting Tensor liquidation bot...");
console.log(`RPC: ${rpcUrl}`);

const { stop, stats, onLiquidation } = startLiquidator({
  rpcUrl,
  signerSecretKey: secretKey,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5_000),
  maxLiquidationsPerCycle: Number(process.env.MAX_LIQUIDATIONS ?? 5),
  refreshMarginFirst: process.env.REFRESH_MARGIN !== "false",
  marginStalenessSeconds: Number(process.env.MARGIN_STALENESS_SECONDS ?? 30),
});

onLiquidation((event) => {
  console.log(
    `[event] Liquidated ${event.marginAccount.toBase58()} ` +
    `health=${event.health} equity=${event.equity} tx=${event.txSignature}`
  );
});

// Print stats every 60 seconds
const statsInterval = setInterval(() => {
  const s = stats();
  console.log(`[stats] cycles=${s.cyclesRun} scanned=${s.accountsScanned} ` +
    `liquidated=${s.liquidationsSucceeded}/${s.liquidationsAttempted} ` +
    `failed=${s.liquidationsFailed} refreshes=${s.marginRefreshes}`);
}, 60_000);

process.on("SIGINT", () => {
  console.log("Shutting down...");
  clearInterval(statsInterval);
  stop();
  process.exit(0);
});
