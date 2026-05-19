# easy-mysql-mcp

A lightweight [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets AI assistants inspect and query a MySQL database through a safe, structured tool interface.

This project uses Node.js, TypeScript, the official MCP SDK, and `mysql2/promise`. It runs over stdio, so it can be used directly by MCP clients such as Claude Desktop.

## Features

- MySQL connection pooling powered by `mysql2/promise`
- Read-only query tool for data retrieval
- Execute tool for data modification statements
- Batch execution and CSV import/export helpers
- Schema discovery tools for tables, views, indexes, and triggers
- Query plan inspection with `EXPLAIN`
- Current user and privilege inspection

## Requirements

- Node.js 18 or newer
- npm
- A reachable MySQL-compatible database

## Installation

Run the server directly with `npx`:

```bash
npx -y easy-mysql-mcp
```

For local development after cloning the repository:

```bash
cd easy-mysql-mcp
npm install
npm run build
```

## Configuration

Configure the server with environment variables. You can provide them through your MCP client configuration or by creating a local `.env` file.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MYSQL_HOST` | Yes | - | MySQL host name or IP address |
| `MYSQL_PORT` | No | `3306` | MySQL port |
| `MYSQL_USER` | Yes | - | MySQL user name |
| `MYSQL_PASSWORD` | Yes | - | MySQL password |
| `MYSQL_DATABASE` | Yes | - | Default database/schema |
| `MYSQL_CONNECTION_LIMIT` | No | `10` | Maximum number of active pool connections |
| `MYSQL_MAX_IDLE` | No | `10` | Maximum number of idle pool connections |
| `MYSQL_IDLE_TIMEOUT` | No | `60000` | Idle connection timeout in milliseconds |
| `MYSQL_QUEUE_LIMIT` | No | `0` | Maximum queued connection requests, where `0` means unlimited |
| `MYSQL_WAIT_FOR_CONNECTIONS` | No | `true` | Whether the pool waits when all connections are busy |
| `MYSQL_ENABLE_KEEP_ALIVE` | No | `true` | Whether TCP keep-alive is enabled |
| `MYSQL_KEEP_ALIVE_INITIAL_DELAY` | No | `0` | Initial TCP keep-alive delay in milliseconds |
| `MYSQL_READ_ONLY` | No | `false` | When `true`, enables read-only mode and does not register `mysql_execute` |
| `MYSQL_MCP_MODE` | No | `readwrite` | MCP policy mode. Use `readonly` to disable write execution |
| `MYSQL_MCP_ALLOW_TABLES` | No | - | Comma-separated table allowlist, such as `users,orders` |
| `MYSQL_MCP_DENY_TABLES` | No | - | Comma-separated table denylist, such as `payments,secrets` |
| `MYSQL_BATCH_MAX_SIZE` | No | `100` | Maximum number of parameter sets per internal batch for `mysql_batch_execute` |
| `MYSQL_POLICY_HOOK` | No | - | HTTP POST URL for external accept/reject/approval policy decisions |
| `MYSQL_APPROVAL_TTL_SECONDS` | No | `300` | Number of seconds a pending approval remains valid |

Example `.env`:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
```

## Usage

Configure your MCP client to launch the package through `npx`.

For local development, build the TypeScript source first:

```bash
npm run build
```

Start the MCP server:

```bash
npm start
```

The server communicates over stdio and is normally launched by an MCP client rather than run manually.

## Claude Desktop Example

```json
{
  "mcpServers": {
    "easy-mysql-mcp": {
      "command": "npx",
      "args": ["-y", "easy-mysql-mcp"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "YOUR USERNAME",
        "MYSQL_PASSWORD": "YOUR PASSWORD",
        "MYSQL_DATABASE": "YOUR DB NAME"
      }
    }
  }
}
```

Restart Claude Desktop after updating the configuration.

## Codex config.toml Example

```
[mcp_servers.easy-mysql-mcp]
args = ["-y", "easy-mysql-mcp"]
command = "npx"
enabled = true

[mcp_servers.easy-mysql-mcp.env]
MYSQL_HOST = "localhost"
MYSQL_PORT = "3306"
MYSQL_USER = "YOUR USERNAME"
MYSQL_PASSWORD = "YOUR PASSWORD"
MYSQL_DATABASE = "YOUR DB NAME"
```

## OpenCode opencode.jsonc Example

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "easy-mysql-mcp": {
      "type": "local",
      "command": ["npx", "-y", "easy-mysql-mcp"],
      "enabled": true,
      "environment": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "YOUR USERNAME",
        "MYSQL_PASSWORD": "YOUR PASSWORD",
        "MYSQL_DATABASE": "YOUR DB NAME",
      },
    },
  },
}
```

## Available Tools

| Tool | Description |
| --- | --- |
| `mysql_query` | Execute a SQL query intended for data retrieval, such as `SELECT` |
| `mysql_execute` | Execute a data modification statement, such as `INSERT`, `UPDATE`, or `DELETE` |
| `mysql_batch_execute` | Execute one data modification statement repeatedly with multiple parameter sets |
| `mysql_import_csv` | Import a UTF-8 CSV file into a table using the header row as column names |
| `mysql_export_csv` | Export all rows from a table to a UTF-8 CSV file |
| `explain_query` | Run `EXPLAIN` for a SQL query and return the execution plan |
| `list_tables` | List base tables in the current database, including approximate row counts and comments |
| `list_views` | List views in the current database |
| `describe_table` | Show column information for one or more tables |
| `describe_index` | Show indexes for a table |
| `list_triggers` | List triggers in the current database |
| `get_current_privileges` | Show the current MySQL user and grants |
| `mysql_run_approved_command` | Run a pending command after approval, only registered when `MYSQL_POLICY_HOOK` is set |
| `mysql_list_pending_approvals` | List pending approval requests, only registered when `MYSQL_POLICY_HOOK` is set |
| `mysql_cancel_approval` | Cancel a pending approval request, only registered when `MYSQL_POLICY_HOOK` is set |

When `MYSQL_READ_ONLY=true` or `MYSQL_MCP_MODE=readonly`, the `mysql_execute`, `mysql_batch_execute`, and `mysql_import_csv` tools are not registered.

### Batch Execute

`mysql_batch_execute` runs the same parameterized write statement with multiple parameter arrays. It is useful for bulk inserts or repeated updates without enabling multi-statement SQL.

Example input:

```json
{
  "sql": "INSERT INTO users (name, email) VALUES (?, ?)",
  "paramsList": [
    ["Alice", "alice@example.com"],
    ["Bob", "bob@example.com"]
  ],
  "transaction": "all"
}
```

The `transaction` option controls transaction scope:

| Value | Behavior |
| --- | --- |
| `all` | Default. Wrap all rows in one transaction |
| `batch` | Wrap each internal batch in its own transaction |
| `each` | Wrap each parameter set in its own transaction |
| `none` | Do not start explicit transactions |

`everyone` is accepted as an alias for `each`, but `each` is the preferred name.

The server splits `paramsList` into internal batches using `MYSQL_BATCH_MAX_SIZE`. For example, with the default size of `100`, `250` parameter sets run as `100`, `100`, and `50`.

Detailed per-row execution results are written to a timestamped `.log` file under `logs/`. The tool response only returns summary counts and the log file path. Log files older than seven days are cleaned up automatically when the server starts.

### CSV Import and Export

`mysql_import_csv` reads a UTF-8 CSV file and inserts rows into a table. The first CSV row must contain column names, and every data row must have the same number of columns. Internally, the tool builds a parameterized `INSERT` statement and executes it through the same batch execution path as `mysql_batch_execute`.

Example import input:

```json
{
  "tableName": "users",
  "filePath": "./data/users.csv",
  "transaction": "all"
}
```

`mysql_export_csv` exports all rows from a table to a UTF-8 CSV file. It writes a header row using the table's column names, even when the table has no rows.

Example export input:

```json
{
  "tableName": "users",
  "filePath": "./exports/users.csv"
}
```

CSV import/export uses standard comma-separated CSV with double-quote escaping. Empty CSV fields are imported as empty strings.

## SQL Policy

The server applies a lightweight SQL policy before executing user-provided SQL:

- `mysql_query` allows only single-statement `SELECT`, `SHOW`, `DESCRIBE`, and `EXPLAIN` queries.
- `explain_query` accepts only a single `SELECT` statement and runs `EXPLAIN` for it.
- `mysql_execute` allows only single-statement `INSERT`, `UPDATE`, `DELETE`, and `REPLACE` statements when write mode is enabled.
- `mysql_batch_execute` uses the same SQL policy as `mysql_execute` and applies the statement repeatedly with parameter arrays.
- `mysql_import_csv` uses table policy and the same batch execution path as `mysql_batch_execute`.
- `mysql_export_csv` uses table policy before exporting table data.
- Multi-statement SQL is rejected.
- `SELECT ... INTO` and locking reads are rejected for read-query tools.
- `MYSQL_MCP_DENY_TABLES` rejects matching tables before `MYSQL_MCP_ALLOW_TABLES` is evaluated.
- If `MYSQL_MCP_ALLOW_TABLES` is set, every detected table must be included in the allowlist.

Table policy matching is best-effort and based on SQL parsing. You can use either `table` or `database.table` entries. MySQL grants remain the final security boundary.

### Policy Order

Policy checks run in this order:

1. Built-in SQL safety checks run first, such as single-statement enforcement and allowed statement types for each tool.
2. `MYSQL_MCP_DENY_TABLES` is checked next. If a detected table matches the denylist, the command is rejected immediately.
3. `MYSQL_MCP_ALLOW_TABLES` is checked after the denylist. If an allowlist is configured, every detected table must be included in it.
4. `MYSQL_POLICY_HOOK` runs only after the built-in SQL policy and table allow/deny policy pass.

If both `MYSQL_MCP_ALLOW_TABLES` and `MYSQL_MCP_DENY_TABLES` are configured, the denylist takes precedence. For example:

```env
MYSQL_MCP_ALLOW_TABLES=users,orders,payments
MYSQL_MCP_DENY_TABLES=payments
```

In this configuration, `users` and `orders` are allowed, `payments` is rejected, and all other tables are rejected because they are not in the allowlist.

`MYSQL_POLICY_HOOK` cannot override built-in rejections. It can only decide what happens after a command has already passed local policy: `accept`, `reject`, or `approval_required`.

## Policy Hook and Approvals

When `MYSQL_POLICY_HOOK` is configured, the server posts each tool action to the hook after built-in policy checks pass and before the command runs.

Example hook request:

```json
{
  "functionName": "mysql_execute",
  "sql": "UPDATE users SET email = ? WHERE id = ?",
  "statementType": "update",
  "tableNames": ["users"],
  "paramsPreview": ["new@example.com", 123],
  "metadata": {
    "database": "app_db",
    "mode": "readwrite",
    "timestamp": "2026-05-20T12:00:00.000Z"
  }
}
```

The hook must return one of:

```json
{ "status": "accept" }
```

```json
{ "status": "reject", "message": "Writes are blocked outside maintenance windows." }
```

```json
{
  "status": "approval_required",
  "message": "User approval is required before updating users."
}
```

For `approval_required`, the server does not execute the command. It stores the original pending command in memory and returns an `approval_required` response with a server-generated `approvalId`. The hook does not provide the approval id. After the MCP host obtains user approval, it can call:

```json
{
  "approvalId": "apv_..."
}
```

with `mysql_run_approved_command`. Pending approvals are one-time use and expire after `MYSQL_APPROVAL_TTL_SECONDS`. `mysql_list_pending_approvals` and `mysql_cancel_approval` are also available while `MYSQL_POLICY_HOOK` is set.

This is an approval-friendly protocol. The server cannot verify that a human approved the action; the MCP host or external platform is responsible for presenting the approval request to a user.

## Security Notes

- Use a dedicated MySQL user with the minimum permissions your assistant needs.
- Prefer read-only database credentials if you only need inspection and reporting.
- Use `MYSQL_READ_ONLY=true` or `MYSQL_MCP_MODE=readonly` to hide write execution from MCP clients.
- Use `MYSQL_MCP_ALLOW_TABLES` and `MYSQL_MCP_DENY_TABLES` as MCP-level guardrails, not as a replacement for MySQL grants.
- Use `MYSQL_POLICY_HOOK` when you need an external policy or approval workflow.
- Be careful with `mysql_execute`, because it can modify data.
- Be careful with `mysql_import_csv`, because it can insert many rows.
- Batch execution and CSV import logs include parameter values and per-row results. Treat files under `logs/` as sensitive.
- CSV export writes table data to the local filesystem. Treat exported files as sensitive.
- Multi-statement SQL is disabled in the MySQL client configuration.
- Do not commit `.env` files or real database credentials to GitHub.
- Review generated SQL before running it against production data.

## Development

```bash
npm run dev
```

This runs TypeScript in watch mode.

To create a production build:

```bash
npm run build
```

To run the integration test suite, configure a test database in `.env`:

```env
TEST_HOST=localhost
TEST_PORT=3306
TEST_USERNAME=test_user
TEST_PASSWORD=test_password
TEST_DB=test_database
```

Then run:

```bash
npm run test
```

The tests create and drop temporary tables, a view, and a trigger in `TEST_DB`. If the `TEST_*` variables are missing, the integration test is skipped.

## Project Structure

```text
src/
  config.ts   Environment-driven MCP policy configuration
  csv.ts      CSV parsing and writing helpers
  csvTools.ts CSV import/export tool implementations
  db.ts       MySQL pool and query helpers
  index.ts    MCP server and tool registration
  logs.ts     Batch execution log helpers
  policyHook.ts External policy hook client and approval response helpers
  sqlPolicy.ts SQL parsing and policy enforcement
  toolHandlers.ts Shared tool handler implementations
  approvalStore.ts In-memory pending approval store
```

## License

MIT. See [LICENSE.md](LICENSE.md).
