import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogueProposal } from '../src/lib/server/portal-proposal.ts';

import { metadata, source } from './fixtures/portal.ts';

test('adds a draft metadata-only record without inventing totals, dates or parents', () => {
  const plan = catalogueProposal('[]\n', source);
  assert.equal(plan.action, 'add');
  assert.equal(plan.after.draft, true);
  assert.deepEqual(plan.after.resources, [{ name: 'input', title: 'Input', path: 'input.csv', format: 'csv', access: 'restricted', count: 0 }]);
  for (const key of ['created', 'modified', 'recordCount', 'derivedFrom', 'file']) assert.equal(plan.after[key], undefined);
  assert.equal(plan.before, null);
  assert.equal(plan.branch, 'chore/portal-42');
});

test('updates source fields and resources, preserving identity, publication, lineage and dates', () => {
  const bucket = { name: 'buckets', path: 'reviewed.csv', format: 'csv' };
  const old = { namespace: 'publisher', slug: 'ds-example', name: 'Old', category: 'Keep', draft: false,
    created: '2020-01-02', modified: '2021-01-02', derivedFrom: [{ namespace: 'publisher', slug: 'parent' }],
    sources: [{ path: 'https://github.com/Example/ds-example', title: 'Original', access: 'restricted' }],
    access: 'restricted', resources: [bucket] };
  const plan = catalogueProposal(JSON.stringify([old]), source);
  assert.equal(plan.action, 'update');
  for (const key of ['namespace', 'slug', 'draft', 'category', 'created', 'modified', 'derivedFrom'] as const) assert.deepEqual(plan.after[key], old[key]);
  assert.equal(plan.after.name, metadata.title);
  assert.deepEqual(plan.after.resources, [...metadata.resources.map((resource) => ({ ...resource, access: 'restricted' })), bucket]);
  assert.equal(catalogueProposal(plan.text, source).changed, false);
});

test('fails closed on ambiguous identities, unsafe disclosure and unsupported resource mappings', () => {
  const entry = catalogueProposal('[]', source).after;
  assert.throws(() => catalogueProposal(JSON.stringify([entry, { ...entry, namespace: 'other' }]), source), /Multiple portal records use dataset slug "ds-example"/);
  for (const path of ['/private/path', '../escape', 'https://private.invalid/input.csv', 'password.txt']) {
    assert.throws(() => catalogueProposal('[]', { ...source, metadata: { ...metadata, resources: [{ ...metadata.resources[0], path }] } }));
  }
  assert.throws(() => catalogueProposal('[]', { ...source, metadata: { ...metadata, resources: [{ ...metadata.resources[0], format: 'exe' }] } }), /format/);
  assert.throws(() => catalogueProposal('[]', { ...source, metadata: { ...metadata, title: 'https://private.invalid' } }), /public-safe/);
  assert.throws(() => catalogueProposal('[]', { ...source, private: false }), /release mapping/);
});

test('matches the metadata name to slug, not repository names or provenance sources', () => {
  const entry = catalogueProposal('[]', source).after;
  const parent = { ...entry, slug: 'ds-parent', name: 'Parent' };
  const child = { ...entry, slug: 'ds-child', name: 'Child' };
  const renamedSource = { ...source, repository: 'example/different-repository-name' };
  const plan = catalogueProposal(JSON.stringify([parent, entry, child]), renamedSource);
  assert.equal(plan.action, 'update');
  assert.deepEqual(plan.before, entry);
  const records = JSON.parse(plan.text);
  assert.deepEqual(records[0], parent);
  assert.deepEqual(records[2], child);
  assert.equal(plan.after.slug, metadata.name);
});

test('adds by metadata name when only provenance URLs match', () => {
  const entry = { ...catalogueProposal('[]', source).after, slug: 'ds-parent' };
  const plan = catalogueProposal(JSON.stringify([entry]), source);
  assert.equal(plan.action, 'add');
  assert.equal(plan.after.slug, metadata.name);
  assert.deepEqual(JSON.parse(plan.text)[0], entry);
  assert.equal(catalogueProposal('[]', { ...source, repository: 'example/unrelated-name' }).after.slug, metadata.name);
});

