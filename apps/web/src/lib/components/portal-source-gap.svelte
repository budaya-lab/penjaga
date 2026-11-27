<script lang="ts">
  import PortalDiff from '$lib/components/portal-diff.svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import type { PortalSourceDifference } from '$lib/portal.ts';

  let { source, metadataUrl }: { source: PortalSourceDifference; metadataUrl: string } = $props();
</script>

<Alert.Root>
  <Alert.Title>Saved changes are not on GitHub yet</Alert.Title>
  <Alert.Description>
    <p>The portal reads <strong>{source.repository}</strong> on branch <strong>{source.branch}</strong>, currently at <code>{source.sha.slice(0, 8)}</code>. That version differs from your saved file.</p>
    <p>Open Metadata and use Commit &amp; push. Return here and choose Check again. These saved changes have not been submitted to the portal.</p>
  </Alert.Description>
</Alert.Root>
<Button href={metadataUrl}>Open Metadata to commit &amp; push</Button>
<PortalDiff before={source.pushed} after={source.saved} title="What is saved locally but not on GitHub" beforeLabel="Pushed on GitHub" afterLabel="Saved locally" label="Metadata sync" />
