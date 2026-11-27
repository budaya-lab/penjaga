<script lang="ts">
  import { portalEntryDiff } from '$lib/portal-diff.ts';
  import { cn } from '$lib/utils.js';

  let { before, after, title = 'Current → proposed', beforeLabel = 'Current', afterLabel = 'Proposed', label = 'Catalogue' }: {
    before: Record<string, unknown> | null; after: Record<string, unknown>; title?: string; beforeLabel?: string; afterLabel?: string; label?: string;
  } = $props();
  let lines = $derived(portalEntryDiff(before, after));
  let additions = $derived(lines.filter((line) => line.kind === 'add').length);
  let removals = $derived(lines.filter((line) => line.kind === 'remove').length);
</script>

<section class="flex min-w-0 flex-col gap-2" aria-label={`${label} changes`}>
  <h3 class="text-sm font-medium">{title}</h3>
  <p class="text-sm text-muted-foreground">{additions} added lines (+), {removals} removed lines (−). Unmarked lines are unchanged.</p>
  <div role="textbox" aria-readonly="true" aria-multiline="true" aria-label={`${label} JSON diff`} tabindex="0" class="max-h-128 overflow-auto rounded-md border bg-muted focus-visible:outline-2 focus-visible:outline-ring">
    <pre class="min-w-max py-3 text-xs leading-relaxed"><code><span class="block px-3 text-muted-foreground">--- {before === null ? `${beforeLabel} (not yet catalogued)` : beforeLabel}</span><span class="block px-3 text-muted-foreground">+++ {afterLabel}</span>{#each lines as line (`${line.oldLine}:${line.newLine}`)}<span class={cn('block px-3', line.kind === 'add' && 'bg-primary/10 text-primary', line.kind === 'remove' && 'bg-destructive/10 text-destructive')}><span aria-hidden="true" class="mr-3 inline-block w-8 text-right text-muted-foreground select-none">{line.oldLine ?? ''}</span><span aria-hidden="true" class="mr-3 inline-block w-8 text-right text-muted-foreground select-none">{line.newLine ?? ''}</span>{line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '} {line.text}</span>{/each}</code></pre>
  </div>
</section>
