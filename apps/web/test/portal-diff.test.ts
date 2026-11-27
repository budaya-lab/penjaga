import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portalEntryDiff } from '../src/lib/portal-diff.ts';

function reconstruct(lines: ReturnType<typeof portalEntryDiff>, side: 'before' | 'after') {
  return lines.filter((line) => line.kind !== (side === 'before' ? 'add' : 'remove')).map((line) => line.text).join('\n');
}

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
