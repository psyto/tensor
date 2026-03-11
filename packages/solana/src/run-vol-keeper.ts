#!/usr/bin/env node
import { startVolKeeper } from "./vol-keeper.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const rpcUrl = process.env.RPC_URL ?? "http://localhost:8899";
const keyPath =
  process.env.KEYPAIR_PATH ??
  resolve(process.env.HOME!, ".config/solana/id.json");
const marketIndices = (process.env.MARKET_INDICES ?? "0")
  .split(",")
  .map(Number);

const secretKey = new Uint8Array(
  JSON.parse(readFileSync(keyPath, "utf-8")),
);

console.log("Starting Tensor vol surface keeper...");
console.log(`RPC: ${rpcUrl}`);
console.log(`Markets: ${marketIndices.join(", ")}`);

const { stop } = startVolKeeper({
  rpcUrl,
  signerSecretKey: secretKey,
  marketIndices,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 60_000),
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  stop();
  process.exit(0);
});
