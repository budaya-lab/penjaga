import { isDeepStrictEqual } from 'node:util';
import { validateMetadata } from '@penjaga/validator';
import policy from '@penjaga/validator/policy' with { type: 'json' };
import type { DatasetBranch, DatasetCommitResult } from '../dataset-git.ts';
import { readMetadataObject } from '../metadata-json.ts';
import { readDatasetSnapshot, DatasetTextError } from './dataset-text.ts';
import { command, type Command, portalGit, PortalError } from './portal-checkout.ts';
import { generatedComment, legacyGeneratedComment } from './readme-generation.ts';

export class DatasetGitError extends Error {}
const busy = new Set<string>();
const shaPattern = /^[a-f0-9]{40}$/;

async function branchAt(directory: string, run: Command): Promise<string> {
  const git = (args: string[]) => portalGit(run, directory, args);
  if ((await git(['rev-parse', '--show-toplevel'])).trim() !== directory)
    throw new DatasetGitError('The dataset must be its own Git repository.');
  const branch = (await git(['branch', '--show-current'])).trim();
  if (!branch) throw new DatasetGitError('Check out a feature branch before committing; detached HEAD is not supported.');
  return branch;
}

export async function datasetBranch(root: string | undefined, name: string, run: Command = command): Promise<DatasetBranch> {
  try {
    const snapshot = await readDatasetSnapshot(root, name, 'datapackage.json');
    const branch = await branchAt(snapshot.directory, run);
    const git = (args: string[]) => portalGit(run, snapshot.directory, args);
    const paths = await metadataPaths(root, name);
    await checkFilters(paths, git);
    const dirty = (await git(['--no-optional-locks', 'status', '--porcelain', '-z', '--no-renames', '--untracked-files=all', '--', ...paths])).split('\0').filter(Boolean).map((line) => line.slice(3));
    const upstream = (await git(['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`])).trim();
    const ahead = upstream ? Number((await git(['rev-list', '--count', `${upstream}..HEAD`])).trim()) : null;
    if (ahead !== null && (!Number.isSafeInteger(ahead) || ahead < 0)) throw new DatasetGitError('Could not read the number of unpushed commits.');
    return { status: 'ready', branch, changes: paths.filter((path) => dirty.includes(path)), ahead };
  } catch (cause) {
    console.error('Dataset branch inspection unavailable.', cause instanceof DatasetGitError ? cause.message : 'Git repository unavailable.');
    return { status: 'unavailable', message: cause instanceof DatasetGitError ? cause.message : 'Git branch unavailable for this dataset.' };
  }
}

async function metadataPaths(root: string | undefined, name: string) {
  const paths = ['datapackage.json'];
  try {
    const readme = await readDatasetSnapshot(root, name, 'README.md');
    if (readme.text.startsWith(generatedComment) || readme.text.startsWith(legacyGeneratedComment)) paths.push('README.md');
  } catch (cause) {
    if (!(cause instanceof DatasetTextError) || cause.status !== 404) throw cause;
  }
  return paths;
}

async function checkFilters(paths: string[], git: (args: string[]) => Promise<string>) {
  const attributes = (await git(['check-attr', '-z', 'filter', '--', ...paths])).split('\0');
  for (let index = 2; index < attributes.length; index += 3) {
    if (!['unspecified', 'unset'].includes(attributes[index])) throw new DatasetGitError('Metadata Git filters are not supported; no dataset filter scripts were run.');
  }
}

function repository(remote: string): string {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+\/ds-[A-Za-z0-9._-]+?)(?:\.git)?$/.exec(remote.trim());
  if (!match) throw new DatasetGitError('Use credential-free origin fetch/push URLs for the same dataset GitHub repository.');
  return match[1].toLowerCase();
}

export async function commitDataset(root: string | undefined, name: string, input: { text: string; message: string; branch: string }, run: Command = command): Promise<DatasetCommitResult> {
  if (typeof input.message !== 'string') throw new DatasetGitError('Supply a commit message.');
  const message = input.message.replace(/\r\n?/g, '\n').trim();
  if (!message || message.length > 200 || Array.from(message).some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10) || code === 127;
  })) throw new DatasetGitError('Commit message must be nonblank, at most 200 characters, and contain no unsafe control characters.');
  const data = readMetadataObject(input.text);
  if (validateMetadata(data, policy).length) throw new DatasetGitError('Resolve metadata checks before committing and pushing.');
  const saved = await readDatasetSnapshot(root, name, 'datapackage.json');
  if (!isDeepStrictEqual(data, readMetadataObject(saved.text))) throw new DatasetGitError('Save your metadata changes first, then commit and push.');
  if (busy.has(saved.directory)) throw new DatasetGitError('A commit or push is already running for this dataset.');
  busy.add(saved.directory);
  const git = (args: string[]) => portalGit(run, saved.directory, args);
  let commit: string | undefined;
  try {
    const branch = await branchAt(saved.directory, run);
    if (['main', 'master'].includes(branch)) throw new DatasetGitError('Use a feature branch; Steward does not push main or master.');
    if (input.branch !== branch) throw new DatasetGitError('The dataset branch changed. Reload Metadata before committing or pushing.');
    const fetchRemote = repository(await git(['remote', 'get-url', '--all', 'origin']));
    if (repository(await git(['remote', 'get-url', '--push', '--all', 'origin'])) !== fetchRemote)
      throw new DatasetGitError('Origin fetch and push must name the same dataset GitHub repository.');
    const refs = (await git(['ls-remote', '--symref', 'origin', 'HEAD', `refs/heads/${branch}`])).trim().split('\n');
    if (refs.includes(`ref: refs/heads/${branch}\tHEAD`)) throw new DatasetGitError('Use a feature branch; Steward does not push the default branch.');
    const remoteBranch = refs.find((line) => line.endsWith(`\trefs/heads/${branch}`));
    const base = (remoteBranch ?? refs.find((line) => /^[a-f0-9]{40}\tHEAD$/.test(line)))?.split('\t')[0];
    if (!base || !shaPattern.test(base)) throw new DatasetGitError('Could not verify the remote branch or its default branch. Nothing was committed.');
    try { await git(['cat-file', '-e', `${base}^{commit}`]); }
    catch (cause) { throw new DatasetGitError('The remote branch has commits missing locally. Reconcile it in Git before retrying; Steward never fetches source history or merges automatically.', { cause }); }
    if ((await git(['rev-list', '--max-count=1', `HEAD..${base}`])).trim())
      throw new DatasetGitError('The remote branch has newer commits. Reconcile it in Git before retrying; nothing was committed or force-pushed.');
    const ahead = (await git(['rev-list', '--max-count=101', `${base}..HEAD`])).trim().split('\n').filter(Boolean);
    if (ahead.length > 100) throw new DatasetGitError('Too many unpushed commits for a metadata-only push. Review them in Git.');
    for (const revision of ahead) {
      const paths = (await git(['diff-tree', '--root', '--no-commit-id', '--name-only', '--no-ext-diff', '--no-textconv', '--no-renames', '-r', '-m', '-z', revision, '--'])).split('\0').filter(Boolean);
      if (paths.some((path) => !['datapackage.json', 'README.md'].includes(path)))
        throw new DatasetGitError('Unrelated changes exist in unpushed commits. Review/push those commits in Git separately; Steward pushes metadata and generated README only.');
    }
    const paths = await metadataPaths(root, name);
    await checkFilters(paths, git);
    const changed = (await git(['--no-optional-locks', 'status', '--porcelain', '--no-renames', '--untracked-files=all', '--', ...paths])).trim();
    if (changed) {
      await git(['add', '--', ...paths]);
      await git(['commit', '--only', '--message', message, '--', ...paths]);
    }
    commit = (await git(['rev-parse', 'HEAD'])).trim();
    if (!shaPattern.test(commit)) throw new DatasetGitError('Could not identify the metadata commit. Check Git before retrying.');
    if (!changed && !ahead.length) return { status: 'unchanged', branch, commit, message: 'No saved metadata changes to commit or push.' };
    await git(['push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`]);
    return { status: 'pushed', branch, commit, message: `Committed metadata and pushed ${branch}. Portal submission is a separate action.` };
  } catch (cause) {
    if (cause instanceof DatasetGitError) throw cause;
    if (commit) throw new DatasetGitError(`Metadata is committed locally (${commit.slice(0, 8)}), but push failed. Check GitHub access, then retry Commit & push; it will reuse the commit.`, { cause });
    const detail = cause instanceof PortalError ? cause.message.split('.')[0] : 'Git operation failed';
    throw new DatasetGitError(`Could not commit dataset metadata (${detail}). Check the Git identity and GitHub access. Saved files and unrelated changes are retained.`, { cause });
  } finally { busy.delete(saved.directory); }
}
