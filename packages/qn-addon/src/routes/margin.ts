import { Router, type IRouter } from "express";

export const marginRoutes: IRouter = Router();

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Position {
  asset: string;
  side: "long" | "short";
  size: number;
  entry_price: number;
  mark_price: number;
  instrument_type: "perpetual" | "option" | "spot" | "lending";
  /** For options */
  option_type?: "call" | "put";
  strike?: number;
  expiry?: string;
}

interface MarginResult {
  initial_margin: number;
  maintenance_margin: number;
  margin_used: number;
  margin_available: number;
  positions: Array<{
    asset: string;
    position_margin: number;
    weight: number;
  }>;
}

interface HealthResult {
  equity: number;
  total_maintenance_margin: number;
  margin_ratio: number;
  liquidation_distance: number;
  health: "healthy" | "warning" | "critical" | "liquidatable";
}

interface DeltaNetResult {
  gross_margin: number;
  netted_margin: number;
  savings: number;
  savings_pct: number;
  netting_groups: Array<{
    asset: string;
    long_delta: number;
    short_delta: number;
    net_delta: number;
    margin_reduction: number;
  }>;
}

/* ------------------------------------------------------------------ */
/*  POST /v1/margin/calculate                                         */
/*  Calculate margin requirements for a set of positions.             */
/* ------------------------------------------------------------------ */
marginRoutes.post("/calculate", (req, res) => {
  try {
    const { positions, collateral } = req.body as {
      positions: Position[];
      collateral: number;
    };

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      res.status(400).json({ error: "positions array is required and must not be empty" });
      return;
    }

    if (collateral === undefined || typeof collateral !== "number") {
      res.status(400).json({ error: "collateral (number) is required" });
      return;
    }

    // Mock implementation — real math lives in Rust crates
    let totalInitial = 0;
    let totalMaintenance = 0;
    const positionDetails = positions.map((p) => {
      const notional = Math.abs(p.size * p.mark_price);
      const weight = p.instrument_type === "option" ? 0.15 : 0.10;
      const posMargin = notional * weight;
      totalInitial += posMargin;
      totalMaintenance += posMargin * 0.5;
      return {
        asset: p.asset,
        position_margin: posMargin,
        weight,
      };
    });

    const result: MarginResult = {
      initial_margin: totalInitial,
      maintenance_margin: totalMaintenance,
      margin_used: totalInitial,
      margin_available: Math.max(0, collateral - totalInitial),
      positions: positionDetails,
    };

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /v1/margin/health                                            */
/*  Check margin health: equity, maintenance margin, liq distance.    */
/* ------------------------------------------------------------------ */
marginRoutes.post("/health", (req, res) => {
  try {
    const { positions, collateral, unrealized_pnl } = req.body as {
      positions: Position[];
      collateral: number;
      unrealized_pnl?: number;
    };

    if (!positions || !Array.isArray(positions)) {
      res.status(400).json({ error: "positions array is required" });
      return;
    }

    if (collateral === undefined || typeof collateral !== "number") {
      res.status(400).json({ error: "collateral (number) is required" });
      return;
    }

    // Mock implementation
    const equity = collateral + (unrealized_pnl || 0);

    let totalMaintenance = 0;
    for (const p of positions) {
      const notional = Math.abs(p.size * p.mark_price);
      const weight = p.instrument_type === "option" ? 0.15 : 0.10;
      totalMaintenance += notional * weight * 0.5;
    }

    const marginRatio = totalMaintenance > 0 ? equity / totalMaintenance : Infinity;
    const liquidationDistance = Math.max(0, equity - totalMaintenance);

    let health: HealthResult["health"];
    if (marginRatio >= 3.0) health = "healthy";
    else if (marginRatio >= 1.5) health = "warning";
    else if (marginRatio >= 1.0) health = "critical";
    else health = "liquidatable";

    const result: HealthResult = {
      equity,
      total_maintenance_margin: totalMaintenance,
      margin_ratio: marginRatio,
      liquidation_distance: liquidationDistance,
      health,
    };

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /v1/margin/delta-net                                         */
/*  Calculate delta-netted margin for hedged positions.               */
/* ------------------------------------------------------------------ */
marginRoutes.post("/delta-net", (req, res) => {
  try {
    const { positions } = req.body as { positions: Position[] };

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      res.status(400).json({ error: "positions array is required and must not be empty" });
      return;
    }

    // Mock implementation — group by underlying, compute net delta
    const groups: Record<string, { longDelta: number; shortDelta: number }> = {};

    let grossMargin = 0;

    for (const p of positions) {
      const notional = Math.abs(p.size * p.mark_price);
      const weight = p.instrument_type === "option" ? 0.15 : 0.10;
      grossMargin += notional * weight;

      const underlying = p.asset.split("-")[0] || p.asset;
      if (!groups[underlying]) {
        groups[underlying] = { longDelta: 0, shortDelta: 0 };
      }

      const delta = p.side === "long" ? p.size : -p.size;
      if (delta > 0) groups[underlying].longDelta += delta;
      else groups[underlying].shortDelta += Math.abs(delta);
    }

    const nettingGroups = Object.entries(groups).map(([asset, g]) => {
      const netDelta = Math.abs(g.longDelta - g.shortDelta);
      const grossDelta = g.longDelta + g.shortDelta;
      const reduction = grossDelta > 0 ? 1 - netDelta / grossDelta : 0;
      return {
        asset,
        long_delta: g.longDelta,
        short_delta: g.shortDelta,
        net_delta: netDelta,
        margin_reduction: reduction,
      };
    });

    const avgReduction =
      nettingGroups.length > 0
        ? nettingGroups.reduce((sum, g) => sum + g.margin_reduction, 0) / nettingGroups.length
        : 0;

    const nettedMargin = grossMargin * (1 - avgReduction);
    const savings = grossMargin - nettedMargin;

    const result: DeltaNetResult = {
      gross_margin: grossMargin,
      netted_margin: nettedMargin,
      savings,
      savings_pct: grossMargin > 0 ? (savings / grossMargin) * 100 : 0,
      netting_groups: nettingGroups,
    };

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});
