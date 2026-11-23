import type { Buckets } from './types.js';

export const MAX_BUCKET_BYTES = 1_000_000;

export function parseBuckets(input: string | Uint8Array): Buckets {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > MAX_BUCKET_BYTES) throw new Error('buckets.csv exceeds the 1 MB limit');

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error('buckets.csv must contain valid UTF-8', { cause });
  }

  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let state: 'plain' | 'quoted' | 'closed' = 'plain';

  const finishRecord = (): void => {
    if (record.length || field || state === 'closed') records.push([...record, field]);
    record = [];
    field = '';
    state = 'plain';
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') state = 'closed';
      else field += char;
    } else if (char === ',') {
      record.push(field);
      field = '';
      state = 'plain';
    } else if (char === '\n' || char === '\r') {
      finishRecord();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"' && field === '' && state === 'plain') {
      state = 'quoted';
    } else if (char === '"' || state === 'closed') {
      throw new Error(`buckets.csv row ${records.length + 1}: malformed CSV quoting`);
    } else field += char;
  }

  if (state === 'quoted') throw new Error('buckets.csv: unterminated quoted field');
  finishRecord();

  const header = records.shift()?.map((value) => value.trim());
  if (
    header?.length !== 2 ||
    !header[0] ||
    !header[1] ||
    header[0] === header[1]
  ) {
    throw new Error('buckets.csv needs two distinct nonblank headers: labels followed by numeric values');
  }

  if (!records.length) throw new Error('buckets.csv must contain at least one data row');

  const labelColumn = header[0];
  const valueColumn = header[1];
  const labels = new Set<string>();

  const rows = records.map((values, index) => {
    const label = values[0]?.trim();
    const rawValue = values[1]?.trim() ?? '';
    const value = Number(rawValue);
    const significand = rawValue.split(/[eE]/)[0] ?? '';

    if (
      values.length !== 2 ||
      !label ||
      labels.has(label) ||
      !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(rawValue) ||
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value)) ||
      (value === 0 && /[1-9]/.test(significand))
    ) {
      throw new Error(`buckets.csv row ${index + 2}: expected a unique label and non-negative finite number within the safe numeric range`);
    }

    labels.add(label);
    return { [labelColumn]: label, [valueColumn]: value };
  });

  return { labelColumn, valueColumn, rows };
}
