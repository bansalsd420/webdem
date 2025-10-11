import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
connectionLimit: 20,
  waitForConnections: true,
  queueLimit: 0,
  namedPlaceholders: true,
  // Fail fast if DB is unreachable instead of hanging
  connectTimeout: 10_000,
  // Keep sockets alive (helps behind NAT/VPN)
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Optional TLS for cloud MySQL (PlanetScale/RDS/Azure). Toggle with MYSQL_SSL=1
  ssl: (/^(1|true)$/i).test(process.env.MYSQL_SSL || '') ? { rejectUnauthorized: false } : undefined
});

// Resilient query wrapper with a small retry/backoff for transient errors
export async function queryWithRetry(sql, params = [], retries = 2) {
  const transient = new Set([
    'PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ER_LOCK_DEADLOCK'
  ]);
  let attempt = 0;
  while (true) {
    try {
      return await pool.query(sql, params);
    } catch (e) {
      const code = e?.code || e?.errno || e?.sqlState;
      if (attempt < retries && code && transient.has(String(code))) {
        attempt += 1;
        const backoff = 50 * Math.pow(2, attempt);
        console.warn(`[db] transient error ${code}, retrying ${attempt}/${retries} after ${backoff}ms`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw e;
    }
  }
}
