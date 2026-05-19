import { randomUUID } from 'node:crypto';
import { config } from './config.js';

export type PendingApprovalSummary = {
  approvalId: string;
  functionName: string;
  statementType: string;
  tableNames: string[];
  message: string;
  createdAt: string;
  expiresAt: string;
  summary?: Record<string, unknown>;
};

export type CreatePendingApprovalInput = {
  functionName: string;
  statementType: string;
  tableNames: string[];
  message?: string;
  summary?: Record<string, unknown>;
  command: () => Promise<unknown>;
};

type PendingApproval = CreatePendingApprovalInput & {
  approvalId: string;
  createdAtMs: number;
  expiresAtMs: number;
};

const pendingApprovals = new Map<string, PendingApproval>();

export function createPendingApproval(input: CreatePendingApprovalInput): PendingApprovalSummary {
  cleanupExpiredApprovals();

  const approvalId = `apv_${randomUUID()}`;
  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + config.approvalTtlSeconds * 1000;
  const pendingApproval: PendingApproval = {
    ...input,
    approvalId,
    createdAtMs,
    expiresAtMs,
  };

  pendingApprovals.set(approvalId, pendingApproval);

  return toSummary(pendingApproval);
}

export async function runApprovedCommand(approvalId: string): Promise<unknown> {
  cleanupExpiredApprovals();

  const pendingApproval = pendingApprovals.get(approvalId);

  if (!pendingApproval) {
    throw new Error(`Approval not found or expired: ${approvalId}`);
  }

  pendingApprovals.delete(approvalId);
  return pendingApproval.command();
}

export function listPendingApprovals(): PendingApprovalSummary[] {
  cleanupExpiredApprovals();
  return [...pendingApprovals.values()].map(toSummary);
}

export function cancelApproval(approvalId: string): PendingApprovalSummary {
  cleanupExpiredApprovals();

  const pendingApproval = pendingApprovals.get(approvalId);

  if (!pendingApproval) {
    throw new Error(`Approval not found or expired: ${approvalId}`);
  }

  pendingApprovals.delete(approvalId);
  return toSummary(pendingApproval);
}

export function cleanupExpiredApprovals(now = Date.now()): void {
  for (const [approvalId, pendingApproval] of pendingApprovals.entries()) {
    if (pendingApproval.expiresAtMs <= now) {
      pendingApprovals.delete(approvalId);
    }
  }
}

function toSummary(pendingApproval: PendingApproval): PendingApprovalSummary {
  return {
    approvalId: pendingApproval.approvalId,
    functionName: pendingApproval.functionName,
    statementType: pendingApproval.statementType,
    tableNames: pendingApproval.tableNames,
    message: pendingApproval.message ?? 'Approval required before executing this command.',
    createdAt: new Date(pendingApproval.createdAtMs).toISOString(),
    expiresAt: new Date(pendingApproval.expiresAtMs).toISOString(),
    summary: pendingApproval.summary,
  };
}
