import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseBuckets } from '@penjaga/validator';
import { validateDataPackage } from '@penjaga/validator/repository';
import { assertCommandFailure } from './helpers.ts';

const validCases: [string, string, string, Record<string, string | number>[]][] = [
  ['year,count\n001,0\n1962,10\n', 'year', 'count', [{ year: '001', count: 0 }, { year: '1962', count: 10 }]],
  ['\uFEFF category , count \r\n A , 0 \r\n\r\nB,0', 'category', 'count', [{ category: 'A', count: 0 }, { category: 'B', count: 0 }]],
  ['kind,count\n"A,B",2\n"A""B",3\n"two\nlines",4\n', 'kind', 'count', [{ kind: 'A,B', count: 2 }, { kind: 'A"B', count: 3 }, { kind: 'two\nlines', count: 4 }]],
  ['__proto__,count\nconstructor,9007199254740991', '__proto__', 'count', [{ ['__proto__']: 'constructor', count: Number.MAX_SAFE_INTEGER }]],
  ['items,score\n001,1.5\n002,+.25\n003,2.\n004,1e-3\n005,2E+1\n006,0.0\n', 'items', 'score', [
    { items: '001', score: 1.5 }, { items: '002', score: 0.25 }, { items: '003', score: 2 },
    { items: '004', score: 0.001 }, { items: '005', score: 20 }, { items: '006', score: 0 },
  ]],
  ['items,count\nA,0.75\nB,0\n', 'items', 'count', [{ items: 'A', count: 0.75 }, { items: 'B', count: 0 }]],
  [' category , mean value \n A , 2.5 \n', 'category', 'mean value', [{ category: 'A', 'mean value': 2.5 }]],
  ['count,"share, %"\n001,12.5\n', 'count', 'share, %', [{ count: '001', 'share, %': 12.5 }]],
  ['item,__proto__\nconstructor,0.5', 'item', '__proto__', [{ item: 'constructor', ['__proto__']: 0.5 }]],
  ['item,constructor\n__proto__,1.25', 'item', 'constructor', [{ item: '__proto__', constructor: 1.25 }]],
  ['item,value\nsmall,5e-324\nzero,0e999\n', 'item', 'value', [{ item: 'small', value: Number.MIN_VALUE }, { item: 'zero', value: 0 }]],
];

for (const [text, labelColumn, valueColumn, rows] of validCases) {
  test(`accepts bucket CSV ${JSON.stringify(text)} and preserves column names and labels`, () => {
    assert.deepEqual(parseBuckets(text), { labelColumn, valueColumn, rows });
    assert.deepEqual(parseBuckets(new TextEncoder().encode(text)), { labelColumn, valueColumn, rows });
  });
}

for (const text of [
  '', 'year,count\n', 'count,count\nA,1', ',count\nA,1', 'item, \nA,1', ' item ,item\nA,1',
  'year,count,extra\nA,1,x', 'year,count\nA', 'year,count\nA,1,x',
  'year,count\n ,1', 'year,count\nA,1\n A ,2', 'year,count\nA,',
  'year,count\nA,-1', 'item,score\nA,-0.5', 'item,score\nA,-1e-3',
  'year,count\nA,NaN', 'year,count\nA,Infinity', 'year,count\nA,-Infinity', 'year,count\nA,9007199254740992',
  'item,score\nA,1e309', 'item,score\nA,1e20', 'item,score\nA,1e-999', 'item,score\nA,-1e-999',
  'item,score\nA, ', 'item,score\nA,0x10', 'item,score\nA,0b10', 'item,score\nA,0o10',
  'item,score\nA,1_000', 'item,score\nA,1abc', 'item,score\nA,1 2', 'item,score\nA,.',
  'item,score\nA,+', 'item,score\nA,1e', 'item,score\nA,1.2.3',
  'year,count\n"A,1', 'year,count\nA"B,1', 'year,count\n"A"x,1',
  'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n',
]) {
  test(`rejects malformed bucket CSV ${JSON.stringify(text)}`, () => {
    assert.throws(() => parseBuckets(text), /buckets\.csv/);
  });
}

test('rejects invalid UTF-8 and oversized bucket contents', () => {
  assert.throws(() => parseBuckets(Buffer.from([0xff])), /UTF-8/);
  assert.throws(() => parseBuckets(`label,count\n${'a'.repeat(1_000_000)},1`), /limit/);
  assert.throws(() => parseBuckets(`label,count\n${'é'.repeat(500_000)},1`), /limit/);
});

test('the reserved buckets resource must refer to the root CSV', () => {
  const root = mkdtempSync(join(tmpdir(), 'bucket-resource-'));

  try {
    writeFileSync(join(root, 'input.csv'), 'value\nexample\n');
    writeFileSync(join(root, 'buckets.csv'), 'label,count\nexample,0\n');

    for (const resource of [
      { name: 'buckets', path: 'input.csv', format: 'csv' },
      { name: 'buckets', path: 'buckets.csv', format: 'json' },
    ]) {
      assert.ok(validateDataPackage({
        name: 'example',
        title: 'Example',
        description: 'Synthetic example.',
        keywords: ['task:example', 'project:example', 'stage:master'],
        resources: [{ ...resource, title: 'Summary' }],
      }, root).some((error) => error.includes('buckets')));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI validates optional root buckets even when not declared as a resource', () => {
  const root = mkdtempSync(join(tmpdir(), 'bucket-cli-'));
  const script = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const run = () => execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8', stdio: 'pipe' });

  try {
    writeFileSync(join(root, 'input.csv'), 'value\nexample\n');
    writeFileSync(join(root, 'datapackage.json'), JSON.stringify({
      name: 'example',
      title: 'Example',
      description: 'Synthetic example.',
      keywords: ['task:example', 'project:example', 'stage:master'],
      resources: [{ name: 'input', title: 'Input', path: 'input.csv' }],
    }));
    assert.match(run(), /valid/);

    writeFileSync(join(root, 'buckets.csv'), 'year,count\n001,0\n');
    assert.match(run(), /valid/);

    writeFileSync(join(root, 'buckets.csv'), 'items,mean score\n001,1.5\n002,0\n');
    assert.match(run(), /valid/);

    writeFileSync(join(root, 'buckets.csv'), 'items,mean score\nprivate-label,-0.5\n');
    assert.throws(run, (error) => {
      assertCommandFailure(error);
      assert.match(error.stderr.toString(), /buckets\.csv.*row 2/);
      assert.doesNotMatch(error.stderr.toString(), /private-label/);

      return true;
    });

    rmSync(join(root, 'buckets.csv'));
    mkdirSync(join(root, 'buckets.csv'));
    assert.throws(run);

    rmSync(join(root, 'buckets.csv'), { recursive: true });
    symlinkSync(join(root, 'input.csv'), join(root, 'buckets.csv'));
    assert.throws(run);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
