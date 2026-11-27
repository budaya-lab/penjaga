import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { commitDataset, datasetBranch } from '../src/lib/server/dataset-git.ts';
import { command, type Command } from '../src/lib/server/portal-checkout.ts';
import { generatedComment } from '../src/lib/server/readme-generation.ts';
import { metadata } from './fixtures/portal.ts';

async function fixture(t: TestContext) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'steward-dataset-git-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const datasets = join(root, 'datasets');
  const directory = join(datasets, 'ds-example');
  const upstream = join(root, 'upstream.git');
  await fs.mkdir(directory, { recursive: true });
  const git = (args: string[], cwd = directory) => command('git', ['-c', 'core.hooksPath=/dev/null', ...args], cwd);
  await git(['init', '--bare', '--initial-branch=main', upstream], root);
  await git(['init', '-b', 'main']);
  await git(['config', 'user.name', 'Fixture']);
  await git(['config', 'user.email', 'fixture@example.invalid']);
  await git(['config', 'commit.gpgsign', 'false']);
  const text = JSON.stringify(metadata, null, 2) + '\n';
  await fs.writeFile(join(directory, 'datapackage.json'), text);
  await fs.writeFile(join(directory, 'README.md'), generatedComment + '\nInitial README\n');
  await fs.writeFile(join(directory, 'data.txt'), 'synthetic original');
  await git(['add', '.']);
  await git(['commit', '-m', 'Initial']);
  await git(['remote', 'add', 'origin', upstream]);
  await git(['push', 'origin', 'main']);
  await git(['switch', '-c', 'refactor/metadata']);
  await git(['push', '-u', 'origin', 'refactor/metadata']);
  await git(['remote', 'set-url', 'origin', 'https://github.com/example/ds-example.git']);
  const run: Command = (program, args, cwd) => command(program,
    args.includes('ls-remote') || args.includes('push') ? ['-c', `url.${upstream}.insteadOf=https://github.com/example/ds-example.git`, ...args] : args, cwd);
  const updated = JSON.stringify({ ...metadata, title: 'Updated' }, null, 2) + '\n';
  const input = { text: updated, message: 'chore(metadata): update example', branch: 'refactor/metadata' };
  return { root, datasets, directory, upstream, git, run, updated, input };
}

test('shows the current branch and commits only saved metadata and generated README, preserving other staged work', async (t) => {
  const f = await fixture(t);
  f.input.message = 'chore(metadata): update example\n\nKeep the confirmed metadata and README together.';
  assert.deepEqual(await datasetBranch(f.datasets, 'ds-example', f.run), { status: 'ready', branch: 'refactor/metadata', changes: [], ahead: 0 });
  await fs.writeFile(join(f.directory, 'datapackage.json'), f.updated);
  await fs.writeFile(join(f.directory, 'README.md'), generatedComment + '\nUpdated README\n');
  await fs.writeFile(join(f.directory, 'data.txt'), 'synthetic unrelated edit');
  await f.git(['add', 'data.txt']);
  assert.deepEqual(await datasetBranch(f.datasets, 'ds-example', f.run), { status: 'ready', branch: 'refactor/metadata', changes: ['datapackage.json', 'README.md'], ahead: 0 });
  const index = await f.git(['show', ':data.txt']);
  const result = await commitDataset(f.datasets, 'ds-example', f.input, f.run);
  assert.equal(result.status, 'pushed');
  assert.equal(result.branch, 'refactor/metadata');
  assert.equal((await f.git(['log', '-1', '--format=%B'])).trim(), f.input.message);
  assert.deepEqual((await f.git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])).trim().split('\n').sort(), ['README.md', 'datapackage.json']);
  assert.equal(await f.git(['show', ':data.txt']), index);
  assert.match(await f.git(['status', '--porcelain']), /M {2}data.txt/);
  assert.equal((await f.git(['rev-parse', 'HEAD'])).trim(), (await f.git(['rev-parse', 'refs/heads/refactor/metadata'], f.upstream)).trim());
});

test('push failures retain the commit and retry does not make another commit', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(join(f.directory, 'datapackage.json'), f.updated);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', f.input, async (program, args, cwd) => {
    if (args.includes('push')) throw new Error('Push denied');
    return f.run(program, args, cwd);
  }), /committed locally.*retry/i);
  const commit = await f.git(['rev-parse', 'HEAD']);
  assert.deepEqual(await datasetBranch(f.datasets, 'ds-example', f.run), { status: 'ready', branch: 'refactor/metadata', changes: [], ahead: 1 });
  assert.equal((await commitDataset(f.datasets, 'ds-example', f.input, f.run)).status, 'pushed');
  assert.equal(await f.git(['rev-parse', 'HEAD']), commit);
  assert.equal((await commitDataset(f.datasets, 'ds-example', f.input, f.run)).status, 'unchanged');
});

