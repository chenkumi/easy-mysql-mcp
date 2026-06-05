export type McpMode = 'readonly' | 'readwrite';

const DEFAULT_BATCH_MAX_SIZE = 100;
const DEFAULT_APPROVAL_TTL_SECONDS = 300;
const DEFAULT_LOG_PATH = 'logs';

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => normalizeTableName(item));
}

export function normalizeTableName(table: string): string {
  return table.replace(/`/g, '').toLowerCase();
}

function resolveMode(): McpMode {
  const explicitMode = process.env.MYSQL_MCP_MODE?.toLowerCase();
  const readOnly = parseBoolean(process.env.MYSQL_READ_ONLY);

  if (readOnly || explicitMode === 'readonly' || explicitMode === 'read-only') {
    return 'readonly';
  }

  return 'readwrite';
}

export const config = {
  mode: resolveMode(),
  allowTables: parseList(process.env.MYSQL_MCP_ALLOW_TABLES),
  denyTables: parseList(process.env.MYSQL_MCP_DENY_TABLES),
  batchMaxSize: parsePositiveInt(process.env.MYSQL_BATCH_MAX_SIZE, DEFAULT_BATCH_MAX_SIZE),
  logPath: process.env.MYSQL_LOG_PATH?.trim() || DEFAULT_LOG_PATH,
  policyHookUrl: process.env.MYSQL_POLICY_HOOK?.trim() || undefined,
  approvalTtlSeconds: parsePositiveInt(process.env.MYSQL_APPROVAL_TTL_SECONDS, DEFAULT_APPROVAL_TTL_SECONDS),
};

export function isReadOnlyMode(): boolean {
  return config.mode === 'readonly';
}

export function isPolicyHookEnabled(): boolean {
  return Boolean(config.policyHookUrl);
}
