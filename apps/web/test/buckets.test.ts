import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { readBuckets } from '../src/lib/server/buckets.ts';
import { DatasetNotFoundError } from '../src/lib/server/dataset-text.ts';

async function fixture(t: TestContext) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'steward-buckets-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = join(root, 'ds-example');
  await fs.mkdir(directory);
  return { root, directory, path: join(directory, 'buckets.csv') };
}

test('reads bucket headers and decimal values independently of metadata without writing files', async (t) => {
  const { root, directory, path } = await fixture(t);
  const csv = 'Group,Mean score\r\n001,0.75\r\n002,0\r\n003,1e-7\r\n';
  await fs.writeFile(path, csv);
  assert.deepEqual(await readBuckets(root, 'ds-example'), {
    status: 'available', labelColumn: 'Group', valueColumn: 'Mean score', total: 3,
    rows: [{ label: '001', value: 0.75 }, { label: '002', value: 0 }, { label: '003', value: 1e-7 }],
  });
  assert.equal(await fs.readFile(path, 'utf8'), csv);
  assert.deepEqual(await fs.readdir(directory), ['buckets.csv']);
});

test('omits absent buckets but does not hide missing or unsafe datasets', async (t) => {
  const { root, directory } = await fixture(t);
  assert.deepEqual(await readBuckets(root, 'ds-example'), { status: 'missing' });
  assert.deepEqual(await fs.readdir(directory), []);
  for (const name of ['ds-missing', '../ds-example']) {
    await assert.rejects(readBuckets(root, name), DatasetNotFoundError);
  }
});

test('keeps arbitrary headers and labels as data rather than chart config keys', async (t) => {
  const { root, path } = await fixture(t);
  await fs.writeFile(path, 'constructor,__proto__\n"<script>alert(1)</script>",0.5\n');
  assert.deepEqual(await readBuckets(root, 'ds-example'), {
    status: 'available', labelColumn: 'constructor', valueColumn: '__proto__', total: 1,
    rows: [{ label: '<script>alert(1)</script>', value: 0.5 }],
  });
});

test('bounds chart rows and preserves CSV order with an explicit total', async (t) => {
  const { root, path } = await fixture(t);
  await fs.writeFile(path, 'Item,Metric\n' + Array.from({ length: 105 }, (_, i) => `label-${i},${i / 10}\n`).join(''));
  const result = await readBuckets(root, 'ds-example');
  assert.equal(result.status, 'available');
  if (result.status !== 'available') assert.fail('Expected bucket data');
  assert.equal(result.total, 105);
  assert.equal(result.rows.length, 100);
  assert.deepEqual(result.rows[0], { label: 'label-0', value: 0 });
  assert.deepEqual(result.rows.at(-1), { label: 'label-99', value: 9.9 });
});

test('reports invalid CSV without returning its contents as an error', async (t) => {
  const { root, path } = await fixture(t);
  for (const text of ['', 'label,value\nprivate-marker,-1\n', 'label,value\nprivate-marker,NaN\n']) {
    await fs.writeFile(path, text);
    const result = await readBuckets(root, 'ds-example');
    assert.deepEqual(result, { status: 'unavailable', message: 'buckets.csv is not a valid bucket summary.' });
    assert.equal(await fs.readFile(path, 'utf8'), text);
  }
});

test('refuses oversized, non-UTF-8 and linked bucket files', async (t) => {
  const { root, directory, path } = await fixture(t);
  for (const bytes of [Buffer.alloc(1_000_001, 'a'), Buffer.from([0xff])]) {
    await fs.writeFile(path, bytes);
    assert.equal((await readBuckets(root, 'ds-example')).status, 'unavailable');
    assert.deepEqual(await fs.readFile(path), bytes);
  }
  await fs.unlink(path);
  const target = join(directory, 'target.csv');
  await fs.writeFile(target, 'label,value\na,1\n');
  await fs.symlink(target, path);
  assert.equal((await readBuckets(root, 'ds-example')).status, 'unavailable');
  await fs.unlink(path);
  await fs.link(target, path);
  assert.equal((await readBuckets(root, 'ds-example')).status, 'unavailable');
});
