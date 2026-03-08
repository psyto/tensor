"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceLookup = instanceLookup;
const models_1 = require("../db/models");
function instanceLookup(req, res, next) {
    const endpointId = req.headers["x-instance-id"];
    if (!endpointId) {
        res.status(400).json({ error: "Missing X-INSTANCE-ID header" });
        return;
    }
    const instance = (0, models_1.getActiveInstanceByEndpointId)(endpointId);
    if (!instance) {
        res.status(404).json({ error: "Instance not found or inactive" });
        return;
    }
    req.instance = instance;
    next();
}
