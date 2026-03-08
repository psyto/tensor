"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.intentRoutes = void 0;
const express_1 = require("express");
exports.intentRoutes = (0, express_1.Router)();
/* ------------------------------------------------------------------ */
/*  POST /v1/intents/validate                                         */
/*  Validate a multi-leg trading intent.                              */
/* ------------------------------------------------------------------ */
exports.intentRoutes.post("/validate", (req, res) => {
    try {
        const { intent } = req.body;
        if (!intent) {
            res.status(400).json({ error: "intent object is required" });
            return;
        }
        if (!intent.legs || !Array.isArray(intent.legs) || intent.legs.length === 0) {
            res.status(400).json({ error: "intent.legs array is required and must not be empty" });
            return;
        }
        // Mock validation logic
        const errors = [];
        const warnings = [];
        for (let i = 0; i < intent.legs.length; i++) {
            const leg = intent.legs[i];
            if (!leg.asset)
                errors.push(`Leg ${i}: asset is required`);
            if (!leg.side)
                errors.push(`Leg ${i}: side is required`);
            if (!leg.size || leg.size <= 0)
                errors.push(`Leg ${i}: size must be positive`);
            if (leg.instrument_type === "option" && !leg.option_type) {
                errors.push(`Leg ${i}: option_type is required for options`);
            }
            if (leg.instrument_type === "option" && !leg.strike) {
                errors.push(`Leg ${i}: strike is required for options`);
            }
            if (leg.instrument_type === "option" && !leg.expiry) {
                errors.push(`Leg ${i}: expiry is required for options`);
            }
        }
        if (intent.max_slippage_bps !== undefined && intent.max_slippage_bps > 500) {
            warnings.push("max_slippage_bps exceeds 5% — high slippage tolerance");
        }
        // Recognize common strategies
        const knownStrategies = [
            "bull-call-spread", "bear-put-spread", "straddle", "strangle",
            "iron-condor", "butterfly", "collar", "covered-call",
            "delta-neutral", "basis-trade", "calendar-spread",
        ];
        const recognized = knownStrategies.includes(intent.strategy || "");
        if (!recognized && intent.strategy) {
            warnings.push(`Strategy "${intent.strategy}" is not a recognized pattern — custom validation only`);
        }
        // Mock margin impact
        let marginImpact = 0;
        for (const leg of intent.legs) {
            marginImpact += leg.size * (leg.limit_price || 100) * 0.10;
        }
        const result = {
            valid: errors.length === 0,
            errors,
            warnings,
            estimated_margin_impact: marginImpact,
            strategy_recognized: recognized,
            strategy_type: recognized ? intent.strategy : null,
        };
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: message });
    }
});
/* ------------------------------------------------------------------ */
/*  POST /v1/intents/solve                                            */
/*  Decompose intent into optimal execution sequence.                 */
/* ------------------------------------------------------------------ */
exports.intentRoutes.post("/solve", (req, res) => {
    try {
        const { intent, constraints } = req.body;
        if (!intent) {
            res.status(400).json({ error: "intent object is required" });
            return;
        }
        if (!intent.legs || !Array.isArray(intent.legs) || intent.legs.length === 0) {
            res.status(400).json({ error: "intent.legs array is required and must not be empty" });
            return;
        }
        // Mock solver — real solver lives in Rust crates
        const preferAtomic = constraints?.prefer_atomic ?? true;
        const notes = [];
        // Sort legs: sells before buys to free up margin
        const sortedLegs = [...intent.legs].sort((a, b) => {
            if (a.side === "sell" && b.side === "buy")
                return -1;
            if (a.side === "buy" && b.side === "sell")
                return 1;
            return 0;
        });
        if (sortedLegs.length !== intent.legs.length) {
            notes.push("Legs reordered: sells first to maximize margin availability");
        }
        const steps = sortedLegs.map((leg, i) => ({
            sequence: i + 1,
            action: "open",
            asset: leg.asset,
            side: leg.side,
            size: leg.size,
            instrument_type: leg.instrument_type,
            reason: i === 0
                ? "Primary leg — establishes directional exposure"
                : `Leg ${i + 1} — ${leg.side === "sell" ? "hedges" : "extends"} position`,
            estimated_fill_price: leg.limit_price,
        }));
        if (preferAtomic && steps.length <= 4) {
            notes.push("All legs can be submitted atomically in a single transaction");
        }
        else if (steps.length > 4) {
            notes.push("Too many legs for atomic execution — split into sequential batches");
        }
        let estimatedMargin = 0;
        for (const leg of intent.legs) {
            estimatedMargin += leg.size * (leg.limit_price || 100) * 0.10;
        }
        // Apply delta-netting discount for hedged positions
        const hasBothSides = intent.legs.some((l) => l.side === "buy") &&
            intent.legs.some((l) => l.side === "sell");
        if (hasBothSides) {
            estimatedMargin *= 0.7;
            notes.push("Delta-netting applied: 30% margin reduction for hedged legs");
        }
        const maxSteps = constraints?.max_steps;
        const feasible = maxSteps === undefined || steps.length <= maxSteps;
        if (!feasible) {
            notes.push(`Infeasible: ${steps.length} steps required but max_steps=${maxSteps}`);
        }
        const result = {
            feasible,
            steps,
            total_steps: steps.length,
            estimated_gas: steps.length * 200000,
            estimated_margin_required: estimatedMargin,
            optimization_notes: notes,
        };
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: message });
    }
});
