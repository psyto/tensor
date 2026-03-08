"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInstance = createInstance;
exports.getInstanceByEndpointId = getInstanceByEndpointId;
exports.getActiveInstanceByEndpointId = getActiveInstanceByEndpointId;
exports.updateInstance = updateInstance;
exports.deactivateInstance = deactivateInstance;
exports.deprovisionByQuicknodeId = deprovisionByQuicknodeId;
const database_1 = require("./database");
function createInstance(data) {
    const db = (0, database_1.getDb)();
    const stmt = db.prepare(`
    INSERT INTO instances (quicknode_id, endpoint_id, wss_url, http_url, chain, network, plan, referers, contract_addresses)
    VALUES (@quicknode_id, @endpoint_id, @wss_url, @http_url, @chain, @network, @plan, @referers, @contract_addresses)
  `);
    const info = stmt.run({
        quicknode_id: data.quicknode_id,
        endpoint_id: data.endpoint_id,
        wss_url: data.wss_url,
        http_url: data.http_url,
        chain: data.chain,
        network: data.network,
        plan: data.plan,
        referers: data.referers ? JSON.stringify(data.referers) : null,
        contract_addresses: data.contract_addresses
            ? JSON.stringify(data.contract_addresses)
            : null,
    });
    return (0, database_1.getDb)()
        .prepare("SELECT * FROM instances WHERE id = ?")
        .get(info.lastInsertRowid);
}
function getInstanceByEndpointId(endpointId) {
    return (0, database_1.getDb)()
        .prepare("SELECT * FROM instances WHERE endpoint_id = ?")
        .get(endpointId);
}
function getActiveInstanceByEndpointId(endpointId) {
    return (0, database_1.getDb)()
        .prepare("SELECT * FROM instances WHERE endpoint_id = ? AND is_active = 1")
        .get(endpointId);
}
function updateInstance(endpointId, data) {
    const db = (0, database_1.getDb)();
    const fields = [];
    const values = { endpoint_id: endpointId };
    if (data.wss_url !== undefined) {
        fields.push("wss_url = @wss_url");
        values.wss_url = data.wss_url;
    }
    if (data.http_url !== undefined) {
        fields.push("http_url = @http_url");
        values.http_url = data.http_url;
    }
    if (data.chain !== undefined) {
        fields.push("chain = @chain");
        values.chain = data.chain;
    }
    if (data.network !== undefined) {
        fields.push("network = @network");
        values.network = data.network;
    }
    if (data.plan !== undefined) {
        fields.push("plan = @plan");
        values.plan = data.plan;
    }
    if (data.referers !== undefined) {
        fields.push("referers = @referers");
        values.referers = JSON.stringify(data.referers);
    }
    if (data.contract_addresses !== undefined) {
        fields.push("contract_addresses = @contract_addresses");
        values.contract_addresses = JSON.stringify(data.contract_addresses);
    }
    if (fields.length === 0) {
        return getInstanceByEndpointId(endpointId);
    }
    fields.push("updated_at = datetime('now')");
    db.prepare(`UPDATE instances SET ${fields.join(", ")} WHERE endpoint_id = @endpoint_id`).run(values);
    return getInstanceByEndpointId(endpointId);
}
function deactivateInstance(endpointId) {
    (0, database_1.getDb)()
        .prepare("UPDATE instances SET is_active = 0, updated_at = datetime('now') WHERE endpoint_id = ?")
        .run(endpointId);
}
function deprovisionByQuicknodeId(quicknodeId) {
    (0, database_1.getDb)()
        .prepare("DELETE FROM instances WHERE quicknode_id = ?")
        .run(quicknodeId);
}
