<script lang="ts">
  import type { JsonToken } from '$lib/json-highlight.ts';
  let { tokens }: { tokens: readonly JsonToken[] } = $props();
</script>

{#each tokens as token (token.offset)}{#if token.kind === 'plain'}{token.text}{:else}<span data-json-token={token.kind}>{token.text}</span>{/if}{/each}

<style>
  [data-json-token="key"] { color: var(--syntax-key); }
  [data-json-token="string"] { color: var(--syntax-string); }
  [data-json-token="number"] { color: var(--syntax-number); }
  [data-json-token="literal"] { color: var(--syntax-literal); }
  [data-json-token="punctuation"] { color: var(--foreground); }
</style>
