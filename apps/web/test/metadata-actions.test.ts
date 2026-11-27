import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer } from 'vite';
import { DEFAULT_COMMIT_MESSAGE, hasDatasetChanges, readDatasetBranch, requestDatasetCommit } from '../src/lib/dataset-git.ts';

test('commit controls depend on real Git changes and the editable message is only inside a closed confirmation dialog', async (t) => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'steward-metadata-actions-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const app = fileURLToPath(new URL('../', import.meta.url));
  const server = await createServer({ root: app, configFile: false, publicDir: false, logLevel: 'error', cacheDir: directory,
    server: { middlewareMode: true, watch: null, ws: false }, resolve: { alias: { $lib: join(app, 'src/lib') } }, plugins: [svelte({ configFile: false })] });
  t.after(() => server.close());
  const { render } = await server.ssrLoadModule('svelte/server');
  const { default: Actions } = await server.ssrLoadModule('/src/lib/components/metadata-actions.svelte');
  const ready = { status: 'ready', branch: 'refactor/metadata', changes: ['datapackage.json'], ahead: 0 };
  const props = { saving: false, committing: false, saveMessage: '', saveError: '', dirty: false, syncError: '',
    reloadUrl: '/reload', commitUrl: '/commit', branchState: ready, metadataText: () => '{}', onsave: async () => {} };
  const view = (patch = {}) => render(Actions, { props: { ...props, ...patch } }).body.replace(/<!--[\s\S]*?-->/g, '');
  const html = view();
  const dialog = html.match(/<dialog\b[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(dialog);
  assert.doesNotMatch(dialog.match(/<dialog\b[^>]*>/)![0], /\sopen(?:=|[\s>])/);
  assert.match(dialog, /<textarea\b[^>]*rows="4"[^>]*>[\s\S]*?<\/textarea>/);
  assert.ok(dialog.includes(DEFAULT_COMMIT_MESSAGE));
  assert.match(dialog, /Commit message/);
  assert.doesNotMatch(html.replace(dialog, ''), /Commit message/);
  assert.match(html, /refactor\/metadata/);
  const action = (body: string) => [...body.replace(/<dialog\b[\s\S]*?<\/dialog>/g, '').matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .find(([button]) => /Commit &amp; push|Push changes/.test(button))?.[0] ?? '';
  assert.doesNotMatch(action(html), /\sdisabled(?:=|[\s/>])/);
  const clean = view({ branchState: { ...ready, changes: [] } });
  assert.match(action(clean), /\sdisabled(?:=|[\s/>])/);
  assert.match(clean, /Nothing to commit or push/);
  const ahead = view({ branchState: { ...ready, changes: [], ahead: 1 } });
  assert.match(action(ahead), /Push changes/);
  assert.doesNotMatch(action(ahead), /\sdisabled(?:=|[\s/>])/);
  assert.match(ahead, /1 local commit ready to push/);
  for (const patch of [{ dirty: true }, { saving: true }, { checksPending: true }, { hasIssues: true }, { syncError: 'Pending edit' }, { branchState: { ...ready, branch: 'main' } }])
    assert.match(action(view(patch)), /\sdisabled(?:=|[\s/>])/);
});

test('Git-state admission distinguishes clean, uncommitted, unpushed and unknown status', () => {
  const clean = { status: 'ready', branch: 'metadata/review', changes: [], ahead: 0 };
  assert.equal(hasDatasetChanges(readDatasetBranch(clean)), false);
  assert.equal(hasDatasetChanges(readDatasetBranch({ ...clean, changes: ['datapackage.json'] })), true);
  assert.equal(hasDatasetChanges(readDatasetBranch({ ...clean, ahead: 1 })), true);
  assert.equal(hasDatasetChanges({ status: 'unavailable', message: 'Check Git' }), false);
  for (const value of [{ ...clean, changes: ['data.csv'] }, { ...clean, ahead: -1 }, { status: 'ready', branch: 'missing-state' }])
    assert.throws(() => readDatasetBranch(value), /Git status/);
});

test('confirmation reads the latest saved text and edited message, and preserves actionable server failures', async () => {
  let text = '{"title":"Loaded"}';
  const getText = () => text;
  text = '{"title":"Saved after editing"}';
  const editedMessage = 'fix(metadata): correct description\n\nUse the confirmed source description.';
  const requests: unknown[] = [];
  const result = await requestDatasetCommit('/commit', getText, editedMessage, 'metadata/review', async (_url, options) => {
    requests.push(JSON.parse(String(options?.body)));
    return Response.json({ status: 'pushed', message: 'Pushed', branch: 'metadata/review', commit: 'a'.repeat(40) });
  });
  assert.deepEqual(requests, [{ text, message: editedMessage, branch: 'metadata/review' }]);
  assert.equal(result.status, 'pushed');
  const failed = await requestDatasetCommit('/commit', getText, editedMessage, 'metadata/review', async () =>
    Response.json({ status: 'error', message: 'The remote branch has newer commits.' }, { status: 409 }));
  assert.deepEqual(failed, { status: 'error', message: 'The remote branch has newer commits.' });
});
