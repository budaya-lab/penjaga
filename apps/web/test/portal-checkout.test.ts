import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { test } from 'node:test';
import { command, portalCheckout, portalClonePath, portalGit } from '../src/lib/server/portal-checkout.ts';
import { portalFixture } from './fixtures/portal.ts';

test('defaults the portal clone to the home cache and accepts only absolute overrides', () => {
  assert.equal(portalClonePath(undefined), join(homedir(), '.cache/penjaga/data-portal'));
  assert.equal(portalClonePath(undefined, '/synthetic-home'), '/synthetic-home/.cache/penjaga/data-portal');
  assert.equal(portalClonePath('/custom/portal', '/synthetic-home'), '/custom/portal');
  for (const value of ['', 'relative', '~/portal']) assert.throws(() => portalClonePath(value), /PORTAL_CLONE.*absolute/);
});

test('creates a dedicated marked clone and fast-forwards main to the current catalogue', async (t) => {
  const f = await portalFixture(t);
  const first = await portalCheckout(f.clone, f.run);
  assert.equal(await fs.readFile(join(f.clone, 'datasets.json'), 'utf8'), '[]\n');
  assert.equal(first.catalogue, '[]\n');
  await fs.writeFile(join(f.upstream, 'datasets.json'), '[{"name":"New"}]\n');
  await f.git(['commit', '-am', 'Update']);
  const next = await portalCheckout(f.clone, f.run);
  assert.notEqual(next.base, first.base);
  assert.equal(next.catalogue, '[{"name":"New"}]\n');
  assert.equal(await fs.readFile(join(f.clone, 'datasets.json'), 'utf8'), '[{"name":"New"}]\n');
  assert.ok(f.calls.filter((c) => c.program === 'git').every((c) => c.args.includes('core.hooksPath=/dev/null')));
});

test('refuses unconfigured, pre-existing unmarked, symlinked or wrong-remote checkouts', async (t) => {
  const f = await portalFixture(t);
  await assert.rejects(portalCheckout(undefined, f.run), /PORTAL_CLONE/);
  await assert.rejects(portalCheckout('relative', f.run), /absolute/);
  await assert.rejects(portalCheckout(f.upstream, f.run), /dedicated/);
  const empty = join(f.root, 'empty');
  await fs.mkdir(empty);
  await assert.rejects(portalCheckout(empty, f.run), /dedicated/);
  await portalCheckout(f.clone, f.run);
  await f.git(['remote', 'set-url', 'origin', 'https://github.com/example/other.git'], f.clone);
  await assert.rejects(portalCheckout(f.clone, f.run), /remote/);
  const link = join(f.root, 'link');
  await fs.symlink(f.clone, link);
  await assert.rejects(portalCheckout(link, f.run), /symlink/);
});

test('preserves staged, unstaged and untracked unfinished work in a local stash before retrying', async (t) => {
  const f = await portalFixture(t);
  const first = await portalCheckout(f.clone, f.run);
  await f.git(['switch', '-c', 'chore/portal-42'], f.clone);
  await fs.writeFile(join(f.clone, 'datasets.json'), '["staged"]\n');
  await f.git(['add', 'datasets.json'], f.clone);
  await fs.writeFile(join(f.clone, 'datasets.json'), '["unfinished"]\n');
  await fs.writeFile(join(f.clone, 'keep.txt'), 'untracked work');
  const next = await portalCheckout(f.clone, f.run);
  assert.match(next.recovery ?? '', /^[a-f0-9]{40}$/);
  assert.equal(next.base, first.base);
  assert.equal(next.catalogue, '[]\n');
  assert.equal(await fs.readFile(join(f.clone, 'datasets.json'), 'utf8'), '[]\n');
  assert.equal((await f.git(['status', '--porcelain'], f.clone)).trim(), '');
  assert.equal(await f.git(['show', `${next.recovery}:datasets.json`], f.clone), '["unfinished"]\n');
  assert.equal(await f.git(['show', `${next.recovery}^2:datasets.json`], f.clone), '["staged"]\n');
  assert.equal(await f.git(['show', `${next.recovery}^3:keep.txt`], f.clone), 'untracked work');
  assert.equal((await f.git(['branch', '--show-current'], f.clone)).trim(), 'main');
  assert.equal((await portalCheckout(f.clone, f.run)).recovery, null);
  assert.equal((await f.git(['stash', 'list', '--format=%H'], f.clone)).trim(), next.recovery);
});

test('failed recovery preserves unfinished work and stops before installing or pushing', async (t) => {
  const f = await portalFixture(t);
  await portalCheckout(f.clone, f.run);
  await fs.writeFile(join(f.clone, 'datasets.json'), '["keep me"]\n');
  await assert.rejects(portalCheckout(f.clone, async (program, args, cwd) => {
    if (args.includes('stash')) throw new Error('Recovery failed');
    return f.run(program, args, cwd);
  }), /Could not preserve unfinished portal work/);
  assert.equal(await fs.readFile(join(f.clone, 'datasets.json'), 'utf8'), '["keep me"]\n');
});

