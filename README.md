# easy-mysql-mcp

A lightweight [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets AI assistants inspect and query a MySQL database through a safe, structured tool interface.

This project uses Node.js, TypeScript, the official MCP SDK, and `mysql2/promise`. It runs over stdio, so it can be used directly by MCP clients such as Claude Desktop.

## Features

- MySQL connection pooling powered by `mysql2/promise`
- Read-only query tool for data retrieval
- Execute tool for data modification statements
- Schema discovery tools for tables, views, indexes, and triggers
- Query plan inspection with `EXPLAIN`
- Current user and privilege inspection
- stdout protection to prevent non-MCP logs from polluting the stdio protocol

## Requirements

- Node.js 18 or newer
- npm
- A reachable MySQL-compatible database

## Installation

You can run the published package directly with `npx`:

```bash
npx -y easy-mysql-mcp
```

For local development:

```bash
git clone <your-repository-url>
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

Example `.env`:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
```

## Usage

For published usage, configure your MCP client to launch the package through `npx`.

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

Add the server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "easy-mysql-mcp": {
      "command": "npx",
      "args": ["-y", "easy-mysql-mcp"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

Restart Claude Desktop after updating the configuration.

For local development, you can point Claude Desktop at your built file instead:

```json
{
  "mcpServers": {
    "easy-mysql-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/easy-mysql-mcp/build/index.js"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
| --- | --- |
| `mysql_query` | Execute a SQL query intended for data retrieval, such as `SELECT` |
| `mysql_execute` | Execute a data modification statement, such as `INSERT`, `UPDATE`, or `DELETE` |
| `explain_query` | Run `EXPLAIN` for a SQL query and return the execution plan |
| `list_tables` | List base tables in the current database, including approximate row counts and comments |
| `list_views` | List views in the current database |
| `describe_table` | Show column information for one or more tables |
| `describe_index` | Show indexes for a table |
| `list_triggers` | List triggers in the current database |
| `get_current_privileges` | Show the current MySQL user and grants |

## Security Notes

- Use a dedicated MySQL user with the minimum permissions your assistant needs.
- Prefer read-only database credentials if you only need inspection and reporting.
- Be careful with `mysql_execute`, because it can modify data.
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

## Publishing to npm

Before publishing, make sure the package name is available on npm:

```bash
npm view easy-mysql-mcp
```

If npm returns a `404`, the name is available.

Log in to npm:

```bash
npm login
```

Check the package contents:

```bash
npm pack --dry-run
```

Publish the package:

```bash
npm publish
```

After publishing, users can run:

```bash
npx -y easy-mysql-mcp
```

## Project Structure

```text
src/
  db.ts       MySQL pool and query helpers
  index.ts    MCP server and tool registration
  proxy.ts    stdout protection for stdio-based MCP transport
```

## License

ISC
