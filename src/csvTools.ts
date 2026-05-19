import { config } from './config.js';
import { readCsvFile, writeCsvFile } from './csv.js';
import * as db from './db.js';
import { writeBatchExecuteLog } from './logs.js';
import { assertExecuteAllowed, assertTablesAllowed } from './sqlPolicy.js';

export type CsvImportResult = {
  tableName: string;
  filePath: string;
  importedRows: number;
  batches: number;
  batchSize: number;
  transaction: db.BatchTransactionMode;
  affectedRows: number;
  changedRows: number;
  logPath: string;
};

export type CsvExportResult = {
  tableName: string;
  filePath: string;
  exportedRows: number;
  columns: number;
};

export async function importCsv(
  tableName: string,
  filePath: string,
  transaction: db.BatchTransactionMode,
): Promise<CsvImportResult> {
  assertTablesAllowed([tableName]);

  const csv = await readCsvFile(filePath);
  const escapedColumns = csv.headers.map((header) => db.escapeIdentifier(header)).join(', ');
  const placeholders = csv.headers.map(() => '?').join(', ');
  const sql = `INSERT INTO ${db.escapeIdentifier(tableName)} (${escapedColumns}) VALUES (${placeholders})`;
  assertExecuteAllowed(sql);

  try {
    const summary = await db.batchExecute(sql, csv.rows, {
      batchSize: config.batchMaxSize,
      transaction,
    });
    const logPath = await writeBatchExecuteLog({
      tool: 'mysql_import_csv',
      success: true,
      tableName,
      filePath,
      headers: csv.headers,
      sql,
      summary,
    });

    return {
      tableName,
      filePath,
      importedRows: summary.totalRows,
      batches: summary.batches,
      batchSize: summary.batchSize,
      transaction: summary.transaction,
      affectedRows: summary.affectedRows,
      changedRows: summary.changedRows,
      logPath,
    };
  } catch (error) {
    if (error instanceof db.BatchExecuteError) {
      const logPath = await writeBatchExecuteLog({
        tool: 'mysql_import_csv',
        success: false,
        tableName,
        filePath,
        headers: csv.headers,
        sql,
        summary: error.summary,
        error: error.message,
      });

      throw new Error(`CSV import failed: ${error.message}. Detailed log: ${logPath}`);
    }

    throw error;
  }
}

export async function exportCsv(tableName: string, filePath: string): Promise<CsvExportResult> {
  assertTablesAllowed([tableName]);

  const columns = await db.query(`SHOW COLUMNS FROM ${db.escapeIdentifier(tableName)}`);
  const headers = Array.isArray(columns)
    ? columns
      .map((column: any) => column.Field)
      .filter((field: unknown): field is string => typeof field === 'string')
    : [];
  const rows = await db.query(`SELECT * FROM ${db.escapeIdentifier(tableName)}`);
  const rowObjects = Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
  const exportHeaders = headers.length > 0 ? headers : collectExportHeaders(rowObjects);

  await writeCsvFile(filePath, exportHeaders, rowObjects);

  return {
    tableName,
    filePath,
    exportedRows: rowObjects.length,
    columns: exportHeaders.length,
  };
}

function collectExportHeaders(rows: Record<string, unknown>[]): string[] {
  const headers = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headers.add(key);
    }
  }

  return [...headers];
}
