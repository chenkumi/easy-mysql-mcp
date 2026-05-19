import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type CsvData = {
  headers: string[];
  rows: string[][];
};

export async function readCsvFile(filePath: string): Promise<CsvData> {
  const content = await readFile(filePath, 'utf8');
  const records = parseCsv(content);

  if (records.length === 0) {
    throw new Error('CSV import failed: file is empty.');
  }

  const headers = records[0].map((header) => header.trim());

  if (headers.length === 0 || headers.some((header) => !header)) {
    throw new Error('CSV import failed: header row contains an empty column name.');
  }

  const uniqueHeaders = new Set(headers.map((header) => header.toLowerCase()));

  if (uniqueHeaders.size !== headers.length) {
    throw new Error('CSV import failed: header row contains duplicate column names.');
  }

  const rows = records.slice(1).filter((row) => row.some((value) => value !== ''));

  for (const [index, row] of rows.entries()) {
    if (row.length !== headers.length) {
      throw new Error(`CSV import failed: row ${index + 2} has ${row.length} columns, expected ${headers.length}.`);
    }
  }

  return { headers, rows };
}

export async function writeCsvFile(filePath: string, headers: string[], rows: Record<string, unknown>[]): Promise<void> {
  const directory = path.dirname(filePath);

  if (directory && directory !== '.') {
    await mkdir(directory, { recursive: true });
  }

  const lines = [
    serializeCsvRow(headers),
    ...rows.map((row) => serializeCsvRow(headers.map((header) => stringifyCsvValue(row[header])))),
  ];

  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      if (nextChar === '\n') {
        continue;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error('CSV parse failed: unterminated quoted field.');
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function serializeCsvRow(values: string[]): string {
  return values.map(escapeCsvValue).join(',');
}

function stringifyCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function escapeCsvValue(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
