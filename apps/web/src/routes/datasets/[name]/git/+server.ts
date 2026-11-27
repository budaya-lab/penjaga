import { json } from '@sveltejs/kit';
import { datasetBranch } from '../../../../lib/server/dataset-git.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => json(await datasetBranch(process.env.DATASET_ROOT, params.name), {
  headers: { 'cache-control': 'no-store' },
});
