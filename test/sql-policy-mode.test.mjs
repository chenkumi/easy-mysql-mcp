import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('schema execution requires advanced mode', () => {
  const output = runPolicyCheck({
    MYSQL_MCP_MODE: 'readwrite',
    SQL: 'CREATE TABLE users (id INT)',
  });

  assert.match(output, /schema execution requires MYSQL_MCP_MODE=advanced/);
});

test('advanced mode allows schema statements', () => {
  const output = runPolicyCheck({
    MYSQL_MCP_MODE: 'advanced',
    SQL: 'CREATE TABLE users (id INT)',
  });

  assert.equal(output, 'allowed');
});

test('advanced mode keeps unsafe schema forms blocked', () => {
  const output = runPolicyCheck({
    MYSQL_MCP_MODE: 'advanced',
    SQL: 'CREATE TABLE copied_users AS SELECT * FROM users',
  });

  assert.match(output, /CREATE TABLE \.\.\. AS SELECT is not allowed/);
});

function runPolicyCheck(env) {
  const script = `
    import { assertSchemaExecuteAllowed } from './build/sqlPolicy.js';

    try {
      assertSchemaExecuteAllowed(process.env.SQL);
      console.log('allowed');
    } catch (error) {
      console.log(error.message);
    }
  `;

  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MYSQL_MCP_ALLOW_TABLES: '',
      MYSQL_MCP_DENY_TABLES: '',
      ...env,
    },
    encoding: 'utf8',
  }).trim();
}
