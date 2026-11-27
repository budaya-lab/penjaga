<script lang="ts">
  import { onMount } from 'svelte';
  import PortalDiff from '$lib/components/portal-diff.svelte';
  import PortalSourceGap from '$lib/components/portal-source-gap.svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Field from '$lib/components/ui/field/index.js';
  import { Checkbox } from '$lib/components/ui/checkbox/index.js';
  import { isPortalStep, readPortalResponse, type PortalPreview, type PortalResult, type PortalSourceDifference, type PortalStep } from '$lib/portal.ts';

  let { endpoint, metadataUrl, blocked = false }: { endpoint: string; metadataUrl: string; blocked?: boolean } = $props();
  const id = $props.id();
  let preview = $state.raw<PortalPreview | null>(null);
  let difference = $state.raw<PortalSourceDifference | null>(null);
  let pending = $state<'preview' | 'submit' | null>(null);
  let busy = $derived(pending !== null);
  let confirmed = $state(false);
  let error = $state('');
  let errorStep = $state<PortalStep>('preview');
  let failedChecks = $state.raw<string[]>([]);
  let result = $state.raw<Extract<PortalResult, { status: 'submitted' | 'unchanged' }> | null>(null);
  let pushedVerified = $derived(!!preview || !!result || (!!error && ['dependencies', 'validation', 'push', 'pr'].includes(errorStep)));
  const failures: Record<PortalStep, { title: string; next: string }> = {
    source: { title: 'Could not check the GitHub version', next: 'Check the dataset branch and your GitHub access, then check again. No unverified metadata will be submitted.' },
    preview: { title: 'Could not prepare the catalogue preview', next: 'The catalogue preview is not ready. Correct the issue below, then check again; unfinished managed-clone work is kept.' },
    dependencies: { title: 'Portal setup did not finish', next: 'The portal tools could not be installed. Check network access and pnpm, then check again.' },
    validation: { title: 'The proposed portal change failed its checks', next: 'The saved metadata is on GitHub, but the portal rejected the proposed catalogue change. This attempt did not push it. The check details need review; saving again will not fix that.' },
    push: { title: 'The portal proposal push was not confirmed', next: 'Your dataset metadata is ready. The local portal proposal commit is kept; retrying reuses it rather than making another commit.' },
    pr: { title: 'The portal PR could not be confirmed', next: 'The proposal branch may already be pushed. Retry to find or update the existing PR; no automatic merge takes place.' },
  };

  onMount(() => { void request('preview'); });

  async function request(action: 'preview' | 'submit') {
    if (busy || blocked || (action === 'submit' && (!preview || !confirmed))) return;
    pending = action;
    error = '';
    failedChecks = [];
    result = null;
    if (action === 'preview') { preview = null; difference = null; confirmed = false; }
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'preview' ? { action } : { action, revision: preview?.revision, confirmed: true }) });
      const value: unknown = await response.json();
      if (!response.ok) {
        if (value !== null && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
          errorStep = 'step' in value && isPortalStep(value.step) ? value.step : action === 'submit' ? 'validation' : 'preview';
          error = value.message;
          if ('checks' in value && Array.isArray(value.checks)) failedChecks = value.checks.filter((check): check is string => typeof check === 'string' && /^scripts\/[a-z0-9-]{1,80}\.test\.(?:ts|mjs)$/.test(check)).slice(0, 8);
          if (errorStep === 'source' || errorStep === 'preview') preview = null;
          return;
        }
        throw new Error('The portal returned an unreadable error. Check again before submitting.');
      }
      const data = readPortalResponse(value);
      if (data.status === 'needs-push') {
        difference = data.source;
        preview = null;
      } else if (data.status === 'preview') {
        preview = data.preview;
        difference = null;
      } else {
        result = data;
        preview = null;
        difference = null;
      }
      confirmed = false;
    } catch (cause) {
      errorStep = action === 'submit' ? 'pr' : 'preview';
      error = cause instanceof Error ? cause.message : 'The request could not be confirmed. Check the local server, then check again.';
      confirmed = false;
    } finally { confirmed = false; pending = null; }
  }
</script>

