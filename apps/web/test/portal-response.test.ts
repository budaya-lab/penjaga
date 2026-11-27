import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPortalResponse } from '../src/lib/portal.ts';

test('admits the portal response contract and refuses unsafe PR links or malformed previews', () => {
  const preview = { status: 'preview', preview: { revision: 'a'.repeat(64), sha: 'b'.repeat(40), repository: 'example/ds-example', branch: 'metadata/review',
    action: 'add', changed: true, before: null, after: { name: '<script>escaped</script>' }, warnings: [] } };
  assert.deepEqual(readPortalResponse(preview), preview);
  const mismatch = { status: 'needs-push', source: { repository: 'example/ds-example', branch: 'metadata/review', sha: 'b'.repeat(40), saved: { name: 'New' }, pushed: { name: 'Old' } } };
  assert.deepEqual(readPortalResponse(mismatch), mismatch);
  assert.throws(() => readPortalResponse({ ...mismatch, source: { ...mismatch.source, sha: 'bad' } }), /response/);
  assert.equal(readPortalResponse({ status: 'submitted', message: 'Ready', url: 'https://github.com/budaya-lab/data-portal/pull/1' }).status, 'submitted');
  for (const value of [null, {}, { ...preview, preview: {} }, { status: 'submitted', message: 'Ready', url: 'javascript:alert(1)' },
    { status: 'submitted', message: 'Ready', url: 'https://github.com/other/project/pull/1' }]) assert.throws(() => readPortalResponse(value), /response/);
});
