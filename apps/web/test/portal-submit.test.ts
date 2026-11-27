import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { PortalSourceMismatch } from '../src/lib/server/portal-source.ts';
import { portalOperation } from '../src/lib/server/portal-submit.ts';
import type { Command } from '../src/lib/server/portal-checkout.ts';
import { metadata, source, portalFixture } from './fixtures/portal.ts';

async function fixture(t: TestContext) {
  const f = await portalFixture(t);
  const datasets = join(f.root, 'datasets');
  const directory = join(datasets, 'ds-example');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(join(directory, 'datapackage.json'), JSON.stringify(metadata));
  let opened = false;
  const events: string[] = [];
  const run: Command = async (program, args, cwd) => {
    if (program === 'pnpm') {
      if (args[0] === 'install') {
        events.push('install');
        assert.deepEqual(args, ['install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile']);
        await fs.mkdir(join(f.clone, 'node_modules'), { recursive: true });
      } else {
        events.push('validate');
        assert.deepEqual(args, ['validate']);
      }
      return '';
    }
    if (program === 'gh') {
      events.push(args.slice(0, 2).join(' '));
      if (args[1] === 'list') return JSON.stringify(opened ? [{ number: 1, url: 'https://github.com/budaya-lab/data-portal/pull/1' }] : []);
      if (args[1] === 'create') { opened = true; return 'https://github.com/budaya-lab/data-portal/pull/1\n'; }
      if (args[1] === 'edit') return '';
      throw new Error('Unexpected gh call');
    }
    if (program === 'git' && args.includes('push')) events.push('push');
    return f.run(program, args, cwd);
  };
  const dependencies = { run, readSource: async () => source };
  return { ...f, datasets, directory, events, dependencies };
}

test('a saved/pushed mismatch is an actionable state with a diff, not a generic failure or catalogue write', async (t) => {
  const f = await fixture(t);
  const different = { ...metadata, title: 'Saved locally' };
  const result = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, {
    ...f.dependencies, readSource: async () => { throw new PortalSourceMismatch({ repository: source.repository, branch: source.branch, sha: source.sha, saved: different, pushed: metadata }); },
  });
  assert.equal(result.status, 'needs-push');
  if (result.status !== 'needs-push') throw new Error('Expected source readiness state');
  assert.deepEqual(result.source.saved, different);
  assert.deepEqual(result.source.pushed, metadata);
  assert.equal(result.source.branch, 'main');
  assert.deepEqual(f.events, []);
  await assert.rejects(fs.stat(f.clone), { code: 'ENOENT' });
});

test('preview sets up dependencies without catalogue edits; confirmation validates then pushes only catalogue data and reuses its PR', async (t) => {
  const f = await fixture(t);
  const preview = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  assert.equal(preview.status, 'preview');
  if (preview.status !== 'preview') throw new Error('Expected preview');
  assert.equal(await fs.readFile(join(f.clone, 'datasets.json'), 'utf8'), '[]\n');
  assert.deepEqual(f.events, ['install']);
  const submit = { action: 'submit' as const, revision: preview.preview.revision, confirmed: true as const };
  const result = await portalOperation(f.datasets, 'ds-example', f.clone, submit, f.dependencies);
  assert.equal(result.status, 'submitted');
  assert.ok(f.events.indexOf('validate') < f.events.indexOf('push'));
  assert.ok(f.events.indexOf('push') < f.events.indexOf('pr create'));
  assert.equal((await f.git(['diff', '--name-only', 'main...chore/portal-42'])).trim(), 'datasets.json');
  const commit = (await f.git(['rev-parse', 'chore/portal-42'], f.clone)).trim();
  await portalOperation(f.datasets, 'ds-example', f.clone, submit, f.dependencies);
  assert.equal((await f.git(['rev-parse', 'chore/portal-42'], f.clone)).trim(), commit);
  assert.equal(f.events.filter((event) => event === 'pr create').length, 1);
  assert.equal(f.events.filter((event) => event === 'pr edit').length, 1);
  assert.equal(await fs.readFile(join(f.directory, 'datapackage.json'), 'utf8'), JSON.stringify(metadata));
  assert.equal((await f.git(['status', '--porcelain'], f.clone)).trim(), '');
});