<Card.Root aria-busy={busy} data-portal-submitting={pending === 'submit'}>
  <Card.Header>
    <Card.Title>Portal submission</Card.Title>
    <Card.Description>Save locally, push to GitHub, then review the portal change. A saved file is not necessarily the version on GitHub. Nothing is merged automatically.</Card.Description>
    <Card.Action>
      <Button type="button" variant="outline" disabled={busy || blocked} onclick={() => request('preview')}>
        {pending === 'preview' ? 'Checking…' : difference || error ? 'Check again' : 'Refresh preview'}
      </Button>
    </Card.Action>
  </Card.Header>
  <Card.Content class="flex min-w-0 flex-col gap-4">
    <ol aria-label="Portal submission readiness" class="flex list-decimal flex-col gap-2 pl-5 text-sm">
      <li><strong>Save metadata:</strong> {blocked ? 'Action needed — there are unsaved or unresolved edits.' : 'Saved on disk.'}</li>
      <li><strong>Push to GitHub:</strong> {blocked ? 'Waiting for Save.' : difference ? `Action needed — ${difference.branch} has different metadata.` : pushedVerified ? 'Verified for this preview.' : busy ? 'Checking the pushed branch…' : 'Not verified yet.'}</li>
      <li><strong>Review portal PR:</strong> {result?.status === 'submitted' ? 'PR created or updated. Review it on GitHub.' : result?.status === 'unchanged' ? 'No catalogue changes needed.' : difference || blocked ? 'Waiting for the saved metadata to be pushed.' : preview ? preview.changed ? 'Ready for your review below.' : 'No catalogue changes needed.' : error ? 'Blocked — see the step below.' : 'Preparing the catalogue preview.'}</li>
    </ol>
    {#if blocked}
      <Alert.Root>
        <Alert.Title>Save your edits before checking the portal</Alert.Title>
        <Alert.Description>Return to Metadata, resolve any incomplete input, and save. Then use Commit &amp; push if Git shows changes.</Alert.Description>
      </Alert.Root>
      <Button href={metadataUrl} variant="outline">Open Metadata</Button>
    {:else if difference}
      <PortalSourceGap source={difference} {metadataUrl} />
    {/if}
    {#if error}
      <Alert.Root variant="destructive">
        <Alert.Title>{failures[errorStep].title}</Alert.Title>
        <Alert.Description>
          <p>{failures[errorStep].next}</p><p>{error}</p>
          {#if failedChecks.length}<ul class="list-disc pl-5">{#each failedChecks as check (check)}<li>Failed check: <code>{check}</code></li>{/each}</ul>{/if}
        </Alert.Description>
      </Alert.Root>
      {#if errorStep === 'source'}<Button href={metadataUrl} variant="outline">Check Metadata and branch</Button>{/if}
    {/if}
    {#if busy}<p role="status" class="text-sm">{pending === 'submit' ? 'Validating the portal change, then pushing its proposal and creating the PR…' : 'Reading the saved and pushed metadata, then preparing the portal preview…'}</p>{/if}
    {#if result}
      <p role="status" class="text-sm">{result.message}</p>
      {#if result.status === 'submitted'}<Button href={result.url} variant="outline" target="_blank" rel="noopener noreferrer">Open portal PR</Button>{/if}
    {/if}
    {#if preview && !blocked}
      <h2 class="font-heading text-lg font-semibold">{preview.action === 'add' ? 'Add to portal' : 'Update portal'}: review changes</h2>
      <p class="text-sm wrap-anywhere">Source: {preview.repository} · branch <code>{preview.branch}</code> · pushed metadata <code>{preview.sha.slice(0, 8)}</code></p>
      <section aria-label="Portal content" class="flex min-w-0 flex-col gap-2">
        <h3 class="font-heading text-lg font-semibold wrap-anywhere">{String(preview.after.name ?? '')}</h3>
        <p class="text-sm text-muted-foreground wrap-anywhere">{String(preview.after.namespace ?? '')} / {String(preview.after.slug ?? '')}</p>
        <p class="whitespace-pre-wrap wrap-anywhere">{String(preview.after.description ?? '')}</p>
      </section>
      <PortalDiff before={preview.before} after={preview.after} />
      <ul aria-label="Portal preview notes" class="list-disc pl-5 text-sm">{#each preview.warnings as warning (warning)}<li>{warning}</li>{/each}</ul>
      {#if preview.changed}
        <Alert.Root>
          <Alert.Title>This proposal will be public</Alert.Title>
          <Alert.Description>PR branches and metadata are public, including restricted resource listings. Restricted data bytes are not copied. Publication status and confirmed lineage are preserved; new entries stay drafts.</Alert.Description>
        </Alert.Root>
        <Field.Group>
          <Field.Field orientation="horizontal" data-disabled={busy}>
            <Checkbox id={`${id}-confirm`} bind:checked={confirmed} disabled={busy} />
            <Field.Label for={`${id}-confirm`}>I reviewed these changes and approve their public disclosure.</Field.Label>
          </Field.Field>
        </Field.Group>
        <Button type="button" disabled={busy || !confirmed} onclick={() => request('submit')}>{pending === 'submit' ? 'Submitting…' : 'Create / update portal PR'}</Button>
      {:else}
        <p role="status" class="text-sm">The portal already contains this metadata. No PR is needed.</p>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>

<style>
  :global(body:has([data-portal-submitting="true"])),
  :global(body:has([data-portal-submitting="true"]) *) { cursor: wait !important; }
</style>
