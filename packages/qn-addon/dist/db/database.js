"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.closeDb = closeDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const config_1 = require("../config");
let db = null;
function getDb() {
    if (!db) {
        db = new better_sqlite3_1.default(config_1.config.dbPath);
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
        initDb(db);
    }
    return db;
}
function initDb(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS instances (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      quicknode_id    TEXT    NOT NULL,
      endpoint_id     TEXT    NOT NULL UNIQUE,
      wss_url         TEXT    NOT NULL,
      http_url        TEXT    NOT NULL,
      chain           TEXT    NOT NULL,
      network         TEXT    NOT NULL,
      plan            TEXT    NOT NULL DEFAULT 'starter',
      referers        TEXT,
      contract_addresses TEXT,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_instances_endpoint_id
      ON instances(endpoint_id);
    CREATE INDEX IF NOT EXISTS idx_instances_quicknode_id
      ON instances(quicknode_id);
  `);
}
function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}
