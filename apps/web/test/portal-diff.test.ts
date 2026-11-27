import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portalEntryDiff, preservePortalFieldOrder } from '../src/lib/portal-diff.ts';

function reconstruct(lines: ReturnType<typeof portalEntryDiff>, side: 'before' | 'after') {
  return lines.filter((line) => line.kind !== (side === 'before' ? 'add' : 'remove')).map((line) => line.text).join('\n');
}

test('ignores reordered object fields recursively but still shows real values and array order changes', () => {
  const before = { name: 'Same', resources: [{ name: 'one', details: { count: 0, title: 'First' } }, { name: 'two' }] };
  const reordered = { resources: [{ details: { title: 'First', count: 0 }, name: 'one' }, { name: 'two' }], name: 'Same' };
  assert.ok(portalEntryDiff(before, reordered).every((line) => line.kind === 'context'));
  assert.ok(portalEntryDiff(before, { ...reordered, name: 'Changed' }).some((line) => line.kind === 'add' && line.text.includes('Changed')));
  assert.ok(portalEntryDiff(before, { ...reordered, resources: [...reordered.resources].reverse() }).some((line) => line.kind !== 'context'));
  assert.equal(reordered.resources[0].details?.count, 0);
  assert.deepEqual(Object.keys(reordered), ['resources', 'name']);
});

test('matches resource field ordering by unique name, not shifted array position', () => {
  const before = { resources: [
    { name: 'buckets', path: 'summary.csv', format: 'csv', title: 'Summary' },
    { name: 'input', title: 'Manifest', path: 'input.csv', count: 178, format: 'csv', access: 'restricted' },
  ] };
  const after = { resources: [
    { name: 'input', path: 'input.csv', format: 'csv', title: 'Manifest', access: 'restricted', count: 178 },
  ] };
  const lines = portalEntryDiff(before, after);
  // Removing a resource is meaningful; do not turn it into edits to its neighbour.
  assert.deepEqual(JSON.parse(reconstruct(lines, 'after')), after);
  assert.ok(lines.some((line) => line.kind === 'remove' && line.text.includes('buckets')));
  assert.ok(!lines.some((line) => line.kind === 'add'));
  for (const field of ['Manifest', '178', 'restricted']) {
    assert.ok(!lines.some((line) => line.kind !== 'context' && line.text.includes(field)));
  }
});

test('field alignment never drops duplicated or unnamed resources, or mutates either input', () => {
  const before = { resources: [{ name: 'same', count: 0 }] };
  for (const resources of [
    [{ count: 1, name: 'same' }, { count: 2, name: 'same' }],
    [null, 'unresolved', { count: 0 }],
  ]) {
    const after = { resources };
    const original = JSON.stringify({ before, after });
    assert.deepEqual(preservePortalFieldOrder(before, after), after);
    assert.deepEqual(JSON.parse(reconstruct(portalEntryDiff(before, after), 'after')), after);
    assert.equal(JSON.stringify({ before, after }), original);
  }
});

test('shows changed lines with unchanged context and correct old/new line numbers', () => {
  const before = { name: 'Old', description: 'Same', count: 2 };
  const after = { name: 'New', description: 'Same', count: 0 };
  const lines = portalEntryDiff(before, after);
  assert.equal(reconstruct(lines, 'before'), JSON.stringify(before, null, 2));
  assert.equal(reconstruct(lines, 'after'), JSON.stringify(after, null, 2));
  assert.deepEqual(lines.filter((line) => line.kind === 'remove').map((line) => line.text), ['  "name": "Old",', '  "count": 2']);
  assert.deepEqual(lines.filter((line) => line.kind === 'add').map((line) => line.text), ['  "name": "New",', '  "count": 0']);
  assert.ok(lines.some((line) => line.kind === 'context' && line.text.includes('description')));
  assert.deepEqual(lines.filter((line) => line.oldLine !== null).map((line) => line.oldLine), [1, 2, 3, 4, 5]);
  assert.deepEqual(lines.filter((line) => line.newLine !== null).map((line) => line.newLine), [1, 2, 3, 4, 5]);
});

test('new records are entirely additions; unchanged records have no additions or removals', () => {
  const entry = { name: 'New', resources: [] };
  const added = portalEntryDiff(null, entry);
  assert.ok(added.every((line) => line.kind === 'add' && line.oldLine === null));
  assert.equal(reconstruct(added, 'before'), '');
  assert.equal(reconstruct(added, 'after'), JSON.stringify(entry, null, 2));
  assert.ok(portalEntryDiff(entry, entry).every((line) => line.kind === 'context'));
});

test('repeated lines, reordered resources and omitted values reconstruct both entries exactly', () => {
  const before = { resources: [{ name: 'one', count: 0 }, { name: 'two', count: 0 }], version: '1.0.0' };
  const after = { resources: [{ name: 'two', count: 1 }, { name: 'one', count: 0 }] };
  const lines = portalEntryDiff(before, after);
  assert.equal(reconstruct(lines, 'before'), JSON.stringify(before, null, 2));
  assert.equal(reconstruct(lines, 'after'), JSON.stringify(after, null, 2));
  assert.equal(new Set(lines.map((line) => `${line.oldLine}:${line.newLine}`)).size, lines.length);
});

test('large replacements stay complete without allocating an unbounded comparison matrix', () => {
  const before = Object.fromEntries(Array.from({ length: 1200 }, (_, index) => [`old-${index}`, index]));
  const after = Object.fromEntries(Array.from({ length: 1200 }, (_, index) => [`new-${index}`, index]));
  const lines = portalEntryDiff(before, after);
  assert.equal(reconstruct(lines, 'before'), JSON.stringify(before, null, 2));
  assert.equal(reconstruct(lines, 'after'), JSON.stringify(after, null, 2));
});
