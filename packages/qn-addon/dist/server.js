"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const config_1 = require("./config");
const request_id_1 = require("./middleware/request-id");
const rate_limit_1 = require("./middleware/rate-limit");
const error_handler_1 = require("./middleware/error-handler");
const provision_1 = __importDefault(require("./routes/provision"));
const margin_1 = require("./routes/margin");
const greeks_1 = require("./routes/greeks");
const intents_1 = require("./routes/intents");
const app = (0, express_1.default)();
/* ------------------------------------------------------------------ */
/*  Global middleware                                                   */
/* ------------------------------------------------------------------ */
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, morgan_1.default)("short"));
app.use(request_id_1.requestId);
app.use(rate_limit_1.apiLimiter);
/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */
// Healthcheck (public, no auth)
app.get("/healthcheck", (_req, res) => {
    res.json({ status: "ok", service: "fabrknt-margin-engine", version: "0.1.0" });
});
// QuickNode provisioning (basic auth)
app.use(provision_1.default);
// API routes
app.use("/v1/margin", margin_1.marginRoutes);
app.use("/v1/greeks", greeks_1.greeksRoutes);
app.use("/v1/intents", intents_1.intentRoutes);
/* ------------------------------------------------------------------ */
/*  Error handler (must be last)                                       */
/* ------------------------------------------------------------------ */
app.use(error_handler_1.errorHandler);
app.listen(config_1.config.port, () => {
    console.log(`Tensor QN Add-On running on port ${config_1.config.port}`);
});
exports.default = app;
