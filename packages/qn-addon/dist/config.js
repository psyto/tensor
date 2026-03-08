"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || "3060", 10),
    qnBasicAuthUsername: process.env.QN_BASIC_AUTH_USERNAME || "",
    qnBasicAuthPassword: process.env.QN_BASIC_AUTH_PASSWORD || "",
    dbPath: process.env.DB_PATH || "./tensor-qn.db",
};
