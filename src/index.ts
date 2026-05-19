#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { isReadOnlyMode } from './config.js';
import * as db from './db.js';
import { cleanupOldLogs } from './logs.js';
import {
  describeIndex,
  describeTable,
  explainQuery,
  getCurrentPrivileges,
  listTables,
  listTriggers,
  listViews,
  mysqlBatchExecute,
  mysqlExecute,
  mysqlExportCsv,
  mysqlImportCsv,
  mysqlQuery,
} from './toolHandlers.js';

const {
  MYSQL_HOST,
  MYSQL_PORT,
  MYSQL_DATABASE,
} = process.env;

// Initialize MCP Server/mcp
const server = new McpServer({
  name: 'easy-mysql-mcp',
  version: '1.0.3',
  description: `MySQL Database: ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}`,
});

// --- Register Tools ---

const transactionModeSchema = z.enum(['all', 'batch', 'each', 'none', 'everyone']);

server.registerTool(
  'mysql_query',
  {
    description: 'Execute a read-only SQL query (e.g., SELECT). Use this for data retrieval.',
    inputSchema: z.object({
      sql: z.string().describe('The SQL query to execute.'),
    }),
  },
  async ({ sql }) => {
    const results = await mysqlQuery(sql);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

if (!isReadOnlyMode()) {
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
      const result = await mysqlExecute(sql, params);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'mysql_batch_execute',
    {
      description: 'Execute one data modification SQL statement repeatedly with multiple parameter sets.',
      inputSchema: z.object({
        sql: z.string().describe('The parameterized SQL statement to execute for each params entry.'),
        paramsList: z.array(z.array(z.any())).min(1).describe('A list of parameter arrays. Each item is executed with the same SQL statement.'),
        transaction: transactionModeSchema.optional().default('all').describe('Transaction scope: all, batch, each, or none. "everyone" is accepted as an alias for each.'),
      }),
    },
    async ({ sql, paramsList, transaction }) => {
      const result = await mysqlBatchExecute(sql, paramsList, normalizeTransactionMode(transaction));

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'mysql_import_csv',
    {
      description: 'Import a UTF-8 CSV file into a table using the header row as column names.',
      inputSchema: z.object({
        tableName: z.string().min(1).describe('The target table name.'),
        filePath: z.string().min(1).describe('Path to a UTF-8 CSV file. The first row must contain column names.'),
        transaction: transactionModeSchema.optional().default('all').describe('Transaction scope: all, batch, each, or none. "everyone" is accepted as an alias for each.'),
      }),
    },
    async ({ tableName, filePath, transaction }) => {
      const result = await mysqlImportCsv(tableName, filePath, normalizeTransactionMode(transaction));

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

server.registerTool(
  'mysql_export_csv',
  {
    description: 'Export all rows from a table to a UTF-8 CSV file.',
    inputSchema: z.object({
      tableName: z.string().min(1).describe('The source table name.'),
      filePath: z.string().min(1).describe('Path where the UTF-8 CSV file should be written.'),
    }),
  },
  async ({ tableName, filePath }) => {
    const result = await mysqlExportCsv(tableName, filePath);

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
    const results = await explainQuery(sql);
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
    const filteredResults = await listTables();
    return {
      content: [{ type: 'text', text: JSON.stringify(filteredResults, null, 2) }],
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
    const filteredResults = await listViews();
    return {
      content: [{ type: 'text', text: JSON.stringify(filteredResults, null, 2) }],
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
    const results = await describeTable(tables);
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
    const results = await describeIndex(table);
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
    const filteredResults = await listTriggers();
    return {
      content: [{ type: 'text', text: JSON.stringify(filteredResults, null, 2) }],
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
    const result = await getCurrentPrivileges();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }],
    };
  }
);

// Start server
async function main() {
  await cleanupOldLogs();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MySQL MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});

function normalizeTransactionMode(transaction: z.infer<typeof transactionModeSchema>): db.BatchTransactionMode {
  return transaction === 'everyone' ? 'each' : transaction;
}