test('replaces source-owned metadata and removes omitted values without retaining stale provenance or totals', () => {
  const entry = { ...catalogueProposal('[]', source).after, version: '0.1.0', recordCount: 900,
    licenses: [{ name: 'Old' }], sources: [{ title: 'Stale source', path: 'https://example.org/stale' }],
    created: '2020-01-02', modified: '2021-01-02', migratedAt: '2022-01-02', draft: false,
    derivedFrom: [{ namespace: 'publisher', slug: 'parent' }] };
  const updated = { ...source, metadata: { ...metadata, version: '2.0.0', recordCount: 7,
    sources: [{ title: 'Current source', path: 'https://example.org/current' }], licenses: [{ name: 'CC-BY-4.0' }] } };
  const after = catalogueProposal(JSON.stringify([entry]), updated).after;
  assert.equal(after.version, '2.0.0');
  assert.equal(after.recordCount, 7);
  assert.deepEqual(after.licenses, updated.metadata.licenses);
  assert.deepEqual(after.sources, [...updated.metadata.sources, { title: 'GitHub repository (sign in for access)', path: 'https://github.com/example/ds-example', access: 'restricted' }]);
  const omitted = catalogueProposal(JSON.stringify([entry]), source).after;
  for (const key of ['version', 'recordCount', 'licenses']) assert.equal(omitted[key], undefined);
  assert.equal((omitted.sources as unknown[]).length, 1);
  for (const key of ['created', 'modified', 'migratedAt', 'draft', 'derivedFrom'] as const) assert.deepEqual(omitted[key], entry[key]);
});

test('refuses unsafe source links instead of exposing them in a proposal', () => {
  for (const path of ['https://user:password@example.org/', 'https://example.org/?token=private', '/private/data', 'http://example.org/']) {
    assert.throws(() => catalogueProposal('[]', { ...source, metadata: { ...metadata, sources: [{ title: 'Source', path }] } }), /source.*HTTPS/i);
  }
});

test('resource membership and order come only from the dataset, including an explicitly listed buckets resource', () => {
  const old = { ...catalogueProposal('[]', source).after, resources: [
    { name: 'buckets', path: 'portal-summary.csv', format: 'csv' },
    { name: 'stale', path: 'stale.csv', format: 'csv', count: 999 },
  ] };
  const currentResources = [
    { name: 'second', title: 'Second', path: 'second.csv', format: 'csv', count: 0 },
    { name: 'buckets', title: 'Dataset buckets', path: 'buckets.csv', format: 'csv' },
    { name: 'first', title: 'First', path: 'first.csv', format: 'csv' },
  ];
  const plan = catalogueProposal(JSON.stringify([old]), { ...source, metadata: { ...metadata, resources: currentResources } });
  assert.deepEqual(plan.after.resources, currentResources.map((resource) => ({ ...resource, access: 'restricted' })));
});

test('public resources replace stale metadata but retain the explicit public bucket exception', () => {
  const path = 'https://github.com/example/ds-example/releases/download/v1.0.0/input.csv';
  const old = { ...catalogueProposal('[]', source).after, resources: [
    { name: 'input', title: 'Outdated title', path, format: 'csv', count: 999, description: 'Stale' },
    { name: 'buckets', path: 'portal-summary.csv', format: 'csv' },
  ] };
  const resources = [{ name: 'input', title: 'Current title', path: 'input.csv', format: 'csv' }];
  const plan = catalogueProposal(JSON.stringify([old]), { ...source, private: false, metadata: { ...metadata, resources } });
  assert.deepEqual(plan.after.resources, [
    { name: 'input', title: 'Current title', path, format: 'csv', access: 'public' },
    old.resources[1],
  ]);
});

test('only public bucket summaries are retained as extras, never stale ordinary or restricted resources', () => {
  const entry = catalogueProposal('[]', source).after;
  const old = { ...entry, resources: [
    { name: 'stale', path: 'stale.csv', format: 'csv' },
    { name: 'buckets', path: 'private.csv', format: 'csv', access: 'restricted' },
  ] };
  assert.deepEqual(catalogueProposal(JSON.stringify([old]), source).after.resources, entry.resources);
});

test('maps directories and omitted counts without reading data; never changes reviewed public download URLs', () => {
  const directory = catalogueProposal('[]', { ...source, metadata: { ...metadata, resources: [{ name: 'images', title: 'Images', path: 'images' }] } });
  assert.deepEqual(directory.after.resources, [{ name: 'images', title: 'Images', path: 'images/', format: 'directory', access: 'restricted' }]);
  const reviewed = { ...catalogueProposal('[]', source).after, access: 'public', sources: [{ path: 'https://github.com/example/ds-example' }],
    resources: [{ name: 'input', path: 'https://github.com/example/ds-example/releases/download/v1.0.0/input.csv', format: 'csv' }] };
  const plan = catalogueProposal(JSON.stringify([reviewed]), { ...source, private: false });
  assert.equal((plan.after.resources as { path: string }[])[0].path, reviewed.resources[0].path);
  assert.equal((plan.after.resources as { count: number }[])[0].count, 0);
});
