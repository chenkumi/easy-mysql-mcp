import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

loadDotEnv(path.resolve('.env'));

const requiredEnv = [
  'TEST_HOST',
  'TEST_PORT',
  'TEST_USERNAME',
  'TEST_PASSWORD',
  'TEST_DB',
];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
const suffix = Date.now();
const testTable = `mcp_test_${suffix}`;
const secondTable = `mcp_test_second_${suffix}`;
const deniedTable = `mcp_test_denied_${suffix}`;
const testView = `mcp_test_view_${suffix}`;
const testTrigger = `mcp_test_before_insert_${suffix}`;

if (missingEnv.length === 0) {
  process.env.MYSQL_HOST = process.env.TEST_HOST;
  process.env.MYSQL_PORT = process.env.TEST_PORT;
  process.env.MYSQL_USER = process.env.TEST_USERNAME;
  process.env.MYSQL_PASSWORD = process.env.TEST_PASSWORD;
  process.env.MYSQL_DATABASE = process.env.TEST_DB;
  process.env.MYSQL_BATCH_MAX_SIZE = process.env.MYSQL_BATCH_MAX_SIZE ?? '2';
  process.env.MYSQL_MCP_ALLOW_TABLES = [testTable, secondTable, testView].join(',');
  process.env.MYSQL_MCP_DENY_TABLES = deniedTable;
}

