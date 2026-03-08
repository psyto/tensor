import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3060", 10),
  qnBasicAuthUsername: process.env.QN_BASIC_AUTH_USERNAME || "",
  qnBasicAuthPassword: process.env.QN_BASIC_AUTH_PASSWORD || "",
  dbPath: process.env.DB_PATH || "./tensor-qn.db",
};
