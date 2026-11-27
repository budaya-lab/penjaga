import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { command, PORTAL_REMOTE } from '../../src/lib/server/portal-checkout.ts';

export const metadata = {
  name: 'ds-example', title: 'Example title', description: 'Supplied description',
  keywords: ['task:classification', 'project:example', 'stage:curated'],
  resources: [{ name: 'input', title: 'Input', path: 'input.csv', format: 'csv', count: 0 }],
};
export const source = { repository: 'example/ds-example', id: 42, private: true, sha: 'a'.repeat(40), branch: 'main', metadata };

export async function portalFixture(t: TestContext) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'steward-portal-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const upstream = join(root, 'upstream');
  const clone = join(root, 'clone');
  await fs.mkdir(upstream);
  const git = (args: string[], cwd = upstream) => command('git', args, cwd);
  await git(['init', '-b', 'main']);
  await git(['config', 'user.email', 'fixture@example.invalid']);
  await git(['config', 'user.name', 'Fixture']);
  await fs.writeFile(join(upstream, 'datasets.json'), '[]\n');
  await git(['add', 'datasets.json']);
  await git(['commit', '-m', 'Initial catalogue']);
  const calls: { program: string; args: string[] }[] = [];
  const run: typeof command = async (program, args, cwd) => {
    calls.push({ program, args });
    if (program === 'git' && args.includes('clone')) {
      const result = await command(program, args.map((arg) => arg === PORTAL_REMOTE ? upstream : arg), cwd);
      await git(['remote', 'set-url', 'origin', PORTAL_REMOTE], clone);
      await git(['config', 'user.email', 'fixture@example.invalid'], clone);
      await git(['config', 'user.name', 'Fixture'], clone);
      await fs.mkdir(join(clone, 'node_modules'));
      return result;
    }
    if (program === 'git' && (args.includes('fetch') || args.includes('push'))) {
      return command(program, args.map((arg) => arg === 'origin' ? upstream : arg), cwd);
    }
    return command(program, args, cwd);
  };
  return { root, clone, upstream, run, calls, git };
}
