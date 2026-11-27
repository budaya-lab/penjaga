import { json } from '@sveltejs/kit';
import { MetadataDraftError, readMetadataObject } from '../../../../lib/metadata-json.ts';
import { DatasetTextError } from '../../../../lib/server/dataset-text.ts';
import { commitDataset, DatasetGitError } from '../../../../lib/server/dataset-git.ts';
import { readSaveText } from '../../../../lib/server/metadata-save.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, url }) => {
  if (request.headers.get('origin') !== url.origin) return json({ status: 'error', message: 'Forbidden' }, { status: 403 });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return json({ status: 'error', message: 'Supply application/json.' }, { status: 415 });
  try {
    const input = readMetadataObject(await readSaveText(request));
    if (typeof input.text !== 'string' || typeof input.message !== 'string' || typeof input.branch !== 'string')
      return json({ status: 'error', message: 'Supply saved metadata and a commit message.' }, { status: 400 });
    return json(await commitDataset(process.env.DATASET_ROOT, params.name, { text: input.text, message: input.message, branch: input.branch }));
  } catch (cause) {
    if (cause instanceof DatasetGitError) return json({ status: 'error', message: cause.message }, { status: 409 });
    if (cause instanceof MetadataDraftError) return json({ status: 'error', message: cause.message }, { status: 400 });
    if (cause instanceof DatasetTextError && cause.status !== 500) return json({ status: 'error', message: cause.message }, { status: cause.status });
    console.error('Dataset commit/push failed. Inspect the dataset Git state before retrying.');
    return json({ status: 'error', message: 'Could not commit or push. Saved files and existing commits are retained.' }, { status: 500 });
  }
};
