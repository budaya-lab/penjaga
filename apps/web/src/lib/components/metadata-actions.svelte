<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Field from '$lib/components/ui/field/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { DEFAULT_COMMIT_MESSAGE, hasDatasetChanges, readDatasetBranch, requestDatasetCommit, type DatasetBranch } from '$lib/dataset-git.ts';

  let { saving, saveMessage, saveError, dirty, syncError, reloadUrl, commitUrl, gitUrl, branchState,
    metadataText, onsave, checksPending = false, hasIssues = false, committing = $bindable(false) }: {
    saving: boolean; saveMessage: string; saveError: string; dirty: boolean; syncError: string;
    reloadUrl: string; commitUrl?: string; gitUrl?: string; branchState?: DatasetBranch; metadataText: () => string;
    onsave: () => Promise<void>; checksPending?: boolean; hasIssues?: boolean; committing?: boolean;
  } = $props();
  const id = $props.id();
  let gitState = $derived(branchState);
  let refreshing = $state(false);
  let showDialog: (() => void) | undefined;
  let closeDialog: (() => void) | undefined;
  function connectDialog(element: HTMLDialogElement) {
    showDialog = () => element.showModal();
    closeDialog = () => element.close();
    return () => { showDialog = undefined; closeDialog = undefined; };
  }
  let message = $state(DEFAULT_COMMIT_MESSAGE);
  let commitMessage = $state('');
  let commitError = $state('');
  let statusRequest = 0;
  let branchBlocked = $derived(gitState?.status !== 'ready' || ['main', 'master'].includes(gitState.branch));
  let canCommit = $derived(!!commitUrl && !saving && !committing && !refreshing && !dirty && !syncError && !checksPending && !hasIssues && !branchBlocked && hasDatasetChanges(gitState));
  let status = $derived.by(() => {
    if (saving) return 'Saving metadata…';
    if (committing) return 'Committing and pushing saved metadata…';
    if (dirty || syncError) return 'Unsaved edits. Save before committing.';
    if (checksPending) return 'Checking metadata before commit…';
    if (hasIssues) return 'Resolve metadata checks before committing. Save can still keep incomplete work locally.';
    if (refreshing) return 'Checking saved files and unpushed commits…';
    if (gitState?.status !== 'ready') return gitState?.message ?? 'Git status has not been checked.';
    if (branchBlocked) return `You are on ${gitState.branch}. Switch to a feature branch before committing or pushing.`;
    if (gitState.changes.length) return `Saved changes in ${gitState.changes.join(' and ')} need a commit.`;
    if (gitState.ahead === null) return 'This branch has not been published to origin yet.';
    if (gitState.ahead > 0) return `${gitState.ahead} local commit${gitState.ahead === 1 ? '' : 's'} ready to push.`;
    return 'Nothing to commit or push.';
  });

  onMount(() => { if (gitUrl) void refreshGit(); });
  onDestroy(() => { statusRequest++; });

  async function refreshGit() {
    if (!gitUrl) return;
    const request = ++statusRequest;
    refreshing = true;
    try {
      const response = await fetch(gitUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Git status request failed');
      const state = readDatasetBranch(await response.json());
      if (request === statusRequest) gitState = state;
    } catch (cause) {
      console.error('Dataset Git status request failed.', cause instanceof Error ? cause.name : 'Unknown error');
      if (request === statusRequest) gitState = { status: 'unavailable', message: 'Could not check Git status. Use Check Git to retry.' };
    } finally { if (request === statusRequest) refreshing = false; }
  }

  async function save() {
    commitMessage = '';
    commitError = '';
    await onsave();
    await refreshGit();
  }

  function openCommit() {
    if (!canCommit) return;
    commitError = '';
    showDialog?.();
  }

  async function commit() {
    if (!canCommit || !message.trim() || gitState?.status !== 'ready') return;
    committing = true;
    commitMessage = '';
    commitError = '';
    try {
      const value = await requestDatasetCommit(commitUrl!, metadataText, message, gitState.branch);
      if (value.status === 'error') {
        commitError = value.message;
        return;
      }
      commitMessage = value.message;
      gitState = { ...gitState, changes: [], ahead: 0 };
      closeDialog?.();
    } catch (cause) {
      console.error('Dataset commit request failed.', cause instanceof Error ? cause.name : 'Unknown error');
      commitError = 'The result could not be confirmed. Check Git status below; any local commit is kept and can be pushed again without duplication.';
    } finally {
      await refreshGit();
      committing = false;
    }
  }
</script>

<div class="sticky bottom-0 flex flex-col gap-2 border-t bg-background py-3" aria-busy={saving || committing} data-dataset-submitting={committing}>
  <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    <p>Branch: {#if gitState?.status === 'ready'}<code class="wrap-anywhere">{gitState.branch}</code>{:else}Unavailable{/if}</p>
    <Button type="button" variant="ghost" size="sm" disabled={!gitUrl || refreshing || saving || committing} onclick={refreshGit}>{refreshing ? 'Checking Git…' : 'Check Git'}</Button>
  </div>
  <p role="status" aria-live="polite" class="text-sm">{status}</p>
  {#if saveMessage}<p class="text-sm text-muted-foreground">{saveMessage}</p>{/if}
  {#if saveError}<p role="alert" class="text-sm text-destructive">{saveError}</p>{/if}
  <div class="flex flex-wrap items-center gap-2">
    <Button type="button" disabled={saving || committing || !!syncError || !dirty} onclick={save}>Save changes</Button>
    <Button type="button" variant="outline" disabled={!canCommit} onclick={openCommit}>
      {committing ? 'Committing & pushing…' : gitState?.status === 'ready' && !gitState.changes.length && hasDatasetChanges(gitState) ? 'Push changes' : 'Commit & push'}
    </Button>
    <Button type="button" variant="outline" disabled>Reset form</Button>
    <Button href={reloadUrl} variant="ghost" data-sveltekit-reload>Reload file</Button>
  </div>
  {#if commitMessage && !dirty}<p role="status" class="text-sm">{commitMessage}</p>{/if}
</div>

<dialog {@attach connectDialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-scope`}
  oncancel={(event) => { if (committing) event.preventDefault(); }}
  class="m-auto w-full max-w-lg rounded-lg border bg-background p-6 text-foreground shadow-lg backdrop:bg-foreground/20">
  <form onsubmit={(event) => { event.preventDefault(); void commit(); }} class="flex flex-col gap-4" aria-busy={committing}>
    <h2 id={`${id}-title`} class="font-heading text-xl font-semibold">{gitState?.status === 'ready' && gitState.changes.length ? 'Commit & push saved changes' : 'Push existing commits'}</h2>
    <p id={`${id}-scope`} class="text-sm text-muted-foreground">Only saved metadata and generated README changes go to <strong>{gitState?.status === 'ready' ? gitState.branch : 'the current branch'}</strong>. Unrelated changes stay untouched. This does not submit to the portal.</p>
    {#if gitState?.status === 'ready' && gitState.changes.length}
      <ul class="list-disc pl-5 text-sm">{#each gitState.changes as path (path)}<li><code>{path}</code></li>{/each}</ul>
      <Field.Field>
        <Field.Label for={`${id}-message`} required>Commit message</Field.Label>
        <Textarea id={`${id}-message`} bind:value={message} rows={4} maxlength={200} disabled={committing} required />
      </Field.Field>
    {:else}
      <p class="text-sm">Your existing local commit will be pushed. No new commit will be created.</p>
    {/if}
    {#if commitError}<p role="alert" class="text-sm text-destructive">{commitError}</p>{/if}
    <div class="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="ghost" disabled={committing} onclick={() => closeDialog?.()}>Cancel</Button>
      <Button type="submit" disabled={!canCommit || !message.trim()}>{committing ? 'Pushing…' : 'Confirm push'}</Button>
    </div>
  </form>
</dialog>

<style>
  :global(body:has([data-dataset-submitting="true"])),
  :global(body:has([data-dataset-submitting="true"]) *) { cursor: wait !important; }
</style>
