import { createRequire } from 'node:module';
import type { AST, TableColumnAst } from 'node-sql-parser';
import { config, isReadOnlyMode, normalizeTableName } from './config.js';

const require = createRequire(import.meta.url);
const { Parser } = require('node-sql-parser/build/mysql.js') as typeof import('node-sql-parser/build/mysql.js');

const parser = new Parser();
const parserOptions = { database: 'MySQL' };
const readQueryTypes = new Set(['select', 'show', 'desc', 'describe', 'explain']);
const executeTypes = new Set(['insert', 'update', 'delete', 'replace']);

type ParsedSql = {
  ast: AST | AST[] | any;
  type: string;
  tables: string[];
};

export type SqlAnalysis = {
  statementType: string;
  tableNames: string[];
};

export class SqlPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlPolicyError';
  }
}

export function assertReadQueryAllowed(sql: string): void {
  const parsed = parseSingleStatement(sql);

  if (!readQueryTypes.has(parsed.type)) {
    throw new SqlPolicyError(
      `SQL rejected: mysql_query only allows SELECT, SHOW, DESCRIBE, and EXPLAIN statements. Received ${parsed.type.toUpperCase()}.`,
    );
  }

  assertNoUnsafeReadOptions(parsed.ast);
  assertTablePolicy(parsed.tables);
}

export function analyzeSql(sql: string): SqlAnalysis {
  const parsed = parseSingleStatement(sql);

  return {
    statementType: parsed.type,
    tableNames: parsed.tables,
  };
}

export function assertExplainQueryAllowed(sql: string): void {
  const parsed = parseSingleStatement(sql);

  if (parsed.type !== 'select') {
    throw new SqlPolicyError(`SQL rejected: explain_query only accepts a SELECT statement. Received ${parsed.type.toUpperCase()}.`);
  }

  assertNoUnsafeReadOptions(parsed.ast);
  assertTablePolicy(parsed.tables);
}

export function assertExecuteAllowed(sql: string): void {
  if (isReadOnlyMode()) {
    throw new SqlPolicyError('SQL rejected: write execution is disabled because MYSQL_READ_ONLY=true or MYSQL_MCP_MODE=readonly.');
  }

  const parsed = parseSingleStatement(sql);

  if (!executeTypes.has(parsed.type)) {
    throw new SqlPolicyError(
      `SQL rejected: mysql_execute only allows INSERT, UPDATE, DELETE, and REPLACE statements. Received ${parsed.type.toUpperCase()}.`,
    );
  }

  assertTablePolicy(parsed.tables);
}

export function assertTablesAllowed(tables: string[]): void {
  assertTablePolicy(tables.map((table) => normalizeTableName(table)));
}

export function isTableAllowed(table: string): boolean {
  try {
    assertTablesAllowed([table]);
    return true;
  } catch (error) {
    if (error instanceof SqlPolicyError) {
      return false;
    }

    throw error;
  }
}

function parseSingleStatement(sql: string): ParsedSql {
  let parsed: TableColumnAst;

  try {
    parsed = parser.parse(sql, parserOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SqlPolicyError(`SQL rejected: unable to parse statement as MySQL SQL. ${message}`);
  }

  const ast = parsed.ast;

  if (Array.isArray(ast)) {
    if (ast.length !== 1) {
      throw new SqlPolicyError('SQL rejected: multiple statements are not allowed.');
    }

    return {
      ast: ast[0],
      type: getStatementType(ast[0]),
      tables: getVisitedTables(parsed, ast[0]),
    };
  }

  return {
    ast,
    type: getStatementType(ast),
    tables: getVisitedTables(parsed, ast),
  };
}

function getStatementType(ast: any): string {
  const type = typeof ast?.type === 'string' ? ast.type.toLowerCase() : 'unknown';
  return type === 'desc' ? 'describe' : type;
}

function assertNoUnsafeReadOptions(ast: any): void {
  if (Array.isArray(ast)) {
    for (const statement of ast) {
      assertNoUnsafeReadOptions(statement);
    }
    return;
  }

  if (ast?.type === 'select' && ast.into?.keyword) {
    throw new SqlPolicyError('SQL rejected: SELECT ... INTO is not allowed.');
  }

  if (ast?.locking_read) {
    throw new SqlPolicyError('SQL rejected: locking reads are not allowed in mysql_query.');
  }

  if (Array.isArray(ast?.with)) {
    for (const cte of ast.with) {
      assertNoUnsafeReadOptions(cte?.stmt?.ast);
    }
  }

  if (ast?.type === 'explain') {
    assertNoUnsafeReadOptions(ast.expr);
  }
}

function assertTablePolicy(tables: string[]): void {
  for (const table of tables) {
    if (matchesTableList(table, config.denyTables)) {
      throw new SqlPolicyError(`SQL rejected: table "${table}" is denied by MYSQL_MCP_DENY_TABLES.`);
    }

    if (config.allowTables.length > 0 && !matchesTableList(table, config.allowTables)) {
      throw new SqlPolicyError(`SQL rejected: table "${table}" is not included in MYSQL_MCP_ALLOW_TABLES.`);
    }
  }
}

function matchesTableList(table: string, configuredTables: string[]): boolean {
  if (configuredTables.includes(table)) {
    return true;
  }

  const tableOnly = table.split('.').at(-1);
  return tableOnly ? configuredTables.includes(tableOnly) : false;
}

function getVisitedTables(parsed: TableColumnAst, ast: any): string[] {
  const cteNames = collectCteNames(ast);
  const tables = new Set<string>();

  for (const tableRef of parsed.tableList) {
    const table = normalizeTableRef(tableRef);

    if (table && !cteNames.has(table)) {
      tables.add(table);
    }
  }

  for (const table of collectTablesFromAst(ast)) {
    const normalized = normalizeTableName(table);

    if (normalized && !cteNames.has(normalized)) {
      tables.add(normalized);
    }
  }

  return [...tables];
}

function normalizeTableRef(tableRef: string): string | null {
  const [, dbName, tableName] = tableRef.split('::');

  if (!tableName || tableName === 'null') {
    return null;
  }

  const normalizedTable = normalizeTableName(tableName);

  if (dbName && dbName !== 'null') {
    return `${normalizeTableName(dbName)}.${normalizedTable}`;
  }

  return normalizedTable;
}

function collectCteNames(ast: any): Set<string> {
  const names = new Set<string>();

  if (!Array.isArray(ast?.with)) {
    return names;
  }

  for (const cte of ast.with) {
    const value = cte?.name?.value;

    if (typeof value === 'string') {
      names.add(normalizeTableName(value));
    }
  }

  return names;
}

function collectTablesFromAst(ast: any): string[] {
  if (!ast) {
    return [];
  }

  switch (ast.type) {
    case 'desc':
    case 'describe':
      return typeof ast.table === 'string' ? [ast.table] : [];
    case 'explain':
      return collectTablesFromAst(ast.expr);
    default:
      return [];
  }
}