test('changed portal main or source SHA requires another preview before any write or push', async (t) => {
  const f = await fixture(t);
  const result = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  if (result.status !== 'preview') throw new Error('Expected preview');
  const submit = { action: 'submit' as const, revision: result.preview.revision, confirmed: true as const };
  await fs.writeFile(join(f.upstream, 'other.txt'), 'Main advanced');
  await f.git(['add', 'other.txt']);
  await f.git(['commit', '-m', 'Advance main']);
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone, submit, f.dependencies), /preview again/i);
  assert.deepEqual(f.events, ['install']);
  const latest = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  if (latest.status !== 'preview') throw new Error('Expected preview');
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone, { ...submit, revision: latest.preview.revision },
    { ...f.dependencies, readSource: async () => ({ ...source, sha: 'b'.repeat(40) }) }), /preview again/i);
});

test('automatically restores missing dependencies before validation and catalogue publication', async (t) => {
  const f = await fixture(t);
  const preview = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  if (preview.status !== 'preview') throw new Error('Expected preview');
  await fs.rmdir(join(f.clone, 'node_modules'));
  f.events.length = 0;
  const result = await portalOperation(f.datasets, 'ds-example', f.clone,
    { action: 'submit', confirmed: true, revision: preview.preview.revision }, f.dependencies);
  assert.equal(result.status, 'submitted');
  assert.equal(f.events[0], 'install');
  assert.ok(f.events.indexOf('install') < f.events.indexOf('validate'));
  assert.ok(f.events.indexOf('validate') < f.events.indexOf('push'));
});

test('failed automatic installation stops before catalogue writes and can retry from the Portal tab', async (t) => {
  const f = await fixture(t);
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, {
    ...f.dependencies,
    run: async (program, args, cwd) => {
      if (program === 'pnpm' && args[0] === 'install') throw new Error('private-token-output');
      return f.dependencies.run(program, args, cwd);
    },
  }), (error: Error) => {
    assert.match(error.message, /dependency installation failed.*Refresh preview/i);
    assert.doesNotMatch(error.message, /private-token-output/);
    return true;
  });
  assert.equal(await fs.readFile(join(f.clone, 'datasets.json'), 'utf8'), '[]\n');
  assert.equal((await f.git(['status', '--porcelain'], f.clone)).trim(), '');
  assert.deepEqual(f.events, []);
  const retry = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  assert.equal(retry.status, 'preview');
  assert.deepEqual(f.events, ['install']);
});

test('installation rechecks a refreshed portal main and refuses changed repository files', async (t) => {
  const f = await fixture(t);
  await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  await fs.writeFile(join(f.upstream, 'package.json'), '{"private":true}\n');
  await f.git(['add', 'package.json']);
  await f.git(['commit', '-m', 'Update portal dependencies']);
  f.events.length = 0;
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, {
    ...f.dependencies,
    run: async (program, args, cwd) => {
      const result = await f.dependencies.run(program, args, cwd);
      if (program === 'pnpm' && args[0] === 'install') await fs.writeFile(join(f.clone, 'package.json'), 'changed by install');
      return result;
    },
  }), /installation changed repository files/);
  assert.deepEqual(f.events, ['install']);
  assert.equal(await fs.readFile(join(f.clone, 'package.json'), 'utf8'), 'changed by install');
  assert.equal(await fs.readFile(join(f.clone, 'datasets.json'), 'utf8'), '[]\n');
});

test('refuses linked dependency directories before installing', async (t) => {
  const f = await fixture(t);
  await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  await fs.rmdir(join(f.clone, 'node_modules'));
  const outside = join(f.root, 'outside-modules');
  await fs.mkdir(outside);
  await fs.symlink(outside, join(f.clone, 'node_modules'));
  // Real portal clones ignore node_modules; exercise the install boundary too.
  await fs.appendFile(join(f.clone, '.git/info/exclude'), '\n/node_modules\n');
  f.events.length = 0;
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies), /not a link/);
  assert.deepEqual(f.events, []);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('malformed PR lookup responses fail closed before catalogue writes', async (t) => {
  const f = await fixture(t);
  const preview = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  if (preview.status !== 'preview') throw new Error('Expected preview');
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone,
    { action: 'submit', confirmed: true, revision: preview.preview.revision }, { ...f.dependencies,
      run: async (program, args, cwd) => program === 'gh' && args[1] === 'list' ? '[null]' : f.dependencies.run(program, args, cwd),
    }), /invalid portal PR/);
  assert.equal((await f.git(['status', '--porcelain'], f.clone)).trim(), '');
  assert.ok(!f.events.includes('push'));
});

