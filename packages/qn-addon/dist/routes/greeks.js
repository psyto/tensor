"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.greeksRoutes = void 0;
const express_1 = require("express");
exports.greeksRoutes = (0, express_1.Router)();
/* ------------------------------------------------------------------ */
/*  POST /v1/greeks/compute                                           */
/*  Compute Greeks for individual options positions.                  */
/* ------------------------------------------------------------------ */
exports.greeksRoutes.post("/compute", (req, res) => {
    try {
        const { positions } = req.body;
        if (!positions || !Array.isArray(positions) || positions.length === 0) {
            res.status(400).json({ error: "positions array is required and must not be empty" });
            return;
        }
        for (const p of positions) {
            if (!p.asset || !p.option_type || !p.strike || !p.expiry || !p.underlying_price) {
                res.status(400).json({
                    error: "Each position requires: asset, option_type, strike, expiry, underlying_price, implied_volatility",
                });
                return;
            }
        }
        // Mock implementation — real Black-Scholes lives in Rust crates
        const results = positions.map((p) => {
            const moneyness = p.underlying_price / p.strike;
            const sign = p.side === "long" ? 1 : -1;
            const optSign = p.option_type === "call" ? 1 : -1;
            // Simplified mock Greeks
            const rawDelta = p.option_type === "call"
                ? 0.5 + 0.3 * Math.min(1, Math.max(-1, moneyness - 1))
                : -0.5 + 0.3 * Math.min(1, Math.max(-1, moneyness - 1));
            const gamma = 0.05 * Math.exp(-Math.pow(moneyness - 1, 2) * 10);
            const vega = p.underlying_price * 0.01 * Math.exp(-Math.pow(moneyness - 1, 2) * 5);
            const theta = -p.underlying_price * (p.implied_volatility || 0.3) * 0.01 * Math.abs(optSign);
            return {
                asset: p.asset,
                option_type: p.option_type,
                side: p.side,
                size: p.size,
                delta: rawDelta * sign * p.size,
                gamma: gamma * Math.abs(p.size),
                vega: vega * sign * p.size,
                theta: theta * sign * p.size,
            };
        });
        res.json({ positions: results });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: message });
    }
});
/* ------------------------------------------------------------------ */
/*  POST /v1/greeks/portfolio                                         */
/*  Aggregate portfolio Greeks across all positions.                  */
/* ------------------------------------------------------------------ */
exports.greeksRoutes.post("/portfolio", (req, res) => {
    try {
        const { positions } = req.body;
        if (!positions || !Array.isArray(positions) || positions.length === 0) {
            res.status(400).json({ error: "positions array is required and must not be empty" });
            return;
        }
        // Mock implementation
        let totalDelta = 0;
        let totalGamma = 0;
        let totalVega = 0;
        let totalTheta = 0;
        const positionGreeks = positions.map((p) => {
            const moneyness = p.underlying_price / p.strike;
            const sign = p.side === "long" ? 1 : -1;
            const optSign = p.option_type === "call" ? 1 : -1;
            const rawDelta = p.option_type === "call"
                ? 0.5 + 0.3 * Math.min(1, Math.max(-1, moneyness - 1))
                : -0.5 + 0.3 * Math.min(1, Math.max(-1, moneyness - 1));
            const gamma = 0.05 * Math.exp(-Math.pow(moneyness - 1, 2) * 10);
            const vega = p.underlying_price * 0.01 * Math.exp(-Math.pow(moneyness - 1, 2) * 5);
            const theta = -p.underlying_price * (p.implied_volatility || 0.3) * 0.01 * Math.abs(optSign);
            const d = rawDelta * sign * p.size;
            const g = gamma * Math.abs(p.size);
            const v = vega * sign * p.size;
            const t = theta * sign * p.size;
            totalDelta += d;
            totalGamma += g;
            totalVega += v;
            totalTheta += t;
            return {
                asset: p.asset,
                option_type: p.option_type,
                side: p.side,
                size: p.size,
                delta: d,
                gamma: g,
                vega: v,
                theta: t,
            };
        });
        const result = {
            delta: totalDelta,
            gamma: totalGamma,
            vega: totalVega,
            theta: totalTheta,
            positions: positionGreeks,
            net_exposure: totalDelta,
        };
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: message });
    }
});
