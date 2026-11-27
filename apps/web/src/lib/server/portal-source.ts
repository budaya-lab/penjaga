import { isDeepStrictEqual } from 'node:util';
import { metadataObject, readMetadataObject } from '../metadata-json.ts';
import { command, type Command, portalGit, PortalError } from './portal-checkout.ts';
import type { PushedSource } from './portal-proposal.ts';
import type { PortalSourceDifference } from '../portal.ts';

export class PortalSourceMismatch extends PortalError {
  readonly source: PortalSourceDifference;
  constructor(source: PortalSourceDifference) {
    super('Saved metadata differs from the pushed branch. Use Commit & push in Metadata, then preview again.');
    this.source = source;
  }
}

export async function readPushedSource(directory: string, saved: string, run: Command = command): Promise<PushedSource> {
  const git = (args: string[]) => portalGit(run, directory, args);
  if ((await git(['rev-parse', '--show-toplevel'])).trim() !== directory) throw new PortalError('The dataset must be its own Git repository.');
  const remote = (await git(['config', '--get', 'remote.origin.url'])).trim();
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+\/ds-[A-Za-z0-9._-]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new PortalError('Use a credential-free GitHub origin remote for this dataset.');
  const repository = match[1];
  const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
  if (!branch || branch.length > 256) throw new PortalError('Check out the pushed source branch before submitting.');
  const api = async (endpoint: string) => {
    const value: unknown = JSON.parse(await run('gh', ['api', `repos/${repository}${endpoint}`, '--hostname', 'github.com', '--method', 'GET']));
    if (!metadataObject(value)) throw new PortalError('GitHub returned invalid source metadata.');
    return value;
  };
  const repo = await api('');
  if (typeof repo.full_name !== 'string' || repo.full_name.toLowerCase() !== repository.toLowerCase() || !Number.isSafeInteger(repo.id) || (repo.id as number) <= 0 || typeof repo.private !== 'boolean') throw new PortalError('Could not verify the source repository identity.');
  const ref = await api(`/git/ref/heads/${encodeURIComponent(branch)}`);
  if (ref.ref !== `refs/heads/${branch}` || !metadataObject(ref.object) || ref.object.type !== 'commit' || typeof ref.object.sha !== 'string' || !/^[a-f0-9]{40}$/.test(ref.object.sha)) throw new PortalError('Could not verify the pushed branch. Commit and push the metadata manually.');
  const sha = ref.object.sha;
  const commit = await api(`/git/commits/${sha}`);
  if (commit.sha !== sha || !metadataObject(commit.tree) || typeof commit.tree.sha !== 'string' || !/^[a-f0-9]{40}$/.test(commit.tree.sha)) throw new PortalError('Could not verify the metadata commit.');
  const tree = await api(`/git/trees/${commit.tree.sha}`);
  const descriptor = Array.isArray(tree.tree) ? tree.tree.find((entry: unknown) => metadataObject(entry) && entry.path === 'datapackage.json') as Record<string, unknown> | undefined : undefined;
  if (tree.truncated !== false || descriptor?.type !== 'blob' || !['100644', '100755'].includes(String(descriptor.mode))) throw new PortalError('Pushed datapackage.json must be a verified regular Git file.');
  const file = await api(`/contents/datapackage.json?ref=${sha}`);
  if (file.encoding !== 'base64' || typeof file.content !== 'string' || file.content.length > 8_000_000) throw new PortalError('Could not read bounded pushed metadata.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(file.content, 'base64'));
  const metadata = readMetadataObject(text);
  const savedMetadata = readMetadataObject(saved);
  if (!isDeepStrictEqual(savedMetadata, metadata)) throw new PortalSourceMismatch({ repository: repo.full_name, branch, sha, saved: savedMetadata, pushed: metadata });
  return { repository: repo.full_name, id: repo.id as number, private: repo.private, sha, branch, metadata };
}