test('refuses a different push remote as well as an external Git directory', async (t) => {
  const f = await portalFixture(t);
  await portalCheckout(f.clone, f.run);
  await f.git(['remote', 'set-url', '--push', 'origin', 'https://github.com/example/other.git'], f.clone);
  await assert.rejects(portalCheckout(f.clone, f.run), /remote/);
  await f.git(['remote', 'set-url', '--push', 'origin', 'https://github.com/budaya-lab/data-portal.git'], f.clone);
  const external = join(f.root, 'external-git');
  await fs.rename(join(f.clone, '.git'), external);
  await fs.symlink(external, join(f.clone, '.git'));
  await assert.rejects(portalCheckout(f.clone, f.run), /dedicated/);
});

test('portal pnpm commands do not inherit the Steward development or production mode', async (t) => {
  const f = await portalFixture(t);
  const bin = join(f.root, 'bin');
  await fs.mkdir(bin);
  const probe = `#!${process.execPath}\nconsole.log(JSON.stringify({ nodeEnv: process.env.NODE_ENV ?? null, noPrompt: process.env.GIT_TERMINAL_PROMPT }));\n`;
  await fs.writeFile(join(bin, 'pnpm'), probe, { mode: 0o755 });
  await fs.writeFile(join(bin, 'git'), probe, { mode: 0o755 });
  const module = new URL('../src/lib/server/portal-checkout.ts', import.meta.url).href;
  for (const mode of ['development', 'production']) {
    const script = `const { command } = await import(${JSON.stringify(module)}); console.log(JSON.stringify([JSON.parse(await command('pnpm', ['validate'])), JSON.parse(await command('pnpm', ['install'])), JSON.parse(await command('git', ['probe']))]));`;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
      cwd: f.root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NODE_ENV: mode },
    });
    const [validate, install, git] = JSON.parse(stdout);
    assert.equal(validate.nodeEnv, null);
    assert.equal(install.nodeEnv, null, 'installation must still include development tools');
    assert.equal(git.nodeEnv, mode, 'only portal package commands change NODE_ENV');
    assert.equal(validate.noPrompt, '0');
  }
});

test('HTTPS Git operations use the existing gh login without persistent credential changes', async () => {
  const result = await portalGit(async (program, args, cwd) => {
    assert.equal(program, 'git');
    assert.equal(cwd, '/managed-portal');
    const helpers = args.filter((arg) => arg.startsWith('credential.'));
    assert.deepEqual(helpers, [
      'credential.https://github.com.helper=',
      'credential.https://github.com.helper=!gh auth git-credential',
    ]);
    assert.ok(args.includes('core.hooksPath=/dev/null'));
    assert.deepEqual(args.slice(-3), ['push', 'origin', 'HEAD:refs/heads/chore/portal-42']);
    assert.ok(!args.includes('config'));
    return 'push result';
  }, '/managed-portal', ['push', 'origin', 'HEAD:refs/heads/chore/portal-42']);
  assert.equal(result, 'push result');
});

test('command failures identify the Git operation without disclosing arguments', async () => {
  await assert.rejects(command('git', ['-c', 'core.hooksPath=/dev/null', 'push', '--invalid-secret-option']), (error: Error) => {
    assert.match(error.message, /Git push failed/);
    assert.doesNotMatch(error.message, /invalid-secret-option/);
    return true;
  });
});

test('validation errors expose only failing check filenames, never raw assertions or private paths', async (t) => {
  const f = await portalFixture(t);
  const bin = join(f.root, 'bin');
  await fs.mkdir(bin);
  const output = 'test at scripts/catalogue-datasets.test.ts:90:10\\nactual: sensitive-marker\\n/private/private-user/scripts/restricted-resources.test.ts:12:3';
  await fs.writeFile(join(bin, 'pnpm'), `#!${process.execPath}\nconsole.error(${JSON.stringify(output)}); process.exit(1);\n`, { mode: 0o755 });
  const module = new URL('../src/lib/server/portal-checkout.ts', import.meta.url).href;
  const script = `const { command } = await import(${JSON.stringify(module)}); try { await command('pnpm', ['validate']); } catch (error) { console.log(JSON.stringify({ message: error.message, checks: error.checks, step: error.step })); }`;
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
    cwd: f.root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  const error = JSON.parse(stdout);
  assert.equal(error.step, 'validation');
  assert.deepEqual(error.checks, ['scripts/catalogue-datasets.test.ts', 'scripts/restricted-resources.test.ts']);
  assert.doesNotMatch(stdout, /sensitive-marker|private-user/);
});

test('command failures are actionable without disclosing command output or credentials', async () => {
  await assert.rejects(command('git', ['not-a-command-secret']), (error: Error) => {
    assert.doesNotMatch(error.message, /not-a-command-secret/);
    assert.match(error.message, /Git/);
    return true;
  });
});