test('easy-mysql-mcp tool interface integration tests', { skip: missingEnv.length > 0 ? `Missing test env: ${missingEnv.join(', ')}` : false }, async (t) => {
  const db = await import('../build/db.js');
  const tools = await import('../build/toolHandlers.js');

  const tempDir = path.join(os.tmpdir(), `easy-mysql-mcp-test-${suffix}`);
  await setupDatabase(db);
  await mkdir(tempDir, { recursive: true });

  try {
    await t.test('mysql_query', async (t) => {
      await t.test('selects rows', async () => {
        const rows = await tools.mysqlQuery(`SELECT name, amount FROM ${testTable} WHERE name = 'seed-a'`);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].amount, 1);
      });

      await t.test('allows DESCRIBE', async () => {
        const rows = await tools.mysqlQuery(`DESCRIBE ${testTable}`);
        assert.ok(rows.some((row) => row.Field === 'name'));
      });

      await t.test('rejects write SQL', async () => {
        await assert.rejects(
          () => tools.mysqlQuery(`UPDATE ${testTable} SET amount = 9`),
          /mysql_query only allows/,
        );
      });
    });

    await t.test('mysql_execute', async (t) => {
      await t.test('inserts one row', async () => {
        const result = await tools.mysqlExecute(
          `INSERT INTO ${testTable} (name, email, note, amount) VALUES (?, ?, ?, ?)`,
          ['execute-insert', 'execute-insert@example.com', 'inserted', 10],
        );
        assert.equal(result.affectedRows, 1);
      });

      await t.test('updates one row', async () => {
        const result = await tools.mysqlExecute(
          `UPDATE ${testTable} SET amount = ? WHERE name = ?`,
          [11, 'execute-insert'],
        );
        assert.equal(result.affectedRows, 1);
      });

      await t.test('rejects SELECT', async () => {
        await assert.rejects(
          () => tools.mysqlExecute(`SELECT * FROM ${testTable}`),
          /mysql_execute only allows/,
        );
      });
    });

    await t.test('mysql_batch_execute', async (t) => {
      await t.test('inserts multiple rows and writes log', async () => {
        const result = await tools.mysqlBatchExecute(
          `INSERT INTO ${testTable} (name, email, note, amount) VALUES (?, ?, ?, ?)`,
          [
            ['batch-a', 'batch-a@example.com', 'a', 20],
            ['batch-b', 'batch-b@example.com', 'b', 21],
            ['batch-c', 'batch-c@example.com', 'c', 22],
          ],
          'batch',
        );
        assert.equal(result.totalRows, 3);
        assert.equal(result.batches, 2);
        assert.equal(result.affectedRows, 3);
        assert.ok(existsSync(result.logPath));
      });

      await t.test('supports each transaction mode', async () => {
        const result = await tools.mysqlBatchExecute(
          `INSERT INTO ${testTable} (name, email, note, amount) VALUES (?, ?, ?, ?)`,
          [['batch-each', 'batch-each@example.com', 'each', 23]],
          'each',
        );
        assert.equal(result.transaction, 'each');
        assert.equal(result.affectedRows, 1);
      });

      await t.test('rejects read SQL', async () => {
        await assert.rejects(
          () => tools.mysqlBatchExecute(`SELECT * FROM ${testTable}`, [[]], 'all'),
          /mysql_execute only allows/,
        );
      });
    });

    await t.test('mysql_import_csv', async (t) => {
      await t.test('imports standard CSV rows', async () => {
        const filePath = path.join(tempDir, 'import-standard.csv');
        await writeFile(filePath, 'name,email,note,amount\ncsv-a,csv-a@example.com,"quoted, note",30\ncsv-b,csv-b@example.com,"line ""quote""",31\n', 'utf8');
        const result = await tools.mysqlImportCsv(testTable, filePath, 'all');
        assert.equal(result.importedRows, 2);
        assert.equal(result.affectedRows, 2);
        assert.ok(existsSync(result.logPath));
      });

      await t.test('imports with none transaction mode', async () => {
        const filePath = path.join(tempDir, 'import-none.csv');
        await writeFile(filePath, 'name,email,note,amount\ncsv-none,csv-none@example.com,none,32\n', 'utf8');
        const result = await tools.mysqlImportCsv(testTable, filePath, 'none');
        assert.equal(result.transaction, 'none');
        assert.equal(result.importedRows, 1);
      });

      await t.test('rejects malformed row length', async () => {
        const filePath = path.join(tempDir, 'import-bad.csv');
        await writeFile(filePath, 'name,email,note,amount\nbad,bad@example.com\n', 'utf8');
        await assert.rejects(
          () => tools.mysqlImportCsv(testTable, filePath, 'all'),
          /has 2 columns, expected 4/,
        );
      });
    });

    await t.test('mysql_export_csv', async (t) => {
      await t.test('exports headers and rows', async () => {
        const filePath = path.join(tempDir, 'export-main.csv');
        const result = await tools.mysqlExportCsv(testTable, filePath);
        const content = await readFile(filePath, 'utf8');
        assert.equal(result.columns, 5);
        assert.match(content.split('\n')[0], /^id,name,email,note,amount$/);
        assert.match(content, /csv-a@example\.com/);
        assert.match(content, /"quoted, note"/);
      });

      await t.test('exports empty table with header', async () => {
        const filePath = path.join(tempDir, 'export-empty.csv');
        const result = await tools.mysqlExportCsv(secondTable, filePath);
        const content = await readFile(filePath, 'utf8');
        assert.equal(result.exportedRows, 0);
        assert.match(content, /^id,label\n/);
      });

      await t.test('rejects denied table', async () => {
        await assert.rejects(
          () => tools.mysqlExportCsv(deniedTable, path.join(tempDir, 'denied.csv')),
          /denied by MYSQL_MCP_DENY_TABLES/,
        );
      });
    });

    await t.test('explain_query', async (t) => {
      await t.test('explains a select', async () => {
        const rows = await tools.explainQuery(`SELECT * FROM ${testTable}`);
        assert.ok(rows.length > 0);
      });

      await t.test('explains a filtered select', async () => {
        const rows = await tools.explainQuery(`SELECT * FROM ${testTable} WHERE name = 'seed-a'`);
        assert.ok(rows.length > 0);
      });

      await t.test('rejects update', async () => {
        await assert.rejects(
          () => tools.explainQuery(`UPDATE ${testTable} SET amount = 1`),
          /only accepts a SELECT/,
        );
      });
    });

    await t.test('list_tables', async (t) => {
      await t.test('includes first allowed table', async () => {
        const rows = await tools.listTables();
        assert.ok(rows.some((row) => row.TABLE_NAME === testTable));
      });

      await t.test('includes second allowed table', async () => {
        const rows = await tools.listTables();
        assert.ok(rows.some((row) => row.TABLE_NAME === secondTable));
      });

      await t.test('filters denied table', async () => {
        const rows = await tools.listTables();
        assert.ok(!rows.some((row) => row.TABLE_NAME === deniedTable));
      });
    });

    await t.test('list_views', async (t) => {
      await t.test('includes allowed view', async () => {
        const rows = await tools.listViews();
        assert.ok(rows.some((row) => row.TABLE_NAME === testView));
      });

      await t.test('returns view definition', async () => {
        const rows = await tools.listViews();
        const view = rows.find((row) => row.TABLE_NAME === testView);
        assert.match(String(view.VIEW_DEFINITION).toLowerCase(), /select/);
      });

      await t.test('returns only allowed views for test prefix', async () => {
        const rows = await tools.listViews();
        assert.ok(rows.every((row) => row.TABLE_NAME !== deniedTable));
      });
    });

    await t.test('describe_table', async (t) => {
      await t.test('describes one table', async () => {
        const result = await tools.describeTable([testTable]);
        assert.ok(result[testTable].some((row) => row.Field === 'email'));
      });

      await t.test('describes multiple tables', async () => {
        const result = await tools.describeTable([testTable, secondTable]);
        assert.ok(result[testTable].length > 0);
        assert.ok(result[secondTable].some((row) => row.Field === 'label'));
      });

      await t.test('rejects denied table', async () => {
        await assert.rejects(
          () => tools.describeTable([deniedTable]),
          /denied by MYSQL_MCP_DENY_TABLES/,
        );
      });
    });

    await t.test('describe_index', async (t) => {
      await t.test('shows primary key', async () => {
        const rows = await tools.describeIndex(testTable);
        assert.ok(rows.some((row) => row.Key_name === 'PRIMARY'));
      });

      await t.test('shows secondary index', async () => {
        const rows = await tools.describeIndex(testTable);
        assert.ok(rows.some((row) => row.Key_name === 'idx_name'));
      });

      await t.test('rejects denied table', async () => {
        await assert.rejects(
          () => tools.describeIndex(deniedTable),
          /denied by MYSQL_MCP_DENY_TABLES/,
        );
      });
    });

    await t.test('list_triggers', async (t) => {
      await t.test('lists test trigger', async () => {
        const rows = await tools.listTriggers();
        assert.ok(rows.some((row) => row.Trigger === testTrigger));
      });

      await t.test('trigger belongs to allowed table', async () => {
        const rows = await tools.listTriggers();
        const trigger = rows.find((row) => row.Trigger === testTrigger);
        assert.equal(trigger.Table, testTable);
      });

      await t.test('does not include denied-table triggers', async () => {
        const rows = await tools.listTriggers();
        assert.ok(rows.every((row) => row.Table !== deniedTable));
      });
    });

    await t.test('get_current_privileges', async (t) => {
      await t.test('returns current user', async () => {
        const result = await tools.getCurrentPrivileges();
        assert.ok(Array.isArray(result.currentUser));
        assert.ok(result.currentUser[0].user);
      });

      await t.test('returns grants', async () => {
        const result = await tools.getCurrentPrivileges();
        assert.ok(Array.isArray(result.grants));
        assert.ok(result.grants.length > 0);
      });

      await t.test('grant rows contain grant text', async () => {
        const result = await tools.getCurrentPrivileges();
        const firstGrant = Object.values(result.grants[0]).join(' ');
        assert.match(firstGrant.toUpperCase(), /GRANT|USAGE/);
      });
    });
  } finally {
    await teardownDatabase(db);
    await db.pool.end();
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function setupDatabase(db) {
  await teardownDatabase(db);
  await db.query(`
    CREATE TABLE ${db.escapeIdentifier(testTable)} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      note VARCHAR(255) NULL,
      amount INT NOT NULL DEFAULT 0,
      INDEX idx_name (name)
    )
  `);
  await db.query(`
    CREATE TABLE ${db.escapeIdentifier(secondTable)} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      label VARCHAR(100) NOT NULL
    )
  `);
  await db.query(`
    CREATE TABLE ${db.escapeIdentifier(deniedTable)} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      label VARCHAR(100) NOT NULL
    )
  `);
  await db.execute(
    `INSERT INTO ${db.escapeIdentifier(testTable)} (name, email, note, amount) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
    ['seed-a', 'seed-a@example.com', 'seed a', 1, 'seed-b', 'seed-b@example.com', 'seed b', 2],
  );
  await db.query(`CREATE VIEW ${db.escapeIdentifier(testView)} AS SELECT id, name, amount FROM ${db.escapeIdentifier(testTable)}`);
  await db.query(`
    CREATE TRIGGER ${db.escapeIdentifier(testTrigger)}
    BEFORE INSERT ON ${db.escapeIdentifier(testTable)}
    FOR EACH ROW
    SET NEW.note = COALESCE(NEW.note, 'triggered')
  `);
}

async function teardownDatabase(db) {
  await db.query(`DROP TRIGGER IF EXISTS ${db.escapeIdentifier(testTrigger)}`);
  await db.query(`DROP VIEW IF EXISTS ${db.escapeIdentifier(testView)}`);
  await db.query(`DROP TABLE IF EXISTS ${db.escapeIdentifier(deniedTable)}`);
  await db.query(`DROP TABLE IF EXISTS ${db.escapeIdentifier(secondTable)}`);
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
