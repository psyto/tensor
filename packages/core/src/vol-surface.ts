import type { VolSurface } from "./types";

/**
 * Default moneyness nodes for the vol surface.
 * Covers 0.7x to 1.3x strike/spot ratio.
 */
export const DEFAULT_MONEYNESS_NODES = [0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2];

/**
 * Default expiry bucket boundaries in days.
 */
export const DEFAULT_EXPIRY_DAYS = [7, 30, 90, 180];

/**
 * Default skew multipliers relative to ATM IV, indexed by moneyness node.
 * Based on typical equity/crypto vol smile: higher IV for OTM puts (low moneyness),
 * minimum at ATM, slight uptick for OTM calls.
 *
 * These are conservative starting values derived from empirical crypto vol surfaces.
 * They should be calibrated to actual market data in production.
 */
export const DEFAULT_SKEW_MULTIPLIERS = [
  1.50, // 0.7x — deep OTM puts, highest skew
  1.30, // 0.8x — OTM puts
  1.20, // 0.85x
  1.10, // 0.9x
  1.04, // 0.95x
  1.00, // 1.0x — ATM (baseline)
  1.02, // 1.05x
  1.05, // 1.1x — OTM calls
  1.15, // 1.2x — far OTM calls
];

/**
 * Term structure multipliers: how IV changes with expiry relative to 30-day ATM.
 * Short-dated options have higher vol (more gamma risk), long-dated converge to mean.
 */
export const DEFAULT_TERM_MULTIPLIERS = [
  1.15, // 7d  — elevated short-dated vol
  1.00, // 30d — baseline
  0.95, // 90d — slight mean reversion
  0.92, // 180d — longer-term convergence
];

/**
 * Generate a vol surface from a single ATM IV value using fixed skew/term multipliers.
 *
 * This is the simplest vol surface generator — suitable as a starting point when
 * the only oracle data available is a scalar ATM IV (from Sigma variance tracker).
 *
 * @param atmVol  ATM implied volatility (annualized, e.g. 0.30 for 30%)
 * @param skewMultipliers  Per-moneyness multipliers (default: DEFAULT_SKEW_MULTIPLIERS)
 * @param termMultipliers  Per-expiry multipliers (default: DEFAULT_TERM_MULTIPLIERS)
 * @returns A VolSurface suitable for use in computeGreeks or on-chain update_vol_surface
 */
export function buildVolSurface(
  atmVol: number,
  skewMultipliers: number[] = DEFAULT_SKEW_MULTIPLIERS,
  termMultipliers: number[] = DEFAULT_TERM_MULTIPLIERS,
): VolSurface {
  const surface: number[][] = [];

  for (let e = 0; e < termMultipliers.length; e++) {
    const row: number[] = [];
    for (let m = 0; m < skewMultipliers.length; m++) {
      row.push(atmVol * skewMultipliers[m] * termMultipliers[e]);
    }
    surface.push(row);
  }

  return {
    surface,
    moneyness_nodes: DEFAULT_MONEYNESS_NODES.slice(0, skewMultipliers.length),
    expiry_days: DEFAULT_EXPIRY_DAYS.slice(0, termMultipliers.length),
  };
}

/**
 * Convert a VolSurface (with decimal IV values like 0.30) to the on-chain format
 * used by update_vol_surface (IV in basis points, fixed-size arrays).
 */
export function volSurfaceToOnChain(surface: VolSurface): {
  vol_surface: number[][];
  moneyness_nodes: number[];
  expiry_days: number[];
  node_count: number;
  expiry_count: number;
} {
  const MAX_NODES = 9;
  const MAX_EXPIRY = 4;

  // Convert IV from decimal to bps and pad to fixed-size arrays
  const volBps: number[][] = [];
  for (let e = 0; e < MAX_EXPIRY; e++) {
    const row: number[] = [];
    for (let m = 0; m < MAX_NODES; m++) {
      const val = surface.surface[e]?.[m] ?? 0;
      row.push(Math.round(val * 10_000)); // 0.30 → 3000 bps
    }
    volBps.push(row);
  }

  // Moneyness nodes to 1e6 fixed-point
  const mNodes: number[] = new Array(MAX_NODES).fill(0);
  for (let i = 0; i < Math.min(surface.moneyness_nodes.length, MAX_NODES); i++) {
    mNodes[i] = Math.round(surface.moneyness_nodes[i] * 1_000_000);
  }

  // Expiry days (already integers)
  const eDays: number[] = new Array(MAX_EXPIRY).fill(0);
  for (let i = 0; i < Math.min(surface.expiry_days.length, MAX_EXPIRY); i++) {
    eDays[i] = surface.expiry_days[i];
  }

  return {
    vol_surface: volBps,
    moneyness_nodes: mNodes,
    expiry_days: eDays,
    node_count: Math.min(surface.moneyness_nodes.length, MAX_NODES),
    expiry_count: Math.min(surface.expiry_days.length, MAX_EXPIRY),
  };
}

/**
 * Fit a vol surface from ATM oracle variance data.
 *
 * Takes the raw variance from Sigma oracle (annualized, in bps),
 * converts to ATM IV, and generates a full surface with skew.
 *
 * @param varianceBps  Annualized variance in basis points (from Sigma oracle)
 * @returns On-chain formatted vol surface params
 */
export function fitVolSurfaceFromOracle(varianceBps: number) {
  // IV = sqrt(variance)
  const ivBps = Math.sqrt(varianceBps);
  const atmVol = ivBps / 10_000; // convert bps to decimal

  const surface = buildVolSurface(atmVol);
  return volSurfaceToOnChain(surface);
}
