import type {
  OptionPosition,
  Greeks,
  PositionGreeks,
  PortfolioGreeks,
  VolSurface,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Standard normal helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Standard normal probability density function: phi(x).
 */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Cumulative distribution function for the standard normal distribution.
 * Uses the Abramowitz & Stegun rational approximation (error < 7.5e-8).
 */
export function normCdf(x: number): number {
  if (x > 8) return 1;
  if (x < -8) return 0;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const y =
    1.0 - (a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5) * Math.exp(-0.5 * absX * absX);

  return 0.5 * (1.0 + sign * y);
}

/* ------------------------------------------------------------------ */
/*  Black-Scholes d1 / d2                                              */
/* ------------------------------------------------------------------ */

/**
 * Compute d1 and d2 for the Black-Scholes model.
 *
 * @param S  Underlying price
 * @param K  Strike price
 * @param T  Time to expiry in years (must be > 0)
 * @param r  Risk-free rate (annualized, e.g. 0.05 for 5%)
 * @param sigma  Implied volatility (annualized, e.g. 0.30 for 30%)
 */
export function d1d2(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
): { d1: number; d2: number } {
  const sqrtT = Math.sqrt(T);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return { d1, d2 };
}

/* ------------------------------------------------------------------ */
/*  Volatility surface interpolation                                   */
/* ------------------------------------------------------------------ */

/**
 * Interpolate implied volatility from a discretized vol surface using
 * bilinear interpolation between moneyness nodes and expiry buckets.
 *
 * @param surface  Vol surface data (moneyness_nodes, expiry_days, surface[][])
 * @param strike   Option strike price
 * @param spot     Current spot/mark price
 * @param daysToExpiry  Days until option expiry
 * @returns  Interpolated IV (annualized, e.g. 0.30 for 30%)
 */
export function interpolateVol(
  surface: VolSurface,
  strike: number,
  spot: number,
  daysToExpiry: number,
): number {
  const { moneyness_nodes, expiry_days, surface: grid } = surface;
  if (moneyness_nodes.length === 0 || expiry_days.length === 0 || spot === 0) {
    return 0;
  }

  const moneyness = strike / spot;

  const [mLo, mHi, mFrac] = findBounds(moneyness_nodes, moneyness);
  const [eLo, eHi, eFrac] = findBounds(expiry_days, daysToExpiry);

  // Bilinear interpolation
  const v00 = grid[eLo]?.[mLo] ?? 0;
  const v01 = grid[eLo]?.[mHi] ?? 0;
  const v10 = grid[eHi]?.[mLo] ?? 0;
  const v11 = grid[eHi]?.[mHi] ?? 0;

  const v0 = v00 + (v01 - v00) * mFrac;
  const v1 = v10 + (v11 - v10) * mFrac;
  return v0 + (v1 - v0) * eFrac;
}

/**
 * Find bounding indices and fractional position in a sorted array.
 */
function findBounds(
  arr: number[],
  value: number,
): [lo: number, hi: number, frac: number] {
  if (arr.length <= 1) return [0, 0, 0];
  if (value <= arr[0]) return [0, 0, 0];
  if (value >= arr[arr.length - 1]) return [arr.length - 1, arr.length - 1, 0];

  for (let i = 0; i < arr.length - 1; i++) {
    if (value >= arr[i] && value <= arr[i + 1]) {
      const range = arr[i + 1] - arr[i];
      const frac = range > 0 ? (value - arr[i]) / range : 0;
      return [i, i + 1, frac];
    }
  }
  return [arr.length - 1, arr.length - 1, 0];
}

/* ------------------------------------------------------------------ */
/*  computeGreeks (single position)                                    */
/* ------------------------------------------------------------------ */

/**
 * Compute Black-Scholes Greeks for a single option position.
 * Returns unit Greeks multiplied by position size and adjusted for side.
 * If the position has a vol_surface, uses interpolated IV instead of flat implied_volatility.
 */
export function computeGreeks(position: OptionPosition): PositionGreeks {
  const S = position.underlying_price;
  const K = position.strike;

  // Use vol surface if available, otherwise flat IV
  let sigma = position.implied_volatility;
  if (position.vol_surface) {
    const expiryDate = new Date(position.expiry);
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const dte = Math.max(1, (expiryDate.getTime() - now.getTime()) / msPerDay);
    const interpolated = interpolateVol(position.vol_surface, K, S, dte);
    if (interpolated > 0) {
      sigma = interpolated;
    }
  }
  const r = position.risk_free_rate ?? 0.05;

  // Time to expiry in years
  const expiryDate = new Date(position.expiry);
  const now = new Date();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  let T = (expiryDate.getTime() - now.getTime()) / msPerYear;
  if (T <= 0) T = 1 / 365.25; // floor at ~1 day to avoid division by zero

  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const sign = position.side === "long" ? 1 : -1;

  // Unit Greeks (per 1 contract)
  let unitDelta: number;
  let unitTheta: number;

  if (position.option_type === "call") {
    unitDelta = normCdf(d1);
    unitTheta =
      (-S * normPdf(d1) * sigma) / (2 * sqrtT) -
      r * K * Math.exp(-r * T) * normCdf(d2);
  } else {
    unitDelta = normCdf(d1) - 1;
    unitTheta =
      (-S * normPdf(d1) * sigma) / (2 * sqrtT) +
      r * K * Math.exp(-r * T) * normCdf(-d2);
  }

  const unitGamma = normPdf(d1) / (S * sigma * sqrtT);
  const unitVega = (S * normPdf(d1) * sqrtT) / 100; // per 1% vol move

  // Scale by size and side
  const sz = position.size;

  return {
    asset: position.asset,
    option_type: position.option_type,
    side: position.side,
    size: sz,
    delta: unitDelta * sign * sz,
    gamma: unitGamma * Math.abs(sz), // gamma always positive
    vega: unitVega * sign * sz,
    theta: (unitTheta / 365) * sign * sz, // daily theta
  };
}

/* ------------------------------------------------------------------ */
/*  aggregatePortfolioGreeks                                           */
/* ------------------------------------------------------------------ */

/**
 * Compute Greeks for every position and aggregate into portfolio totals.
 */
export function aggregatePortfolioGreeks(
  positions: OptionPosition[],
): PortfolioGreeks {
  let totalDelta = 0;
  let totalGamma = 0;
  let totalVega = 0;
  let totalTheta = 0;

  const positionGreeks: PositionGreeks[] = positions.map((p) => {
    const g = computeGreeks(p);
    totalDelta += g.delta;
    totalGamma += g.gamma;
    totalVega += g.vega;
    totalTheta += g.theta;
    return g;
  });

  return {
    delta: totalDelta,
    gamma: totalGamma,
    vega: totalVega,
    theta: totalTheta,
    positions: positionGreeks,
    net_exposure: totalDelta,
  };
}
