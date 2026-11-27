import { isDeepStrictEqual } from 'node:util';
import { validateMetadata } from '@penjaga/validator';
import policy from '@penjaga/validator/policy' with { type: 'json' };
import { metadataObject } from '../metadata-json.ts';
import { preservePortalFieldOrder } from '../portal-diff.ts';
import { PortalError } from './portal-checkout.ts';

export type PushedSource = { repository: string; id: number; private: boolean; sha: string; branch: string; metadata: Record<string, unknown> };
type Entry = Record<string, unknown>;
type Resource = { name: string; path: string; format: string; title?: string; count?: number; access?: 'restricted' | 'public' };
const sensitive = /\b(?:token|password|secret|api[_ -]?key)\b|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}/i;
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || sensitive.test(value) || /https?:\/\/|git@|(?:^|\s)(?:\/|[A-Z]:\\)/i.test(value))
    throw new PortalError('Source metadata needs public-safe text. Review it in Metadata before submitting.');
  return value;
}
function landing(value: unknown) {
  if (typeof value !== 'string') return '';
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/?$/i.exec(value);
  return match?.[1].toLowerCase() ?? '';
}
function resources(value: unknown): Resource[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => metadataObject(item) && typeof item.name === 'string' && typeof item.path === 'string' && typeof item.format === 'string'))
    throw new PortalError('Existing catalogue resources need manual review.');
  return value as Resource[];
}

