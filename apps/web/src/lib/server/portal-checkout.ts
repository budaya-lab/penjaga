import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { PortalStep } from '../portal.ts';

export const PORTAL_REPOSITORY = 'budaya-lab/data-portal';
export const PORTAL_REMOTE = `https://github.com/${PORTAL_REPOSITORY}.git`;
export class PortalError extends Error { step?: PortalStep; checks?: string[]; }
const exec = promisify(execFile);

export async function command(program: string, args: string[], cwd?: string): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1', GH_PROMPT_DISABLED: '1', GH_HOST: 'github.com' };
  // Let the portal choose test/build modes and install its development tools.
  if (program === 'pnpm') delete env.NODE_ENV;
  try {
    const result = await exec(program, args, {
      cwd, timeout: program === 'pnpm' ? 600_000 : 120_000, maxBuffer: 20 * 1024 * 1024,
      env,
    });
    return result.stdout;
  } catch (cause) {
    const gitOperation = args.find((arg) => ['clone', 'fetch', 'switch', 'merge', 'push', 'commit', 'stash', 'status', 'config', 'add', 'diff', 'branch', 'show', 'rev-parse', 'symbolic-ref', 'ls-tree', 'ls-remote', 'cat-file', 'diff-tree', 'check-attr'].includes(arg)) ?? 'operation';
    const message = program === 'pnpm'
      ? (args[0] === 'install'
        ? 'Portal dependency installation failed. Check pnpm 12.x and network access, then use Refresh preview to retry. No catalogue proposal was written.'
        : 'Portal validation failed before this attempt could push the proposal. Failed check files are listed when available; the local proposal is kept for retry.')
      : `${program === 'git' ? `Git ${gitOperation}` : 'GitHub CLI operation'} failed. Check the local installation, authentication and repository permissions. Unfinished clone work is retained.`;
    const error = new PortalError(message, { cause });
    if (program === 'pnpm' && args[0] !== 'install' && cause !== null && typeof cause === 'object') {
      const captured = cause as { stdout?: unknown; stderr?: unknown };
      const output = [captured.stdout, captured.stderr].filter((part): part is string => typeof part === 'string').join('\n');
      error.checks = [...new Set(Array.from(output.matchAll(/\b(scripts\/[a-z0-9-]{1,80}\.test\.(?:ts|mjs)):\d+/g), (match) => match[1]))].slice(0, 8);
    }
    error.step = program === 'pnpm' ? (args[0] === 'install' ? 'dependencies' : 'validation')
      : program === 'git' && gitOperation === 'push' ? 'push'
      : program === 'gh' ? (args[0] === 'pr' ? 'pr' : 'source') : 'preview';
    throw error;
  }
}
export type Command = typeof command;
export function portalGit(run: Command, path: string, args: string[]) {
  return run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false',
    '-c', 'credential.https://github.com.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential', ...args], path);
}
export function portalClonePath(override: string | undefined, home = homedir()): string {
  const path = override ?? join(home, '.cache', 'penjaga', 'data-portal');
  if (!isAbsolute(path)) throw new PortalError('PORTAL_CLONE must be an absolute path when set. Unset it to use ~/.cache/penjaga/data-portal.');
  return resolve(path);
}