test('refuses to push existing commits that include unrelated data', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(join(f.directory, 'data.txt'), 'synthetic research change');
  await f.git(['add', 'data.txt']);
  await f.git(['commit', '-m', 'Unrelated']);
  const head = await f.git(['rev-parse', 'HEAD']);
  await fs.writeFile(join(f.directory, 'datapackage.json'), f.updated);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', f.input, f.run), /unrelated.*commits/i);
  assert.equal(await f.git(['rev-parse', 'HEAD']), head);
});

test('refuses main, detached HEAD, unsafe messages, unsaved metadata and a mismatched push remote', async (t) => {
  const f = await fixture(t);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', { ...f.input, message: '' }, f.run), /message/i);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', { ...f.input, message: 'bad\u0000message' }, f.run), /message/i);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', f.input, f.run), /Save.*first/i);
  await fs.writeFile(join(f.directory, 'datapackage.json'), f.updated);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', { ...f.input, branch: 'stale/branch' }, f.run), /branch changed/);
  await f.git(['remote', 'set-url', '--push', 'origin', 'https://github.com/example/different.git']);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', f.input, f.run), /same.*GitHub repository/i);
  await f.git(['remote', 'set-url', '--push', 'origin', 'https://github.com/example/ds-example.git']);
  await f.git(['switch', 'main']);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', f.input, f.run), /feature branch/i);
  await f.git(['checkout', '--detach']);
  assert.equal((await datasetBranch(f.datasets, 'ds-example', f.run)).status, 'unavailable');
  await assert.rejects(commitDataset(f.datasets, 'ds-example', f.input, f.run), /branch/i);
});

test('refuses a remotely advanced branch and a nonstandard default branch before committing', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(join(f.directory, 'datapackage.json'), f.updated);
  const before = await f.git(['rev-parse', 'HEAD']);
  await f.git(['symbolic-ref', 'HEAD', 'refs/heads/refactor/metadata'], f.upstream);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', f.input, f.run), /default branch/i);
  await f.git(['symbolic-ref', 'HEAD', 'refs/heads/main'], f.upstream);
  const other = join(f.root, 'other');
  await f.git(['clone', '--branch', 'refactor/metadata', f.upstream, other], f.root);
  await f.git(['config', 'user.name', 'Other fixture'], other);
  await f.git(['config', 'user.email', 'other@example.invalid'], other);
  await fs.writeFile(join(other, 'datapackage.json'), JSON.stringify({ ...metadata, title: 'Remote change' }));
  await f.git(['commit', '-am', 'Remote metadata'], other);
  await f.git(['push', 'origin', 'refactor/metadata'], other);
  await assert.rejects(commitDataset(f.datasets, 'ds-example', f.input, f.run), /remote branch has commits missing locally/i);
  assert.equal(await f.git(['rev-parse', 'HEAD']), before);
});

test('commits a newly Save-generated README without running dataset hooks', async (t) => {
  const f = await fixture(t);
  await f.git(['rm', 'README.md']);
  await f.git(['commit', '-m', 'Remove old README']);
  await f.git(['push', f.upstream, 'refactor/metadata']);
  await fs.writeFile(join(f.directory, 'README.md'), generatedComment + '\nNewly generated\n');
  await fs.writeFile(join(f.directory, 'datapackage.json'), f.updated);
  const marker = join(f.directory, 'hook-ran');
  await fs.writeFile(join(f.directory, '.git/hooks/pre-commit'), `#!/bin/sh\ntouch ${marker}\nexit 1\n`, { mode: 0o755 });
  const result = await commitDataset(f.datasets, 'ds-example', f.input, f.run);
  assert.equal(result.status, 'pushed');
  assert.match(await f.git(['show', 'HEAD:README.md']), /Newly generated/);
  await assert.rejects(fs.stat(marker), { code: 'ENOENT' });
});

test('can create a remote feature branch, never commits handwritten README and refuses filtered metadata', async (t) => {
  const f = await fixture(t);
  await f.git(['switch', '-c', 'feat/new-metadata']);
  f.input.branch = 'feat/new-metadata';
  await fs.writeFile(join(f.directory, 'datapackage.json'), f.updated);
  await fs.writeFile(join(f.directory, 'README.md'), 'Handwritten user notes');
  const result = await commitDataset(f.datasets, 'ds-example', f.input, f.run);
  assert.equal(result.status, 'pushed');
  assert.equal((await f.git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])).trim(), 'datapackage.json');
  assert.match(await f.git(['status', '--porcelain']), /README.md/);
  await fs.writeFile(join(f.directory, '.gitattributes'), 'datapackage.json filter=unsafe\n');
  await assert.rejects(commitDataset(f.datasets, 'ds-example', f.input, f.run), /filter/i);
});
