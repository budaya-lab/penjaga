import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { PortalPreview, PortalResult } from '../portal.ts';
import { readDatasetSnapshot } from './dataset-text.ts';
import { command, type Command, portalCheckout, portalClonePath, portalGit, PortalError, PORTAL_REPOSITORY, preparePortalDependencies, withPortal } from './portal-checkout.ts';
import { catalogueProposal, type PushedSource } from './portal-proposal.ts';
import { readPushedSource, PortalSourceMismatch } from './portal-source.ts';

type Operation = { action: 'preview' } | { action: 'submit'; revision: string; confirmed: true };
type Dependencies = { run?: Command; readSource?: typeof readPushedSource };

export async function portalOperation(root: string | undefined, name: string, clone: string | undefined, input: Operation, dependencies: Dependencies = {}): Promise<PortalResult> {
  if (input.action !== 'preview' && (input.action !== 'submit' || input.confirmed !== true || !/^[a-f0-9]{64}$/.test(input.revision))) throw new PortalError('Confirm a valid portal preview before submission.');
  const clonePath = portalClonePath(clone);
  const run = dependencies.run ?? command;
  const readSource = dependencies.readSource ?? readPushedSource;
  return withPortal(clonePath, async () => {
    const saved = await readDatasetSnapshot(root, name, 'datapackage.json');
    const datasetRoot = resolve(saved.directory, '..');
    const nested = relative(datasetRoot, clonePath);
    const enclosing = relative(clonePath, datasetRoot);
    const inside = (path: string) => path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
    if (inside(nested) || inside(enclosing)) throw new PortalError('Keep PORTAL_CLONE outside DATASET_ROOT and its parent directories.');
    let source: PushedSource;
    try { source = await readSource(saved.directory, saved.text, run); }
    catch (cause) {
      if (cause instanceof PortalSourceMismatch) return { status: 'needs-push', source: cause.source };
      if (cause instanceof PortalError) cause.step = 'source';
      throw cause;
    }
    const checkout = await portalCheckout(clonePath, run);
    const plan = catalogueProposal(checkout.catalogue, source);
    const revision = createHash('sha256').update(checkout.base).update(source.sha).update(String(source.id)).update(plan.text).digest('hex');
    const preview: PortalPreview = { revision, action: plan.action, changed: plan.changed, repository: source.repository, branch: source.branch, sha: source.sha,
      before: plan.before, after: plan.after, warnings: [
        ...(checkout.recovery ? [`Unfinished portal work was saved locally in recovery stash ${checkout.recovery}. It was not submitted or deleted; this preview uses current portal main.`] : []),
        ...plan.warnings,
      ] };
    if (input.action === 'submit' && input.revision !== revision) throw new PortalError('Portal main or pushed metadata changed. Preview again before submitting.');
    if (input.action === 'submit' && !plan.changed) return { status: 'unchanged', message: 'The portal already contains this metadata. No files were changed and no PR was created.' };
    await preparePortalDependencies(checkout.path, run);
    if (input.action === 'preview') return { status: 'preview', preview };
    const git = (args: string[]) => portalGit(run, checkout.path, args);
    const prs: unknown = JSON.parse(await run('gh', ['pr', 'list', '--repo', PORTAL_REPOSITORY, '--head', plan.branch, '--base', 'main', '--state', 'open', '--json', 'number,url']));
    if (!Array.isArray(prs) || prs.length > 1) throw new PortalError('Could not identify a unique portal proposal. Review open PRs manually.');
    const existing = prs[0] as { number?: unknown; url?: unknown } | undefined;
    if (prs.length && (!existing || !Number.isSafeInteger(existing.number) || (existing.number as number) <= 0 || !validPrUrl(existing.url))) throw new PortalError('GitHub returned an invalid portal PR.');
    const branchExists = (await git(['branch', '--list', plan.branch, '--format=%(refname:short)'])).trim();
    if (branchExists) await git(['switch', plan.branch]);
    else if (existing) {
      await git(['fetch', '--no-tags', '--no-prune', 'origin', `refs/heads/${plan.branch}:refs/remotes/origin/${plan.branch}`]);
      await git(['switch', '-c', plan.branch, `refs/remotes/origin/${plan.branch}`]);
    } else await git(['switch', '-c', plan.branch, checkout.base]);
    await git(['merge', '--no-edit', 'origin/main']);
    const proposalPaths = (await git(['diff', '--name-only', checkout.base, 'HEAD'])).trim().split('\n').filter(Boolean);
    if (proposalPaths.some((path) => path !== 'datasets.json')) throw new PortalError('The existing proposal contains unexpected files. Review it manually before validation or publication.');
    const target = await fs.open(join(checkout.path, 'datasets.json'), constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await target.stat();
      if (!stat.isFile() || stat.nlink !== 1) throw new PortalError('Catalogue target must be a regular single-link file.');
      await target.writeFile(plan.text, 'utf8');
      await target.truncate(Buffer.byteLength(plan.text));
      await target.sync();
    } finally { await target.close(); }
    await run('pnpm', ['validate'], checkout.path);
    const changed = (await git(['status', '--porcelain', '--untracked-files=all'])).trim();
    if (changed && changed !== 'M datasets.json') throw new PortalError('Validation left unexpected files. Review unfinished clone work manually; nothing was pushed.');
    const current = await readDatasetSnapshot(root, name, 'datapackage.json');
    const pushed = await readSource(current.directory, current.text, run);
    await git(['fetch', '--no-tags', '--no-prune', 'origin', 'refs/heads/main:refs/remotes/origin/main']);
    if (pushed.sha !== source.sha || pushed.id !== source.id || pushed.private !== source.private || pushed.repository !== source.repository || (await git(['rev-parse', 'origin/main'])).trim() !== checkout.base) throw new PortalError('Source or portal main changed during validation. Proposal work is retained in PORTAL_CLONE; review it and preview again. Nothing was pushed.');
    if (changed) {
      await git(['add', '--', 'datasets.json']);
      if ((await git(['diff', '--cached', '--name-only'])).trim() !== 'datasets.json') throw new PortalError('Unexpected staged files; nothing was pushed.');
      await git(['commit', '-m', `chore(catalogue): submit ${source.repository.split('/')[1]}`]);
    }
    await git(['push', '--set-upstream', 'origin', `HEAD:refs/heads/${plan.branch}`]);
    const body = `## Dataset metadata\n\nSource: https://github.com/${source.repository}\nMetadata commit: ${source.sha}\n\nSubmitted explicitly through Penjaga. Review the catalogue diff, access labels and restricted resource listings. Resource listings match the dataset, with existing public bucket summaries retained as an explicit exception; other portal-only listings are removed. No resource files are copied or deleted, and no restricted data bytes are included. Identity, publication and confirmed lineage are preserved; new records stay drafts.\n`;
    let url: string;
    if (existing) {
      await run('gh', ['pr', 'edit', String(existing.number), '--repo', PORTAL_REPOSITORY, '--body', body]);
      url = existing.url as string;
    } else {
      url = (await run('gh', ['pr', 'create', '--repo', PORTAL_REPOSITORY, '--base', 'main', '--head', plan.branch,
        '--title', `chore(catalogue): submit ${source.repository.split('/')[1]}`, '--body', body])).trim();
      if (!validPrUrl(url)) throw new PortalError('Proposal was pushed, but GitHub did not return a valid PR link. Inspect the portal PR list before retrying.');
    }
    return { status: 'submitted', url, message: 'Portal PR prepared. Publication still requires review and merge.' };
  });
}
function validPrUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/github\.com\/budaya-lab\/data-portal\/pull\/[1-9]\d*$/.test(value);
}
