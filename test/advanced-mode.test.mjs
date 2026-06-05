import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

loadDotEnv(path.resolve('.env'));

const suffix = Date.now();
const requiredEnv = [
  'TEST_HOST',
  'TEST_PORT',
  'TEST_USERNAME',
  'TEST_PASSWORD',
  'TEST_DB',
];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
const testTable = `mcp_advanced_${suffix}`;
const deniedTable = `mcp_advanced_denied_${suffix}`;
const testView = `mcp_advanced_view_${suffix}`;
const testTrigger = `mcp_advanced_before_insert_${suffix}`;
const testIndex = `idx_mcp_advanced_${suffix}`;
const multiStatementTableA = `${testTable}_a`;
const multiStatementTableB = `${testTable}_b`;

if (missingEnv.length === 0) {
  process.env.MYSQL_HOST = process.env.TEST_HOST;
  process.env.MYSQL_PORT = process.env.TEST_PORT;
  process.env.MYSQL_USER = process.env.TEST_USERNAME;
  process.env.MYSQL_PASSWORD = process.env.TEST_PASSWORD;
  process.env.MYSQL_DATABASE = process.env.TEST_DB;
  process.env.MYSQL_MCP_MODE = 'advanced';
  process.env.MYSQL_MCP_ALLOW_TABLES = [testTable, deniedTable, testView, testTrigger].join(',');
  process.env.MYSQL_MCP_DENY_TABLES = deniedTable;
}

test('advanced mode schema execution integration tests', { skip: missingEnv.length > 0 ? `Missing test env: ${missingEnv.join(', ')}` : false }, async (t) => {
  const db = await import('../build/db.js');
  const tools = await import('../build/toolHandlers.js');

  await teardownDatabase(db);

  try {
    await t.test('creates and alters table schema', async () => {
      const createResult = await tools.mysqlSchemaExecute(`
        CREATE TABLE ${db.escapeIdentifier(testTable)} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL
        )
      `);
      assert.ok(createResult);

      await tools.mysqlSchemaExecute(`ALTER TABLE ${db.escapeIdentifier(testTable)} ADD COLUMN note VARCHAR(255) NULL`);
      const columns = await db.query(`SHOW COLUMNS FROM ${db.escapeIdentifier(testTable)}`);
      assert.ok(columns.some((column) => column.Field === 'note'));
    });

    await t.test('creates and drops index', async () => {
      await tools.mysqlSchemaExecute(`CREATE INDEX ${db.escapeIdentifier(testIndex)} ON ${db.escapeIdentifier(testTable)} (name)`);
      let indexes = await tools.describeIndex(testTable);
      assert.ok(indexes.some((row) => row.Key_name === testIndex));

      await tools.mysqlSchemaExecute(`DROP INDEX ${db.escapeIdentifier(testIndex)} ON ${db.escapeIdentifier(testTable)}`);
      indexes = await tools.describeIndex(testTable);
      assert.ok(!indexes.some((row) => row.Key_name === testIndex));
    });

    await t.test('creates and drops view', async () => {
      await tools.mysqlSchemaExecute(`CREATE VIEW ${db.escapeIdentifier(testView)} AS SELECT id, name FROM ${db.escapeIdentifier(testTable)}`);
      const views = await tools.listViews();
      assert.ok(views.some((row) => row.TABLE_NAME === testView));

      await tools.mysqlSchemaExecute(`DROP VIEW ${db.escapeIdentifier(testView)}`);
      const remainingViews = await tools.listViews();
      assert.ok(!remainingViews.some((row) => row.TABLE_NAME === testView));
    });

    await t.test('creates and drops trigger', async () => {
      await tools.mysqlSchemaExecute(`
        CREATE TRIGGER ${db.escapeIdentifier(testTrigger)}
        BEFORE INSERT ON ${db.escapeIdentifier(testTable)}
        FOR EACH ROW
        SET NEW.note = COALESCE(NEW.note, 'advanced-trigger')
      `);
      const triggers = await tools.listTriggers();
      assert.ok(triggers.some((row) => row.Trigger === testTrigger));

      await tools.mysqlSchemaExecute(`DROP TRIGGER ${db.escapeIdentifier(testTrigger)}`);
      const remainingTriggers = await tools.listTriggers();
      assert.ok(!remainingTriggers.some((row) => row.Trigger === testTrigger));
    });

    await t.test('rejects denied table schema changes', async () => {
      await assert.rejects(
        () => tools.mysqlSchemaExecute(`
          CREATE TABLE ${db.escapeIdentifier(deniedTable)} (
            id INT AUTO_INCREMENT PRIMARY KEY
          )
        `),
        /denied by MYSQL_MCP_DENY_TABLES/,
      );
    });

    await t.test('keeps multi statement blocked', async () => {
      await assert.rejects(
        () => tools.mysqlSchemaExecute(`CREATE TABLE ${db.escapeIdentifier(multiStatementTableA)} (id INT); CREATE TABLE ${db.escapeIdentifier(multiStatementTableB)} (id INT)`),
        /multiple statements are not allowed/,
      );
    });
  } finally {
    await teardownDatabase(db);
    await db.pool.end();
  }
});

async function teardownDatabase(db) {
  await db.query(`DROP TRIGGER IF EXISTS ${db.escapeIdentifier(testTrigger)}`);
  await db.query(`DROP VIEW IF EXISTS ${db.escapeIdentifier(testView)}`);
  await db.query(`DROP TABLE IF EXISTS ${db.escapeIdentifier(multiStatementTableA)}`);
  await db.query(`DROP TABLE IF EXISTS ${db.escapeIdentifier(multiStatementTableB)}`);
  await db.query(`DROP TABLE IF EXISTS ${db.escapeIdentifier(deniedTable)}`);
  await db.query(`DROP TABLE IF EXISTS ${db.escapeIdentifier(testTable)}`);
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = parseDotEnvValue(trimmed.slice(separatorIndex + 1).trim());

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseDotEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
