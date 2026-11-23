import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBucketTable } from '../src/lib/readme.ts';
import { renderReadme } from '../src/lib/server/readme.ts';

test('targets only the table within the existing Buckets section', () => {
  const { nodes } = renderReadme('# Dataset\n\n## Resources\n\n| Resource | Count |\n| --- | --- |\n| CSV | 2 |\n\n## Buckets\n\nSummary text.\n\n| Group | Score |\n| --- | --- |\n| A | 0.5 |\n\n## Notes\n\nKeep these notes.');
  const tables = nodes.filter((node) => node.tag === 'table');
  assert.equal(findBucketTable(nodes), tables[1]);
});

test('recognizes formatted headings without changing the README nodes', () => {
  const { nodes } = renderReadme('## **Buckets**\n\n| Group | Score |\n| --- | --- |\n| A | 0.5 |');
  const before = structuredClone(nodes);
  assert.equal(findBucketTable(nodes)?.tag, 'table');
  assert.deepEqual(nodes, before);
});

test('does not replace tables in other sections or quoted bucket headings', () => {
  for (const text of [
    '## Resources\n\n| Resource | Count |\n| --- | --- |\n| CSV | 2 |',
    '## Buckets\n\nNo buckets available.\n\n## Notes\n\n| Item | Value |\n| --- | --- |\n| Note | 2 |',
    '> ## Buckets\n\n| Item | Value |\n| --- | --- |\n| Note | 2 |',
    '',
  ]) {
    assert.equal(findBucketTable(renderReadme(text).nodes), undefined);
  }
});
