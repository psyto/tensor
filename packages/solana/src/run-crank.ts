#!/usr/bin/env node
import { startCrankBot } from "./crank.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const rpcUrl = process.env.RPC_URL ?? "http://localhost:8899";
const keyPath =
  process.env.KEYPAIR_PATH ??
  resolve(process.env.HOME!, ".config/solana/id.json");

const secretKey = new Uint8Array(
  JSON.parse(readFileSync(keyPath, "utf-8")) as number[],
);

console.log("Starting Tensor crank bot...");
console.log(`RPC: ${rpcUrl}`);

const { stop } = startCrankBot({
  rpcUrl,
  signerSecretKey: secretKey,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 10_000),
  crankMargin: process.env.CRANK_MARGIN !== "false",
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  stop();
  process.exit(0);
});