test('failed validation leaves recoverable work and makes no push', async (t) => {
  const f = await fixture(t);
  const preview = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  if (preview.status !== 'preview') throw new Error('Expected preview');
  const submit = { action: 'submit' as const, revision: preview.preview.revision, confirmed: true as const };
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone, submit, { ...f.dependencies,
    run: async (program, args, cwd) => { if (program === 'pnpm' && args[0] === 'validate') throw new Error('Validation failed'); return f.dependencies.run(program, args, cwd); },
  }), /Validation failed/);
  assert.ok((await f.git(['status', '--porcelain'], f.clone)).includes('datasets.json'));
  assert.ok(!f.events.includes('push'));
  const unfinished = await fs.readFile(join(f.clone, 'datasets.json'), 'utf8');
  const retry = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  assert.equal(retry.status, 'preview');
  if (retry.status !== 'preview') throw new Error('Expected preview');
  assert.ok(retry.preview.warnings.some((warning) => warning.includes('recovery stash')));
  assert.equal(await f.git(['show', 'refs/stash:datasets.json'], f.clone), unfinished);
  assert.equal(await fs.readFile(join(f.clone, 'datasets.json'), 'utf8'), '[]\n');
  const result = await portalOperation(f.datasets, 'ds-example', f.clone,
    { action: 'submit', confirmed: true, revision: retry.preview.revision }, f.dependencies);
  assert.equal(result.status, 'submitted');
});

test('source visibility changes during validation stop publication even when the commit is unchanged', async (t) => {
  const f = await fixture(t);
  const preview = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  if (preview.status !== 'preview') throw new Error('Expected preview');
  let reads = 0;
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone,
    { action: 'submit', confirmed: true, revision: preview.preview.revision }, { ...f.dependencies,
      readSource: async () => ++reads === 1 ? source : { ...source, private: false },
    }), /changed during validation/);
  assert.ok(!f.events.includes('push'));
});

test('a push failure leaves the commit for a clean retry without creating a duplicate commit or PR', async (t) => {
  const f = await fixture(t);
  const preview = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  if (preview.status !== 'preview') throw new Error('Expected preview');
  const submit = { action: 'submit' as const, confirmed: true as const, revision: preview.preview.revision };
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone, submit, { ...f.dependencies,
    run: async (program, args, cwd) => { if (program === 'git' && args.includes('push')) throw new Error('Push refused'); return f.dependencies.run(program, args, cwd); },
  }), /Push refused/);
  assert.ok(!f.events.includes('pr create'));
  const commit = await f.git(['rev-parse', 'HEAD'], f.clone);
  await portalOperation(f.datasets, 'ds-example', f.clone, submit, f.dependencies);
  assert.equal(await f.git(['rev-parse', 'HEAD'], f.clone), commit);
});

test('refuses unexpected code in an existing proposal before running validation or pushing', async (t) => {
  const f = await fixture(t);
  const preview = await portalOperation(f.datasets, 'ds-example', f.clone, { action: 'preview' }, f.dependencies);
  if (preview.status !== 'preview') throw new Error('Expected preview');
  await f.git(['switch', '-c', 'chore/portal-42'], f.clone);
  await fs.writeFile(join(f.clone, 'unexpected-code.js'), 'throw new Error("Must not run")');
  await f.git(['add', 'unexpected-code.js'], f.clone);
  await f.git(['commit', '-m', 'Unexpected change'], f.clone);
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone,
    { action: 'submit', confirmed: true, revision: preview.preview.revision }, f.dependencies), /unexpected/i);
  assert.ok(!f.events.includes('validate'));
  assert.ok(!f.events.includes('push'));
});

test('refuses a clone inside dataset roots and confirms request shape before mutation', async (t) => {
  const f = await fixture(t);
  for (const path of [join(f.datasets, 'portal'), join(f.datasets, '..cache', 'portal')]) {
    await assert.rejects(portalOperation(f.datasets, 'ds-example', path, { action: 'preview' }, f.dependencies), /outside/);
  }
  await assert.rejects(portalOperation(f.datasets, 'ds-example', f.clone, { action: 'submit', revision: 'bad', confirmed: true }, f.dependencies), /preview/);
  assert.equal(await fs.stat(f.clone).then(() => true, () => false), false);
});
