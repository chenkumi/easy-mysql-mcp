import { config } from './config.js';
import { exportCsv, importCsv } from './csvTools.js';
import * as db from './db.js';
import { writeBatchExecuteLog } from './logs.js';
import { runWithPolicy } from './policyHook.js';
import {
  analyzeSql,
  assertExecuteAllowed,
  assertExplainQueryAllowed,
  assertReadQueryAllowed,
  assertTablesAllowed,
  isTableAllowed,
} from './sqlPolicy.js';

export async function mysqlQuery(sql: string): Promise<unknown> {
  assertReadQueryAllowed(sql);
  const analysis = analyzeSql(sql);

  return runWithPolicy({
    functionName: 'mysql_query',
    sql,
    statementType: analysis.statementType,
    tableNames: analysis.tableNames,
  }, () => db.query(sql));
}

export async function mysqlExecute(sql: string, params?: any[]): Promise<unknown> {
  assertExecuteAllowed(sql);
  const analysis = analyzeSql(sql);

  return runWithPolicy({
    functionName: 'mysql_execute',
    sql,
    statementType: analysis.statementType,
    tableNames: analysis.tableNames,
    paramsPreview: params ?? null,
    summary: { sql, paramsPreview: params ?? null },
  }, () => db.execute(sql, params));
}

export async function mysqlBatchExecute(
  sql: string,
  paramsList: any[][],
  transaction: db.BatchTransactionMode,
): Promise<Record<string, unknown>> {
  assertExecuteAllowed(sql);
  const analysis = analyzeSql(sql);

  return runWithPolicy({
    functionName: 'mysql_batch_execute',
    sql,
    statementType: analysis.statementType,
    tableNames: analysis.tableNames,
    paramsPreview: { rows: paramsList.length, firstParams: paramsList[0] ?? null },
    summary: { sql, rows: paramsList.length, transaction },
  }, async () => {
    const summary = await db.batchExecute(sql, paramsList, {
      batchSize: config.batchMaxSize,
      transaction,
    });
    const logPath = await writeBatchExecuteLog({
      tool: 'mysql_batch_execute',
      success: true,
      sql,
      summary,
    });

    return {
      totalRows: summary.totalRows,
      batches: summary.batches,
      batchSize: summary.batchSize,
      transaction: summary.transaction,
      affectedRows: summary.affectedRows,
      changedRows: summary.changedRows,
      logPath,
    };
  }).catch(async (error) => {
    if (!(error instanceof db.BatchExecuteError)) {
      throw error;
    }

    const logPath = await writeBatchExecuteLog({
      tool: 'mysql_batch_execute',
      success: false,
      sql,
      summary: error.summary,
      error: error.message,
    });

    throw new Error(`Batch execution failed: ${error.message}. Detailed log: ${logPath}`);
  });
}

export async function mysqlImportCsv(
  tableName: string,
  filePath: string,
  transaction: db.BatchTransactionMode,
) {
  assertTablesAllowed([tableName]);

  return runWithPolicy({
    functionName: 'mysql_import_csv',
    sql: null,
    statementType: 'insert',
    tableNames: [tableName],
    paramsPreview: { filePath, transaction },
    summary: { tableName, filePath, transaction },
  }, () => importCsv(tableName, filePath, transaction));
}

export async function mysqlExportCsv(tableName: string, filePath: string) {
  assertTablesAllowed([tableName]);

  return runWithPolicy({
    functionName: 'mysql_export_csv',
    sql: null,
    statementType: 'export',
    tableNames: [tableName],
    paramsPreview: { filePath },
    summary: { tableName, filePath },
  }, () => exportCsv(tableName, filePath));
}

export async function explainQuery(sql: string): Promise<unknown> {
  assertExplainQueryAllowed(sql);
  const analysis = analyzeSql(sql);

  return runWithPolicy({
    functionName: 'explain_query',
    sql,
    statementType: 'explain',
    tableNames: analysis.tableNames,
  }, () => db.query(`EXPLAIN ${sql}`));
}

export async function listTables(): Promise<unknown> {
  return runWithPolicy({
    functionName: 'list_tables',
    sql: null,
    statementType: 'schema',
    tableNames: [],
  }, async () => {
    const results = await db.query(`
    SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
  `);

    return Array.isArray(results)
      ? results.filter((row: any) => typeof row.TABLE_NAME === 'string' && isTableAllowed(row.TABLE_NAME))
      : results;
  });
}

export async function listViews(): Promise<unknown> {
  return runWithPolicy({
    functionName: 'list_views',
    sql: null,
    statementType: 'schema',
    tableNames: [],
  }, async () => {
    const results = await db.query(`
    SELECT TABLE_NAME, VIEW_DEFINITION 
    FROM information_schema.VIEWS 
    WHERE TABLE_SCHEMA = DATABASE()
  `);

    return Array.isArray(results)
      ? results.filter((row: any) => typeof row.TABLE_NAME === 'string' && isTableAllowed(row.TABLE_NAME))
      : results;
  });
}

export async function describeTable(tables: string[]): Promise<Record<string, unknown>> {
  assertTablesAllowed(tables);

  return runWithPolicy({
    functionName: 'describe_table',
    sql: null,
    statementType: 'schema',
    tableNames: tables,
    summary: { tables },
  }, async () => {
    const results: Record<string, unknown> = {};
    for (const table of tables) {
      results[table] = await db.query(`DESCRIBE ${db.escapeIdentifier(table)}`);
    }

    return results;
  });
}

export async function describeIndex(table: string): Promise<unknown> {
  assertTablesAllowed([table]);

  return runWithPolicy({
    functionName: 'describe_index',
    sql: null,
    statementType: 'schema',
    tableNames: [table],
    summary: { table },
  }, () => db.query(`SHOW INDEX FROM ${db.escapeIdentifier(table)}`));
}

export async function listTriggers(): Promise<unknown> {
  return runWithPolicy({
    functionName: 'list_triggers',
    sql: null,
    statementType: 'schema',
    tableNames: [],
  }, async () => {
    const results = await db.query('SHOW TRIGGERS');

    return Array.isArray(results)
      ? results.filter((row: any) => typeof row.Table === 'string' && isTableAllowed(row.Table))
      : results;
  });
}

export async function getCurrentPrivileges(): Promise<Record<string, unknown>> {
  return runWithPolicy({
    functionName: 'get_current_privileges',
    sql: null,
    statementType: 'privileges',
    tableNames: [],
  }, async () => {
    const user = await db.query('SELECT CURRENT_USER() as user');
    const grants = await db.query('SHOW GRANTS');
    return { currentUser: user, grants };
  }) as Promise<Record<string, unknown>>;
}
