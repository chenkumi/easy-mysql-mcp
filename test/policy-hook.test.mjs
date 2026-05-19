import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';

loadDotEnv(new URL('../.env', import.meta.url));

const requiredEnv = [
  'TEST_HOST',
  'TEST_PORT',
  'TEST_USERNAME',
  'TEST_PASSWORD',
  'TEST_DB',
];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

test('MYSQL_POLICY_HOOK approval workflow', { skip: missingEnv.length > 0 ? `Missing test env: ${missingEnv.join(', ')}` : false }, async () => {
  const decisions = [
    { status: 'accept' },
    { status: 'reject', message: 'blocked by test hook' },
    { status: 'approval_required', message: 'approval required by test hook' },
  ];
  const hookRequests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    hookRequests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const decision = decisions.shift() ?? { status: 'accept' };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(decision));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const hookUrl = `http://127.0.0.1:${address.port}`;

  process.env.MYSQL_HOST = process.env.TEST_HOST;
  process.env.MYSQL_PORT = process.env.TEST_PORT;
  process.env.MYSQL_USER = process.env.TEST_USERNAME;
  process.env.MYSQL_PASSWORD = process.env.TEST_PASSWORD;
  process.env.MYSQL_DATABASE = process.env.TEST_DB;
  process.env.MYSQL_POLICY_HOOK = hookUrl;
  process.env.MYSQL_APPROVAL_TTL_SECONDS = '300';
  process.env.MYSQL_MCP_ALLOW_TABLES = '';
  process.env.MYSQL_MCP_DENY_TABLES = '';

  const suffix = Date.now();
  const tableName = `mcp_hook_test_${suffix}`;
  const db = await import('../build/db.js');
  const tools = await import('../build/toolHandlers.js');
  const approvals = await import('../build/approvalStore.js');

  try {
    await db.query(`DROP TABLE IF EXISTS ${db.escapeIdentifier(tableName)}`);
    await db.query(`
      CREATE TABLE ${db.escapeIdentifier(tableName)} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL
      )
    `);

    const accepted = await tools.mysqlExecute(
      `INSERT INTO ${db.escapeIdentifier(tableName)} (name) VALUES (?)`,
      ['accepted'],
    );
    assert.equal(accepted.affectedRows, 1);

    await assert.rejects(
      () => tools.mysqlExecute(`INSERT INTO ${db.escapeIdentifier(tableName)} (name) VALUES (?)`, ['rejected']),
      /blocked by test hook/,
    );

    const approval = await tools.mysqlExecute(
      `INSERT INTO ${db.escapeIdentifier(tableName)} (name) VALUES (?)`,
      ['approved-later'],
    );
    assert.equal(approval.status, 'approval_required');
    assert.equal(approval.functionName, 'mysql_execute');
    assert.ok(approval.approvalId.startsWith('apv_'));

    const beforeApprovalRows = await db.query(`SELECT name FROM ${db.escapeIdentifier(tableName)} WHERE name = 'approved-later'`);
    assert.equal(beforeApprovalRows.length, 0);

    const pending = approvals.listPendingApprovals();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].approvalId, approval.approvalId);

    const runResult = await approvals.runApprovedCommand(approval.approvalId);
    assert.equal(runResult.affectedRows, 1);

    const afterApprovalRows = await db.query(`SELECT name FROM ${db.escapeIdentifier(tableName)} WHERE name = 'approved-later'`);
    assert.equal(afterApprovalRows.length, 1);
    assert.equal(approvals.listPendingApprovals().length, 0);

    assert.equal(hookRequests.length, 3);
    assert.equal(hookRequests[0].functionName, 'mysql_execute');
    assert.equal(hookRequests[0].statementType, 'insert');
    assert.ok(hookRequests[0].tableNames.includes(tableName.toLowerCase()));
  } finally {
    await db.query(`DROP TABLE IF EXISTS ${db.escapeIdentifier(tableName)}`);
    await db.pool.end();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

function loadDotEnv(fileUrl) {
  const filePath = fileUrl.pathname.replace(/^\/([A-Za-z]:)/, '$1');

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
