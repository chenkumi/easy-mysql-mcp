import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const LOG_RETENTION_DAYS = 7;
const LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const logsDirectory = path.resolve(config.logPath);

export async function cleanupOldLogs(now = Date.now()): Promise<void> {
  await mkdir(logsDirectory, { recursive: true });

  const entries = await readdir(logsDirectory);

  await Promise.all(entries.map(async (entry) => {
    if (!entry.endsWith('.log')) {
      return;
    }

    const filePath = path.join(logsDirectory, entry);
    const fileStat = await stat(filePath);

    if (now - fileStat.mtimeMs > LOG_RETENTION_MS) {
      await unlink(filePath);
    }
  }));
}

export async function writeBatchExecuteLog(payload: unknown): Promise<string> {
  await mkdir(logsDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const filePath = path.join(logsDirectory, `mysql_batch_execute-${timestamp}-${randomSuffix}.log`);

  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return filePath;
}
