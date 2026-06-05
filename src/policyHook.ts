import { config } from './config.js';
import { createPendingApproval } from './approvalStore.js';

export type ToolFunctionName =
  | 'mysql_query'
  | 'mysql_execute'
  | 'mysql_schema_execute'
  | 'mysql_batch_execute'
  | 'mysql_import_csv'
  | 'mysql_export_csv'
  | 'explain_query'
  | 'list_tables'
  | 'list_views'
  | 'describe_table'
  | 'describe_index'
  | 'list_triggers'
  | 'get_current_privileges';

export type PolicyContext = {
  functionName: ToolFunctionName;
  sql?: string | null;
  statementType: string;
  tableNames: string[];
  paramsPreview?: unknown;
  summary?: Record<string, unknown>;
};

export type ApprovalRequiredResponse = {
  status: 'approval_required';
  approvalId: string;
  message: string;
  expiresAt: string;
  functionName: ToolFunctionName;
  statementType: string;
  tableNames: string[];
  summary?: Record<string, unknown>;
};

type HookResponse = {
  status: 'accept' | 'reject' | 'approval_required';
  message?: string;
};

export function isApprovalRequiredResponse(value: unknown): value is ApprovalRequiredResponse {
  return typeof value === 'object'
    && value !== null
    && (value as { status?: unknown }).status === 'approval_required';
}

export async function runWithPolicy<T>(
  context: PolicyContext,
  command: () => Promise<T>,
): Promise<T | ApprovalRequiredResponse> {
  if (!config.policyHookUrl) {
    return command();
  }

  const decision = await callPolicyHook(context);

  if (decision.status === 'accept') {
    return command();
  }

  if (decision.status === 'reject') {
    throw new Error(decision.message ?? 'Command rejected by MYSQL_POLICY_HOOK.');
  }

  const pendingApproval = createPendingApproval({
    functionName: context.functionName,
    statementType: context.statementType,
    tableNames: context.tableNames,
    message: decision.message,
    summary: context.summary,
    command,
  });

  return {
    status: 'approval_required',
    approvalId: pendingApproval.approvalId,
    message: pendingApproval.message,
    expiresAt: pendingApproval.expiresAt,
    functionName: context.functionName,
    statementType: context.statementType,
    tableNames: context.tableNames,
    summary: pendingApproval.summary,
  };
}

async function callPolicyHook(context: PolicyContext): Promise<HookResponse> {
  if (!config.policyHookUrl) {
    return { status: 'accept' };
  }

  const response = await fetch(config.policyHookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      functionName: context.functionName,
      sql: context.sql ?? null,
      statementType: context.statementType,
      tableNames: context.tableNames,
      paramsPreview: context.paramsPreview ?? null,
      metadata: {
        database: process.env.MYSQL_DATABASE,
        mode: config.mode,
        timestamp: new Date().toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MYSQL_POLICY_HOOK returned HTTP ${response.status}.`);
  }

  const body = await response.json() as Partial<HookResponse>;

  if (body.status !== 'accept' && body.status !== 'reject' && body.status !== 'approval_required') {
    throw new Error('MYSQL_POLICY_HOOK returned an invalid status.');
  }

  return body as HookResponse;
}
