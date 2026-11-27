import assert from 'node:assert/strict';
import { test } from 'node:test';
import { datasetGitStatus } from '../src/lib/dataset-git.ts';

test('describes saved-file changes separately from locally known unpushed commits', () => {
  assert.equal(datasetGitStatus({ status: 'ready', branch: 'main', changes: [], ahead: 0 }), 'No file changes');
  assert.equal(datasetGitStatus({ status: 'ready', branch: 'feat/metadata', changes: ['datapackage.json'], ahead: 1 }), '1 changed file; 1 unpushed commit');
  assert.equal(datasetGitStatus({ status: 'ready', branch: 'feat/metadata', changes: ['datapackage.json', 'README.md'], ahead: 2 }), '2 changed files; 2 unpushed commits');
});

test('does not imply remote verification or a clean Git state when tracking is unavailable', () => {
  assert.equal(datasetGitStatus({ status: 'ready', branch: 'feat/new', changes: [], ahead: null }), 'No file changes; no upstream');
  assert.equal(datasetGitStatus({ status: 'unavailable', message: 'Git unavailable.' }), 'Unavailable');
});
