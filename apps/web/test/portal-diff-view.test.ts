import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer } from 'vite';

test('renders an accessible unified diff with escaped metadata and all-addition/unchanged states', async (t) => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'steward-portal-diff-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const app = fileURLToPath(new URL('../', import.meta.url));
  const server = await createServer({
    root: app, configFile: false, publicDir: false, logLevel: 'error', cacheDir: directory,
    server: { middlewareMode: true, watch: null, ws: false },
    resolve: { alias: { $lib: join(app, 'src/lib') } },
    plugins: [svelte({ configFile: false })],
  });
  t.after(() => server.close());
  const { render } = await server.ssrLoadModule('svelte/server');
  const { default: Diff } = await server.ssrLoadModule('/src/lib/components/portal-diff.svelte');
  const before = { name: 'Old', description: 'Unchanged' };
  const after = { name: '<script>unsafe</script>', description: 'Unchanged' };
  const html = render(Diff, { props: { before, after } }).body.replace(/<!--[\s\S]*?-->/g, '');
  assert.match(html, /aria-label="Catalogue JSON diff"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /1 added lines/);
  assert.match(html, /1 removed lines/);
  assert.match(html, /− .*Old/);
  assert.match(html, /\+ .*&lt;script/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Unchanged/);
  const added = render(Diff, { props: { before: null, after } }).body;
  assert.match(added, /not yet catalogued/);
  assert.match(added, /0 removed lines/);
  const unchanged = render(Diff, { props: { before: after, after } }).body;
  assert.match(unchanged, /0 added lines/);
  assert.match(unchanged, /0 removed lines/);
  const { default: Gap } = await server.ssrLoadModule('/src/lib/components/portal-source-gap.svelte');
  const gap = render(Gap, { props: { metadataUrl: '/datasets/ds-example?view=metadata', source: {
    repository: 'example/ds-example', branch: 'metadata/review', sha: 'b'.repeat(40), saved: after, pushed: before,
  } } }).body;
  assert.match(gap, /Saved changes are not on GitHub yet/);
  assert.match(gap, /metadata\/review/);
  assert.match(gap, /bbbbbbbb/);
  assert.match(gap, /Pushed on GitHub/);
  assert.match(gap, /Saved locally/);
  assert.match(gap, /Open Metadata to commit/);
  assert.match(gap, /aria-label="Metadata sync JSON diff"/);
  assert.doesNotMatch(gap, /<script>|Portal action stopped/);
});