export function catalogueProposal(catalogue: string, source: PushedSource) {
  if (Buffer.byteLength(catalogue) > 10_000_000) throw new PortalError('Portal catalogue exceeds the 10 MB limit.');
  const parsed: unknown = JSON.parse(catalogue);
  if (!Array.isArray(parsed) || !parsed.every(metadataObject)) throw new PortalError('Portal datasets.json must be an array of records.');
  const entries: Entry[] = parsed;
  const data = source.metadata;
  if (validateMetadata(data, policy).length) throw new PortalError('Metadata does not pass shared checks. Resolve the issues in Metadata before submitting.');
  const slug = text(data.name, 80);
  const matches = entries.filter((entry) => entry.slug === slug);
  if (matches.length > 1) throw new PortalError(`Multiple portal records use dataset slug "${slug}". Keep one record with this slug before retrying. Sources are provenance links, not matching keys.`);
  const before = matches[0] ?? null;
  const [account] = source.repository.split('/');
  const access = source.private ? 'restricted' : 'public';
  const oldResources = resources(before?.resources);
  const listed = (data.resources as Record<string, unknown>[]).map((resource): Resource => {
    const name = text(resource.name, 160);
    const title = text(resource.title, 160);
    const path = resource.path;
    if (typeof path !== 'string' || !path || path.startsWith('/') || /[\\?#%]/.test(path) || Array.from(path).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || path.startsWith('~') || path.replace(/\/$/, '').split('/').some((part) => !part || part.startsWith('.')) || sensitive.test(path) || path.includes(':'))
      throw new PortalError('Resource paths need public-safe relative metadata references.');
    const format = resource.format === undefined || resource.format === 'dir' ? 'directory' : resource.format;
    if (typeof format !== 'string' || !['csv', 'tsv', 'json', 'geojson', 'parquet', 'pmtiles', 'geoparquet', 'xml', 'yaml', 'ipynb', 'directory'].includes(format)) throw new PortalError('A resource format cannot be represented by the existing portal.');
    if (resource.count !== undefined && (!Number.isSafeInteger(resource.count) || (resource.count as number) < 0)) throw new PortalError('Resource counts must be supplied non-negative safe integers.');
    const count = resource.count === undefined ? {} : { count: resource.count as number };
    if (format !== 'directory' && path.endsWith('/')) throw new PortalError('Only directory resources may use paths ending in a slash.');
    if (source.private) return { name, title, path: format === 'directory' && !path.endsWith('/') ? path + '/' : path, format, access: 'restricted', ...count };
    // Keep reviewed release links. New download mappings require a separate release review.
    const old = oldResources.find((item) => item.name === name && item.format === format && item.access !== 'restricted');
    const prefix = `https://github.com/${source.repository}/releases/download/`;
    if (!old?.path.startsWith(prefix) || !old.path.endsWith(`/${path.split('/').map(encodeURIComponent).join('/')}`))
      throw new PortalError('New or changed public downloads need a reviewed release mapping. No download URL was inferred.');
    return { name, title, path: old.path, format, access: 'public', ...count };
  });
  if (new Set(listed.map((item) => item.name)).size !== listed.length) throw new PortalError('Resource identities are ambiguous.');
  const summaries = oldResources.filter((resource) => resource.name === 'buckets' && resource.access !== 'restricted'
    && !listed.some((item) => item.name === resource.name));
  if (summaries.length > 1) throw new PortalError('Multiple public bucket summaries need manual catalogue review.');
  // Keep the portal-only summary in its existing slot, not at the end of the dataset list.
  for (const summary of summaries) listed.splice(oldResources.indexOf(summary), 0, summary);
  const licenses = data.licenses === undefined ? undefined : (data.licenses as Record<string, unknown>[]).map((license) => {
    const name = text(license.name, 80);
    let path: string | undefined;
    if (license.path !== undefined) {
      const url = new URL(String(license.path));
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['creativecommons.org', 'spdx.org', 'opendatacommons.org'].includes(url.hostname)) throw new PortalError('License URL needs disclosure review.');
      path = url.href;
    }
    return { name, ...(license.title === undefined ? {} : { title: text(license.title, 160) }), ...(path ? { path } : {}) };
  });
  const sources = ((data.sources as Record<string, unknown>[] | undefined) ?? []).map((item) => {
    const title = text(item.title, 160);
    const message = 'Source links need credential-free HTTPS URLs without query strings or fragments. Review Sources in Metadata.';
    if (typeof item.path !== 'string' || item.path.length > 2048 || sensitive.test(item.path)) throw new PortalError(message);
    let url: URL;
    try { url = new URL(item.path); } catch (cause) { throw new PortalError(message, { cause }); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new PortalError(message);
    return { title, path: url.href };
  }).filter((item) => landing(item.path) !== source.repository.toLowerCase());
  if (data.recordCount !== undefined && (!Number.isSafeInteger(data.recordCount) || (data.recordCount as number) < 0)) throw new PortalError('Dataset recordCount must be a supplied non-negative safe integer.');
  const after: Entry = { ...(before ?? { namespace: account.toLowerCase(), slug, draft: true }),
    name: text(data.title, 160), description: text(data.description, 500),
    keywords: (data.keywords as unknown[]).map((keyword) => text(keyword, 80)), access,
    sources: [
      ...sources,
      { title: source.private ? 'GitHub repository (sign in for access)' : 'GitHub repository', path: `https://github.com/${source.repository}`, access },
    ], resources: listed,
  };
  if (licenses === undefined) delete after.licenses; else after.licenses = licenses;
  if (data.version === undefined) delete after.version; else after.version = data.version;
  if (data.recordCount === undefined) delete after.recordCount; else after.recordCount = data.recordCount;
  if (!before && data.created !== undefined) {
    if (data.created === '2000-01-01T00:00:00Z') throw new PortalError('Replace the template example date before submission.');
    after.created = data.created;
  }
  delete after.file;
  delete after.format;
  const ordered = preservePortalFieldOrder(before, after);
  if (before) entries[entries.indexOf(before)] = ordered; else entries.push(ordered);
  const changed = !isDeepStrictEqual(before, ordered);
  return { action: before ? 'update' as const : 'add' as const, before, after: ordered, changed,
    text: changed ? JSON.stringify(entries, null, 2) + '\n' : catalogue, branch: `chore/portal-${source.id}`,
    warnings: ['Resources follow the dataset list and order; any retained public bucket summary keeps its existing catalogue slot. Bucket summary files are retained, not refreshed. Other portal-only resource entries are removed; no resource files are copied or deleted. Public downloads require a reviewed release mapping.',
      ...(before && (before.access !== access || !isDeepStrictEqual(before.resources, after.resources)) ? ['Access or resource listings change. Review their public disclosure.'] : [])],
  };
}
