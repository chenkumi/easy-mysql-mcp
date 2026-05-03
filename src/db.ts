import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const {
  MYSQL_HOST,
  MYSQL_PORT,
  MYSQL_USER,
  MYSQL_PASSWORD,
  MYSQL_DATABASE,
  MYSQL_CONNECTION_LIMIT,
  MYSQL_MAX_IDLE,
  MYSQL_IDLE_TIMEOUT,
  MYSQL_QUEUE_LIMIT,
  MYSQL_WAIT_FOR_CONNECTIONS,
  MYSQL_ENABLE_KEEP_ALIVE,
  MYSQL_KEEP_ALIVE_INITIAL_DELAY,
} = process.env;

if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_PASSWORD || !MYSQL_DATABASE) {
  console.error('Missing required environment variables for MySQL connection.');
  process.exit(1);
}

export const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT ? parseInt(MYSQL_PORT) : 3306,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: MYSQL_WAIT_FOR_CONNECTIONS !== 'false',
  connectionLimit: MYSQL_CONNECTION_LIMIT ? parseInt(MYSQL_CONNECTION_LIMIT) : 10,
  maxIdle: MYSQL_MAX_IDLE ? parseInt(MYSQL_MAX_IDLE) : 10,
  idleTimeout: MYSQL_IDLE_TIMEOUT ? parseInt(MYSQL_IDLE_TIMEOUT) : 60000,
  queueLimit: MYSQL_QUEUE_LIMIT ? parseInt(MYSQL_QUEUE_LIMIT) : 0,
  enableKeepAlive: MYSQL_ENABLE_KEEP_ALIVE !== 'false',
  keepAliveInitialDelay: MYSQL_KEEP_ALIVE_INITIAL_DELAY ? parseInt(MYSQL_KEEP_ALIVE_INITIAL_DELAY) : 0,
});


export async function query(sql: string, params?: any[]) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function execute(sql: string, params?: any[]) {
  const [result] = await pool.execute(sql, params);
  return result;
}