export async function portalCheckout(path: string | undefined, run: Command = command) {
  if (!path) throw new PortalError('Set PORTAL_CLONE to a new, dedicated absolute directory for the portal clone.');
  if (!isAbsolute(path)) throw new PortalError('PORTAL_CLONE must be an absolute path.');
  path = resolve(path);
  let exists = true;
  try { await fs.lstat(path); } catch (cause) {
    if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
    exists = false;
  }
  if (!exists) {
    await fs.mkdir(resolve(path, '..'), { recursive: true });
    if (await fs.realpath(resolve(path, '..')) !== resolve(path, '..')) throw new PortalError('PORTAL_CLONE cannot use symlinked directories.');
    await portalGit(run, resolve(path, '..'), ['clone', '--single-branch', '--branch', 'main', '--no-tags', '--', PORTAL_REMOTE, path]);
    await fs.writeFile(join(path, '.git', 'penjaga-portal'), PORTAL_REMOTE, { flag: 'wx', mode: 0o600 });
  }
  if (await fs.realpath(path) !== path) throw new PortalError('PORTAL_CLONE cannot be a symlink.');
  const gitDirectory = join(path, '.git');
  const marker = join(gitDirectory, 'penjaga-portal');
  try {
    if (!(await fs.lstat(gitDirectory)).isDirectory() || await fs.realpath(gitDirectory) !== gitDirectory) throw new PortalError('Use a dedicated portal clone, not an external Git directory.');
    const stat = await fs.lstat(marker);
    if (!stat.isFile() || stat.nlink !== 1 || await fs.readFile(marker, 'utf8') !== PORTAL_REMOTE) throw new PortalError('Invalid portal clone marker.');
  } catch (cause) {
    throw new PortalError('Choose a new dedicated PORTAL_CLONE directory; existing unmarked checkouts are never adopted.', { cause });
  }
  const git = (args: string[]) => portalGit(run, path, args);
  if ((await git(['rev-parse', '--show-toplevel'])).trim() !== path) throw new PortalError('PORTAL_CLONE must be the dedicated repository root.');
  if ((await git(['remote', 'get-url', '--all', 'origin'])).trim() !== PORTAL_REMOTE || (await git(['remote', 'get-url', '--push', '--all', 'origin'])).trim() !== PORTAL_REMOTE) throw new PortalError('Portal clone has an unexpected fetch or push remote.');
  let recovery: string | null = null;
  if ((await git(['status', '--porcelain', '--untracked-files=all'])).trim()) {
    try {
      await git(['stash', 'push', '--include-untracked', '--message', 'Penjaga: unfinished portal attempt']);
      recovery = (await git(['rev-parse', 'refs/stash'])).trim();
      if (!/^[a-f0-9]{40}$/.test(recovery) || (await git(['status', '--porcelain', '--untracked-files=all'])).trim())
        throw new Error('Recovery did not leave a clean checkout');
    } catch (cause) {
      throw new PortalError('Could not preserve unfinished portal work in a local recovery stash. Work is retained; nothing was installed or pushed.', { cause });
    }
  }
  await git(['fetch', '--no-tags', '--no-prune', 'origin', 'refs/heads/main:refs/remotes/origin/main']);
  await git(['switch', 'main']);
  await git(['merge', '--ff-only', 'origin/main']);
  const base = (await git(['rev-parse', 'origin/main'])).trim();
  const tree = await git(['ls-tree', base, '--', 'datasets.json']);
  if (!/^100(?:644|755) blob [a-f0-9]+\tdatasets.json\n$/.test(tree)) throw new PortalError('Portal datasets.json must be a regular Git file.');
  return { path, base, recovery, catalogue: await git(['show', `${base}:datasets.json`]) };
}

export async function preparePortalDependencies(path: string, run: Command = command) {
  const modulesPath = join(path, 'node_modules');
  try {
    if (!(await fs.lstat(modulesPath)).isDirectory()) throw new PortalError('Portal node_modules must be a regular directory, not a link. No installation was attempted.');
  } catch (cause) {
    if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
  }
  try {
    await run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', '--ignore-pnpmfile'], path);
  } catch (cause) {
    const error = new PortalError('Portal dependency installation failed. Check pnpm 12.x and network access, then use Refresh preview to retry. No catalogue proposal was written.', { cause });
    error.step = 'dependencies';
    throw error;
  }
  if ((await portalGit(run, path, ['status', '--porcelain', '--untracked-files=all'])).trim())
    throw new PortalError('Portal dependency installation changed repository files. Work is retained for review; no catalogue proposal was written or pushed.');
  try {
    if (!(await fs.lstat(modulesPath)).isDirectory()) throw new Error('Missing dependency directory');
  } catch (cause) {
    throw new PortalError('Portal dependency installation did not produce a regular node_modules directory. Use Refresh preview to retry. No catalogue proposal was written.', { cause });
  }
}

const busy = new Set<string>();
export async function withPortal<T>(path: string, work: () => Promise<T>): Promise<T> {
  const key = resolve(path);
  if (busy.has(key)) throw new PortalError('Another portal operation is running. Try again when it finishes.');
  busy.add(key);
  try { return await work(); } finally { busy.delete(key); }
}
