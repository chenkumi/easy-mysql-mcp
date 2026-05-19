import mysql from 'mysql2/promise';

export type BatchTransactionMode = 'all' | 'batch' | 'each' | 'none';

export type BatchExecuteOptions = {
  batchSize: number;
  transaction: BatchTransactionMode;
};

export type BatchExecuteRowResult = {
  batch: number;
  row: number;
  success: boolean;
  params: any[];
  result?: any;
  error?: string;
};

export type BatchExecuteSummary = {
  totalRows: number;
  batchSize: number;
  batches: number;
  transaction: BatchTransactionMode;
  affectedRows: number;
  changedRows: number;
  results: BatchExecuteRowResult[];
};

export class BatchExecuteError extends Error {
  constructor(
    message: string,
    public readonly summary: BatchExecuteSummary,
  ) {
    super(message);
    this.name = 'BatchExecuteError';
  }
}

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
  multipleStatements: false,
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

export async function batchExecute(sql: string, paramsList: any[][], options: BatchExecuteOptions): Promise<BatchExecuteSummary> {
  const batches = chunk(paramsList, options.batchSize);
  const summary: BatchExecuteSummary = {
    totalRows: paramsList.length,
    batchSize: options.batchSize,
    batches: batches.length,
    transaction: options.transaction,
    affectedRows: 0,
    changedRows: 0,
    results: [],
  };

  const connection = await pool.getConnection();

  try {
    if (options.transaction === 'all') {
      await connection.beginTransaction();
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];

      if (options.transaction === 'batch') {
        await connection.beginTransaction();
      }

      for (let rowIndex = 0; rowIndex < batch.length; rowIndex += 1) {
        if (options.transaction === 'each') {
          await connection.beginTransaction();
        }

        const globalRow = batchIndex * options.batchSize + rowIndex;
        await executeBatchRow(connection, sql, batch[rowIndex], batchIndex, globalRow, summary);

        if (options.transaction === 'each') {
          await connection.commit();
        }
      }

      if (options.transaction === 'batch') {
        await connection.commit();
      }
    }

    if (options.transaction === 'all') {
      await connection.commit();
    }

    return summary;
  } catch (error) {
    if (options.transaction !== 'none') {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original batch execution error.
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new BatchExecuteError(message, summary);
  } finally {
    connection.release();
  }
}

export function escapeIdentifier(identifier: string) {
  return identifier
    .split('.')
    .map((part) => mysql.escapeId(part))
    .join('.');
}

async function executeBatchRow(
  connection: mysql.PoolConnection,
  sql: string,
  params: any[],
  batchIndex: number,
  globalRow: number,
  summary: BatchExecuteSummary,
): Promise<void> {
  try {
    const [result] = await connection.execute(sql, params);
    const rowResult: BatchExecuteRowResult = {
      batch: batchIndex + 1,
      row: globalRow + 1,
      success: true,
      params,
      result,
    };

    summary.results.push(rowResult);
    summary.affectedRows += getNumericResultValue(result, 'affectedRows');
    summary.changedRows += getNumericResultValue(result, 'changedRows');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    summary.results.push({
      batch: batchIndex + 1,
      row: globalRow + 1,
      success: false,
      params,
      error: message,
    });

    throw error;
  }
}

function getNumericResultValue(result: unknown, key: 'affectedRows' | 'changedRows'): number {
  if (typeof result === 'object' && result !== null && key in result) {
    const value = (result as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : 0;
  }

  return 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
