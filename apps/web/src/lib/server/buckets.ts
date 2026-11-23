import { parseBuckets } from '@penjaga/validator';
import { DatasetNotFoundError, DatasetTextError, readDatasetSnapshot } from './dataset-text.ts';

export type BucketChartData = {
  labelColumn: string;
  valueColumn: string;
  rows: { label: string; value: number }[];
  total: number;
};

type BucketsResult =
  | ({ status: 'available' } & BucketChartData)
  | { status: 'missing' }
  | { status: 'unavailable'; message: string };

export async function readBuckets(root: string | undefined, name: string): Promise<BucketsResult> {
  let text: string;
  try {
    text = (await readDatasetSnapshot(root, name, 'buckets.csv')).text;
  } catch (cause) {
    if (cause instanceof DatasetNotFoundError || !(cause instanceof DatasetTextError)) throw cause;
    if (cause.status === 404) return { status: 'missing' };
    console.error('Bucket summary read failed.');
    return { status: 'unavailable', message: cause.message };
  }

  let buckets;
  try {
    buckets = parseBuckets(text);
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    console.error('Bucket summary parsing failed.');
    return { status: 'unavailable', message: 'buckets.csv is not a valid bucket summary.' };
  }
  return {
    status: 'available', labelColumn: buckets.labelColumn, valueColumn: buckets.valueColumn,
    total: buckets.rows.length,
    rows: buckets.rows.slice(0, 100).map((row) => ({
      label: row[buckets.labelColumn] as string,
      value: row[buckets.valueColumn] as number,
    })),
  };
}
