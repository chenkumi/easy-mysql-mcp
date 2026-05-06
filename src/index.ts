#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as db from './db.js';


// Initialize MCP Server/mcp
const server = new McpServer({
  name: 'easy-mysql-mcp',
  version: '1.0.3',
});

// --- Register Tools ---

server.registerTool(
  'mysql_query',
  {
    description: 'Execute a read-only SQL query (e.g., SELECT). Use this for data retrieval.',
    inputSchema: z.object({
      sql: z.string().describe('The SQL query to execute.'),
    }),
  },
  async ({ sql }) => {
    const results = await db.query(sql);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  'mysql_execute',
  {
    description: 'Execute a data modification SQL statement (e.g., INSERT, UPDATE, DELETE).',
    inputSchema: z.object({
      sql: z.string().describe('The SQL statement to execute.'),
      params: z.array(z.any()).optional().describe('Optional parameters for the statement.'),
    }),
  },
  async ({ sql, params }) => {
    const result = await db.execute(sql, params);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.registerTool(
  'explain_query',
  {
    description: 'Run EXPLAIN on a SQL query to analyze its execution plan and performance.',
    inputSchema: z.object({
      sql: z.string().describe('The SQL query to explain.'),
    }),
  },
  async ({ sql }) => {
    const results = await db.query(`EXPLAIN ${sql}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  'list_tables',
  {
    description: 'List all base tables in the current database with row counts and comments.',
    inputSchema: z.object({}),
  },
  async () => {
    const results = await db.query(`
      SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
    `);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  'list_views',
  {
    description: 'List all views in the current database.',
    inputSchema: z.object({}),
  },
  async () => {
    const results = await db.query(`
      SELECT TABLE_NAME, VIEW_DEFINITION 
      FROM information_schema.VIEWS 
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  'describe_table',
  {
    description: 'Show the schema/structure of one or more specific tables.',
    inputSchema: z.object({
      tables: z.array(z.string()).describe('The names of the tables to describe.'),
    }),
  },
  async ({ tables }) => {
    const results: Record<string, any> = {};
    for (const table of tables) {
      results[table] = await db.query(`DESCRIBE ${table}`);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  'describe_index',
  {
    description: 'Show indexes for a specific table.',
    inputSchema: z.object({
      table: z.string().describe('The name of the table to show indexes for.'),
    }),
  },
  async ({ table }) => {
    const results = await db.query(`SHOW INDEX FROM ${table}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  'list_triggers',
  {
    description: 'List all triggers in the current database.',
    inputSchema: z.object({}),
  },
  async () => {
    const results = await db.query('SHOW TRIGGERS');
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.registerTool(
  'get_current_privileges',
  {
    description: 'Check the permissions and grants of the current database user. Useful for debugging access issues.',
    inputSchema: z.object({}),
  },
  async () => {
    const user = await db.query('SELECT CURRENT_USER() as user');
    const grants = await db.query('SHOW GRANTS');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ currentUser: user, grants }, null, 2)
      }],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MySQL MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
