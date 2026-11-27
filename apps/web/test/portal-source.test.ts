import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPushedSource } from '../src/lib/server/portal-source.ts';
import type { Command } from '../src/lib/server/portal-checkout.ts';

const descriptor = { name: 'ds-example', title: 'Example', description: 'Description', resources: [] };
const sha = 'a'.repeat(40);
function fixture(options: { symlink?: boolean; changed?: boolean; wrongRepo?: boolean } = {}) {
  const endpoints: string[] = [];
  const run: Command = async (program, args) => {
    if (program === 'git') {
      if (args.includes('--show-toplevel')) return '/datasets/ds-example\n';
      if (args.includes('config')) return 'git@github.com:example/ds-example.git\n';
      if (args.includes('symbolic-ref')) return 'metadata/review\n';
      throw new Error('Unexpected Git operation');
    }
    assert.equal(program, 'gh');
    const path = args[1];
    endpoints.push(path);
    if (path === 'repos/example/ds-example') return JSON.stringify({ id: 42, private: true, full_name: options.wrongRepo ? 'example/ds-other' : 'example/ds-example' });
    if (path.includes('/git/ref/heads/metadata%2Freview')) return JSON.stringify({ ref: 'refs/heads/metadata/review', object: { type: 'commit', sha } });
    if (path.includes('/git/commits/')) return JSON.stringify({ sha, tree: { sha: 'b'.repeat(40) } });
    if (path.includes('/git/trees/')) return JSON.stringify({ truncated: false, tree: [{ type: 'blob', mode: options.symlink ? '120000' : '100644', path: 'datapackage.json' }] });
    if (path.includes('/contents/datapackage.json')) {
      assert.ok(path.endsWith(`?ref=${sha}`));
      return JSON.stringify({ encoding: 'base64', content: Buffer.from(JSON.stringify({ ...descriptor, ...(options.changed ? { title: 'Other' } : {}) })).toString('base64') });
    }
    throw new Error('Unexpected endpoint');
  };
  return { run, endpoints };
}

test('reads only metadata at the pushed branch head and compares saved metadata, independent of JSON formatting', async () => {
  const f = fixture();
  const result = await readPushedSource('/datasets/ds-example', JSON.stringify(descriptor, null, 2), f.run);
  assert.equal(result.sha, sha);
  assert.equal(result.branch, 'metadata/review');
  assert.equal(result.repository, 'example/ds-example');
  assert.ok(f.endpoints.every((path) => !path.includes('/compare/') && !/^repos\/[^/]+\/[^/]+\/commits\//.test(path)));
  assert.deepEqual(f.endpoints.filter((path) => path.includes('/contents/')), [`repos/example/ds-example/contents/datapackage.json?ref=${sha}`]);
});

test('blocks unpushed saved metadata, wrong repository identity and symlinked descriptors', async () => {
  const changed = fixture({ changed: true });
  await assert.rejects(readPushedSource('/datasets/ds-example', JSON.stringify(descriptor), changed.run), /commit.*push/i);
  const linked = fixture({ symlink: true });
  await assert.rejects(readPushedSource('/datasets/ds-example', JSON.stringify(descriptor), linked.run), /regular/);
  assert.ok(!linked.endpoints.some((path) => path.includes('/contents/')));
  const wrong = fixture({ wrongRepo: true });
  await assert.rejects(readPushedSource('/datasets/ds-example', JSON.stringify(descriptor), wrong.run), /identity/);
});

test('rejects unsafe source remotes before any network request', async () => {
  for (const remote of ['https://token@github.com/example/ds-example', 'https://github.com/example/ds-example?secret=x', 'file:///private/data', 'https://other.invalid/a/b']) {
    const run: Command = async (program, args) => {
      assert.equal(program, 'git');
      return args.includes('config') ? remote : '/datasets/ds-example';
    };
    await assert.rejects(readPushedSource('/datasets/ds-example', JSON.stringify(descriptor), run), /remote/);
  }
});
