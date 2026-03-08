"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marginRoutes = void 0;
const express_1 = require("express");
exports.marginRoutes = (0, express_1.Router)();
/* ------------------------------------------------------------------ */
/*  POST /v1/margin/calculate                                         */
/*  Calculate margin requirements for a set of positions.             */
/* ------------------------------------------------------------------ */
exports.marginRoutes.post("/calculate", (req, res) => {
    try {
        const { positions, collateral } = req.body;
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
        const result = {
            initial_margin: totalInitial,
            maintenance_margin: totalMaintenance,
            margin_used: totalInitial,
            margin_available: Math.max(0, collateral - totalInitial),
            positions: positionDetails,
        };
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: message });
    }
});
/* ------------------------------------------------------------------ */
/*  POST /v1/margin/health                                            */
/*  Check margin health: equity, maintenance margin, liq distance.    */
/* ------------------------------------------------------------------ */
exports.marginRoutes.post("/health", (req, res) => {
    try {
        const { positions, collateral, unrealized_pnl } = req.body;
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
        let health;
        if (marginRatio >= 3.0)
            health = "healthy";
        else if (marginRatio >= 1.5)
            health = "warning";
        else if (marginRatio >= 1.0)
            health = "critical";
        else
            health = "liquidatable";
        const result = {
            equity,
            total_maintenance_margin: totalMaintenance,
            margin_ratio: marginRatio,
            liquidation_distance: liquidationDistance,
            health,
        };
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: message });
    }
});
/* ------------------------------------------------------------------ */
/*  POST /v1/margin/delta-net                                         */
/*  Calculate delta-netted margin for hedged positions.               */
/* ------------------------------------------------------------------ */
exports.marginRoutes.post("/delta-net", (req, res) => {
    try {
        const { positions } = req.body;
        if (!positions || !Array.isArray(positions) || positions.length === 0) {
            res.status(400).json({ error: "positions array is required and must not be empty" });
            return;
        }
        // Mock implementation — group by underlying, compute net delta
        const groups = {};
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
            if (delta > 0)
                groups[underlying].longDelta += delta;
            else
                groups[underlying].shortDelta += Math.abs(delta);
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
        const avgReduction = nettingGroups.length > 0
            ? nettingGroups.reduce((sum, g) => sum + g.margin_reduction, 0) / nettingGroups.length
            : 0;
        const nettedMargin = grossMargin * (1 - avgReduction);
        const savings = grossMargin - nettedMargin;
        const result = {
            gross_margin: grossMargin,
            netted_margin: nettedMargin,
            savings,
            savings_pct: grossMargin > 0 ? (savings / grossMargin) * 100 : 0,
            netting_groups: nettingGroups,
        };
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: message });
    }
});
