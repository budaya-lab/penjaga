import { json } from '@sveltejs/kit';
import { MetadataDraftError, readMetadataObject } from '../../../../lib/metadata-json.ts';
import { DatasetTextError } from '../../../../lib/server/dataset-text.ts';
import { readSaveText } from '../../../../lib/server/metadata-save.ts';
import { PortalError } from '../../../../lib/server/portal-checkout.ts';
import { PortalSourceMismatch } from '../../../../lib/server/portal-source.ts';
import { portalOperation } from '../../../../lib/server/portal-submit.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params, url }) => {
  if (request.headers.get('origin') !== url.origin) return json({ message: 'Forbidden' }, { status: 403 });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ message: 'Supply application/json.' }, { status: 415 });
  try {
    const input = readMetadataObject(await readSaveText(request));
    if (input.action !== 'preview' && input.action !== 'submit') return json({ message: 'Choose preview or submit.' }, { status: 400 });
    if (input.action === 'submit' && (input.confirmed !== true || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision))) return json({ message: 'Confirm a valid preview before submission.' }, { status: 400 });
    const operation = input.action === 'preview' ? { action: 'preview' as const }
      : { action: 'submit' as const, confirmed: true as const, revision: input.revision as string };
    return json(await portalOperation(process.env.DATASET_ROOT, params.name, process.env.PORTAL_CLONE, operation), { headers: { 'cache-control': 'no-store' } });
  } catch (cause) {
    if (cause instanceof PortalSourceMismatch) return json({ status: 'needs-push', source: cause.source }, { headers: { 'cache-control': 'no-store' } });
    if (cause instanceof PortalError) return json({ message: cause.message, step: cause.step ?? 'preview', checks: cause.checks }, { status: 409 });
    if (cause instanceof MetadataDraftError) return json({ message: 'Supply a valid bounded JSON request.' }, { status: 400 });
    if (cause instanceof Error && 'status' in cause && cause.status === 413) return json({ message: 'Portal request exceeds the 5 MiB limit.' }, { status: 413 });
    if (cause instanceof DatasetTextError && cause.status === 404) return json({ message: cause.message }, { status: 404 });
    console.error('Portal operation failed. No source dataset changes were attempted.');
    return json({ message: 'Portal operation failed. Inspect any unfinished work in PORTAL_CLONE before retrying. Source datasets were not changed.' }, { status: 500 });
  }
};
