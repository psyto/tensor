import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { fitVolSurfaceFromOracle, buildVolSurface, volSurfaceToOnChain } from "@tensor/core";
import { TENSOR_PROGRAM_ID, findMarginMarketPDAByIndex, findMarginConfigPDA } from "./pda.js";
import { updateVolSurfaceIx } from "./ix.js";
import { decodeMarginMarket } from "./decoder.js";

// ── Types ────────────────────────────────────────────────────────

export interface VolKeeperConfig {
  /** RPC endpoint */
  rpcUrl: string;
  /** Authority keypair (must match MarginConfig.authority) */
  signerSecretKey: Uint8Array;
  /** Program ID */
  programId?: string;
  /** Market indices to update */
  marketIndices: number[];
  /** Poll interval in ms (default: 60_000 — 1 minute) */
  pollIntervalMs?: number;
  /** Log function */
  log?: (...args: unknown[]) => void;
}

// ── Oracle reader ────────────────────────────────────────────────

/**
 * Sigma oracle account layout (simplified):
 *   - 8 bytes discriminator
 *   - 32 bytes authority
 *   - 8 bytes current_variance (u64, at offset 40)
 *
 * NOTE: The offset may need adjustment for the actual Sigma oracle layout.
 * This implementation assumes the variance u64 starts at byte 40.
 */
const ORACLE_VARIANCE_OFFSET = 40;

/**
 * Read variance from an on-chain oracle account.
 * The Sigma oracle stores current_variance as a u64 at a known offset.
 * Returns the variance in bps, or null if the account cannot be read.
 */
export async function readOracleVariance(
  connection: Connection,
  varianceTracker: PublicKey,
): Promise<number | null> {
  const accountInfo = await connection.getAccountInfo(varianceTracker);
  if (!accountInfo || !accountInfo.data) return null;

  const data = accountInfo.data as Buffer;
  if (data.length < ORACLE_VARIANCE_OFFSET + 8) return null;

  // Read current_variance as u64 LE
  const low = data.readUInt32LE(ORACLE_VARIANCE_OFFSET);
  const high = data.readUInt32LE(ORACLE_VARIANCE_OFFSET + 4);
  const variance = low + high * 2 ** 32;

  return variance;
}

// ── MarginMarket reader ──────────────────────────────────────────

/**
 * Read the variance_tracker pubkey from a MarginMarket account
 * by fully decoding the account with decodeMarginMarket.
 */
async function readVarianceTracker(
  connection: Connection,
  marketPda: PublicKey,
): Promise<PublicKey | null> {
  const accountInfo = await connection.getAccountInfo(marketPda);
  if (!accountInfo || !accountInfo.data) return null;

  try {
    const market = decodeMarginMarket(accountInfo.data as Buffer);
    return market.varianceTracker;
  } catch {
    return null;
  }
}

// ── Builders ─────────────────────────────────────────────────────

/**
 * Build vol surface params from oracle variance, ready for on-chain update.
 *
 * @param varianceBps  Annualized variance in bps (from Sigma oracle).
 *                     IV = sqrt(variance), then fed into the skew surface generator.
 */
export function buildVolSurfaceParams(varianceBps: number): {
  vol_surface: number[][];
  moneyness_nodes: number[];
  expiry_days: number[];
  node_count: number;
  expiry_count: number;
} {
  return fitVolSurfaceFromOracle(varianceBps);
}

/**
 * Build vol surface params from a manually specified ATM vol (decimal, e.g., 0.30).
 * Useful when you have a direct IV feed rather than variance.
 */
export function buildVolSurfaceFromAtmVol(atmVol: number): {
  vol_surface: number[][];
  moneyness_nodes: number[];
  expiry_days: number[];
  node_count: number;
  expiry_count: number;
} {
  const surface = buildVolSurface(atmVol);
  return volSurfaceToOnChain(surface);
}

// ── Keeper loop ──────────────────────────────────────────────────

/**
 * Start the vol surface keeper. Returns a stop function.
 *
 * The keeper runs an interval loop that, for each configured market index:
 *   1. Derives the MarginMarket PDA via findMarginMarketPDAByIndex
 *   2. Reads the variance_tracker pubkey from the market account
 *   3. Reads the current variance from the Sigma oracle
 *   4. Fits a vol surface from the oracle variance
 *   5. Builds and sends an update_vol_surface transaction
 */
export function startVolKeeper(config: VolKeeperConfig): { stop: () => void } {
  const {
    rpcUrl,
    signerSecretKey,
    marketIndices,
    pollIntervalMs = 60_000,
    log = console.log,
    programId: programIdStr,
  } = config;

  const connection = new Connection(rpcUrl, "confirmed");
  const signer = Keypair.fromSecretKey(signerSecretKey);
  const programId = programIdStr
    ? new PublicKey(programIdStr)
    : TENSOR_PROGRAM_ID;
  const [configPda] = findMarginConfigPDA(programId);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    for (const marketIndex of marketIndices) {
      if (stopped) return;

      try {
        const [marketPda] = findMarginMarketPDAByIndex(marketIndex, programId);
        log(`[vol-keeper] Market ${marketIndex}: ${marketPda.toBase58()}`);

        // Step 1: Read variance_tracker from market account
        const varianceTracker = await readVarianceTracker(connection, marketPda);
        if (!varianceTracker) {
          log(`[vol-keeper] Market ${marketIndex}: account not found, skipping`);
          continue;
        }

        // Step 2: Read variance from oracle
        const variance = await readOracleVariance(connection, varianceTracker);
        if (variance === null || variance === 0) {
          log(`[vol-keeper] Market ${marketIndex}: no variance data, skipping`);
          continue;
        }

        log(`[vol-keeper] Market ${marketIndex}: variance = ${variance} bps`);

        // Step 3: Fit vol surface
        const params = buildVolSurfaceParams(variance);
        log(
          `[vol-keeper] Market ${marketIndex}: surface ATM-30d = ${params.vol_surface[1][5]} bps`,
        );

        // Step 4: Build and send transaction
        const ix = updateVolSurfaceIx(
          marketPda,
          configPda,
          signer.publicKey,
          params,
          programId,
        );

        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
        log(`[vol-keeper] Market ${marketIndex}: updated vol surface, tx = ${sig}`);
      } catch (err) {
        log(`[vol-keeper] Market ${marketIndex}: error —`, err);
      }
    }
  }

  // Run immediately, then on interval
  async function loop(): Promise<void> {
    if (stopped) return;
    try {
      await tick();
    } catch (err) {
      log("[vol-keeper] Tick error:", err);
    }
    if (!stopped) {
      timer = setTimeout(loop, pollIntervalMs);
    }
  }

  // Start asynchronously
  void loop();

  return {
    stop: () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      log("[vol-keeper] Stopped.");
    },
  };
}
