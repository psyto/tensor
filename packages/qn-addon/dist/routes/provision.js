"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const basic_auth_1 = require("../middleware/basic-auth");
const rate_limit_1 = require("../middleware/rate-limit");
const models_1 = require("../db/models");
const router = (0, express_1.Router)();
/* ------------------------------------------------------------------ */
/*  Provision — POST /provision                                       */
/* ------------------------------------------------------------------ */
router.post("/provision", rate_limit_1.provisionLimiter, basic_auth_1.basicAuth, (req, res) => {
    try {
        const body = req.body;
        if (!body["quicknode-id"] || !body["endpoint-id"]) {
            res.status(400).json({ error: "Missing required fields" });
            return;
        }
        const existing = (0, models_1.getInstanceByEndpointId)(body["endpoint-id"]);
        if (existing) {
            res.status(409).json({
                status: "error",
                error: "Instance already provisioned",
            });
            return;
        }
        const instance = (0, models_1.createInstance)({
            quicknode_id: body["quicknode-id"],
            endpoint_id: body["endpoint-id"],
            wss_url: body["wss-url"] || "",
            http_url: body["http-url"] || "",
            chain: body.chain || "solana",
            network: body.network || "mainnet-beta",
            plan: body.plan || "starter",
            referers: body.referers,
            contract_addresses: body["contract-addresses"],
        });
        res.json({
            status: "success",
            "endpoint-id": instance.endpoint_id,
            plan: instance.plan,
        });
    }
    catch (err) {
        console.error("[provision] error:", err);
        res.status(500).json({ status: "error", error: "Provisioning failed" });
    }
});
/* ------------------------------------------------------------------ */
/*  Update — PUT /update                                              */
/* ------------------------------------------------------------------ */
router.put("/update", rate_limit_1.provisionLimiter, basic_auth_1.basicAuth, (req, res) => {
    try {
        const body = req.body;
        if (!body["endpoint-id"]) {
            res.status(400).json({ error: "Missing endpoint-id" });
            return;
        }
        const existing = (0, models_1.getInstanceByEndpointId)(body["endpoint-id"]);
        if (!existing) {
            res.status(404).json({ status: "error", error: "Instance not found" });
            return;
        }
        const updated = (0, models_1.updateInstance)(body["endpoint-id"], {
            wss_url: body["wss-url"],
            http_url: body["http-url"],
            chain: body.chain,
            network: body.network,
            plan: body.plan,
            referers: body.referers,
            contract_addresses: body["contract-addresses"],
        });
        res.json({
            status: "success",
            "endpoint-id": updated?.endpoint_id,
            plan: updated?.plan,
        });
    }
    catch (err) {
        console.error("[update] error:", err);
        res.status(500).json({ status: "error", error: "Update failed" });
    }
});
/* ------------------------------------------------------------------ */
/*  Deactivate — DELETE /deactivate_endpoint                          */
/* ------------------------------------------------------------------ */
router.delete("/deactivate_endpoint", rate_limit_1.provisionLimiter, basic_auth_1.basicAuth, (req, res) => {
    try {
        const body = req.body;
        if (!body["endpoint-id"]) {
            res.status(400).json({ error: "Missing endpoint-id" });
            return;
        }
        (0, models_1.deactivateInstance)(body["endpoint-id"]);
        res.json({ status: "success" });
    }
    catch (err) {
        console.error("[deactivate] error:", err);
        res.status(500).json({ status: "error", error: "Deactivation failed" });
    }
});
/* ------------------------------------------------------------------ */
/*  Deprovision — DELETE /deprovision                                 */
/* ------------------------------------------------------------------ */
router.delete("/deprovision", rate_limit_1.provisionLimiter, basic_auth_1.basicAuth, (req, res) => {
    try {
        const body = req.body;
        if (!body["quicknode-id"]) {
            res.status(400).json({ error: "Missing quicknode-id" });
            return;
        }
        (0, models_1.deprovisionByQuicknodeId)(body["quicknode-id"]);
        res.json({ status: "success" });
    }
    catch (err) {
        console.error("[deprovision] error:", err);
        res
            .status(500)
            .json({ status: "error", error: "Deprovisioning failed" });
    }
});
exports.default = router;
