import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { TENSOR_PROGRAM_ID, findMarginConfigPDA } from "./pda.js";
import { decodeMarginAccount, decodeIntentAccount } from "./decoder.js";
import { IntentStatus } from "./accounts.js";
import { settleAuctionIx, computeMarginIx } from "./ix.js";

// ── Types ────────────────────────────────────────────────────────

export interface CrankConfig {
  /** RPC endpoint */
  rpcUrl: string;
  /** Keypair for signing transactions */
  signerSecretKey: Uint8Array;
  /** Program ID (default: TENSOR_PROGRAM_ID) */
  programId?: string;
  /** Poll interval in ms (default: 10_000) */
  pollIntervalMs?: number;
  /** Whether to also crank compute_margin for accounts (default: true) */
  crankMargin?: boolean;
  /** Max accounts to refresh margin per cycle (default: 10) */
  maxMarginCranksPerCycle?: number;
  /** Log function (default: console.log) */
  log?: (...args: unknown[]) => void;
}

// ── Discriminators ───────────────────────────────────────────────

/** Anchor account discriminator: sha256("account:<AccountName>")[0..8] */
function accountDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

const INTENT_ACCOUNT_DISC = accountDiscriminator("IntentAccount");
const MARGIN_ACCOUNT_DISC = accountDiscriminator("MarginAccount");

// ── Intent decoding ─────────────────────────────────────────────

// ── Core logic ───────────────────────────────────────────────────

async function crankCycle(
  connection: Connection,
  signer: Keypair,
  programId: PublicKey,
  crankMargin: boolean,
  maxMarginCranks: number,
  log: (...args: unknown[]) => void,
): Promise<void> {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  // ── 1. Settle auctions ─────────────────────────────────────────
  try {
    const intentAccounts = await connection.getProgramAccounts(programId, {
      filters: [
        { memcmp: { offset: 0, bytes: INTENT_ACCOUNT_DISC.toString("base64"), encoding: "base64" } },
      ],
    });

    let settled = 0;
    for (const { pubkey, account } of intentAccounts) {
      let intent;
      try {
        intent = decodeIntentAccount(account.data as Buffer);
      } catch {
        continue;
      }

      // Only settle pending/partially-filled intents with an active auction
      if (intent.status !== IntentStatus.Pending && intent.status !== IntentStatus.PartiallyFilled) continue;
      // auction_end > 0 means an auction was started
      if (intent.auctionEnd <= 0n) continue;
      // auction must have ended
      if (intent.auctionEnd >= nowSec) continue;
      // winning_solver must be default (no solver won yet — needs settlement)
      if (!intent.winningSolver.equals(PublicKey.default)) continue;

      try {
        const ix = settleAuctionIx(pubkey, programId);
        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
        log(`[crank] settle_auction ${pubkey.toBase58()} — tx ${sig}`);
        settled++;
      } catch (err) {
        log(`[crank] settle_auction FAILED for ${pubkey.toBase58()}:`, err);
      }
    }
    if (settled > 0) {
      log(`[crank] settled ${settled} auction(s)`);
    }
  } catch (err) {
    log("[crank] error fetching intent accounts:", err);
  }

  // ── 2. Compute stale margins ───────────────────────────────────
  if (!crankMargin) return;

  try {
    const marginAccounts = await connection.getProgramAccounts(programId, {
      filters: [
        { memcmp: { offset: 0, bytes: MARGIN_ACCOUNT_DISC.toString("base64"), encoding: "base64" } },
      ],
    });

    const staleThreshold = nowSec - 60n;
    const [configPda] = findMarginConfigPDA(programId);
    let cranked = 0;

    for (const { pubkey, account } of marginAccounts) {
      if (cranked >= maxMarginCranks) break;

      try {
        const decoded = decodeMarginAccount(account.data as Buffer);
        if (decoded.lastMarginUpdate >= staleThreshold) continue;

        // Collect active market indices to pass as remaining accounts
        const marketIndices = new Set<number>();
        for (let i = 0; i < decoded.perpCount; i++) {
          if (decoded.perpPositions[i].isActive) {
            marketIndices.add(decoded.perpPositions[i].marketIndex);
          }
        }
        for (let i = 0; i < decoded.optionCount; i++) {
          if (decoded.optionPositions[i].isActive) {
            marketIndices.add(decoded.optionPositions[i].marketIndex);
          }
        }

        // Derive market PDAs for each active market index
        const marketPdas = [...marketIndices].map((idx) => {
          const idxBuf = Buffer.alloc(2);
          idxBuf.writeUInt16LE(idx);
          const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("margin_market"), idxBuf],
            programId,
          );
          return pda;
        });

        const ix = computeMarginIx(pubkey, configPda, marketPdas, programId);
        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
        log(`[crank] compute_margin ${pubkey.toBase58()} — tx ${sig}`);
        cranked++;
      } catch (err) {
        log(`[crank] compute_margin FAILED for ${pubkey.toBase58()}:`, err);
      }
    }
    if (cranked > 0) {
      log(`[crank] refreshed margin for ${cranked} account(s)`);
    }
  } catch (err) {
    log("[crank] error fetching margin accounts:", err);
  }
}

// ── Public API ───────────────────────────────────────────────────

/** Start the crank bot. Returns a stop function. */
export function startCrankBot(config: CrankConfig): { stop: () => void } {
  const {
    rpcUrl,
    signerSecretKey,
    programId: programIdStr,
    pollIntervalMs = 10_000,
    crankMargin = true,
    maxMarginCranksPerCycle = 10,
    log = console.log,
  } = config;

  const connection = new Connection(rpcUrl, "confirmed");
  const signer = Keypair.fromSecretKey(signerSecretKey);
  const programId = programIdStr
    ? new PublicKey(programIdStr)
    : TENSOR_PROGRAM_ID;

  log(`[crank] bot started — program ${programId.toBase58()}`);
  log(`[crank] signer: ${signer.publicKey.toBase58()}`);
  log(`[crank] poll interval: ${pollIntervalMs}ms, crankMargin: ${crankMargin}`);

  let running = true;

  const tick = async () => {
    if (!running) return;
    try {
      await crankCycle(connection, signer, programId, crankMargin, maxMarginCranksPerCycle, log);
    } catch (err) {
      log("[crank] unexpected error in crank cycle:", err);
    }
  };

  // Run immediately, then on interval
  void tick();
  const interval = setInterval(() => void tick(), pollIntervalMs);

  return {
    stop: () => {
      running = false;
      clearInterval(interval);
      log("[crank] bot stopped");
    },
  };
}
