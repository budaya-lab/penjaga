<script lang="ts">
    import { untrack } from "svelte";
    import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { page } from "$app/state";
    import BucketChart from "$lib/components/bucket-chart.svelte";
    import MetadataForm from "$lib/components/metadata-form.svelte";
    import DatasetPanel from "$lib/components/dataset-panel.svelte";
    import JsonSyntax from "$lib/components/json-syntax.svelte";
    import { highlightJson } from "$lib/json-highlight.ts";
    import ReadmeBody from "$lib/components/readme-body.svelte";
    import PortalSubmission from "$lib/components/portal-submission.svelte";
    import * as Alert from "$lib/components/ui/alert/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import {
        type MetadataSession,
        receiveMetadataSession,
        updateMetadataSession,
    } from "$lib/metadata-session.ts";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();
    let datasetUrl = $derived(
        resolve("/datasets/[name]", { name: encodeURIComponent(data.name) }),
    );
    type MetadataData = Extract<PageProps["data"], { view: "metadata" }>;
    let session = $state.raw<MetadataSession<MetadataData> | null>(
        untrack(() =>
            receiveMetadataSession(
                null,
                data.name,
                data.view === "metadata" ? data : undefined,
            ),
        ),
    );
    let active = $derived(
        session?.metadata.name === data.name ? session : null,
    );
    let baseline = $derived(active?.metadata ?? null);
    let draft = $derived(active?.draft ?? null);
    let view = $derived(
        page.shallow?.url.searchParams.get("view") ?? data.view,
    );
    let jsonText = $derived(
        active?.draft?.text() ??
            baseline?.metadataText ??
            (data.view === "datapackage" ? data.text : ""),
    );
    let jsonTokens = $derived(highlightJson(jsonText));
    // Router loads change for each view; capture a metadata baseline only once per dataset.
    afterNavigate(() => {
        session = receiveMetadataSession(
            session,
            data.name,
            data.view === "metadata" ? data : undefined,
        );
    });
    function updateDraft(name: string, error: string) {
        session = updateMetadataSession(session, name, error);
    }
    async function switchView(
        event: MouseEvent,
        target: "readme" | "metadata" | "datapackage" | "portal",
    ) {
        if (
            !active ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        )
            return;
        event.preventDefault();
        const params = { name: encodeURIComponent(data.name) };
        if (target === "readme")
            await goto(resolve("/datasets/[name]", params), {
                refreshAll: true,
                reset: true,
            });
        else
            await goto(resolve(`/datasets/[name]?view=${target}`, params), {
                shallow: true,
                reset: true,
            });
    }
    beforeNavigate((navigation) => {
        if (!session?.draft || (!session.draft.dirty && !session.error)) return;
        if (
            !navigation.willUnload &&
            navigation.to?.url.pathname === navigation.from?.url.pathname
        )
            return;
        if (navigation.type === "leave") navigation.cancel();
        else if (!window.confirm("Discard unsaved metadata changes?"))
            navigation.cancel();
    });
</script>

<svelte:head>
    <title>{data.name} — Dataset Steward</title>
</svelte:head>

<section class="flex w-full min-w-0 max-w-3xl flex-col gap-4" data-form-style="outlined">
    <h1 class="font-heading text-3xl font-semibold wrap-anywhere">
        {data.name}
    </h1>
    <nav aria-label="Dataset sections" class="flex flex-wrap gap-2">
        <Button
            href={datasetUrl}
            variant={view === "readme" ? "secondary" : "ghost"}
            aria-current={view === "readme" ? "page" : undefined}
            onclick={(event) => switchView(event, "readme")}>README</Button
        >
        <Button
            href={`${datasetUrl}?view=metadata`}
            variant={view === "metadata" ? "secondary" : "ghost"}
            aria-current={view === "metadata" ? "page" : undefined}
            onclick={(event) => switchView(event, "metadata")}>Metadata</Button
        >
        <Button
            href={`${datasetUrl}?view=datapackage`}
            variant={view === "datapackage" ? "secondary" : "ghost"}
            aria-current={view === "datapackage" ? "page" : undefined}
            onclick={(event) => switchView(event, "datapackage")}
            >datapackage.json</Button
        >
        <Button
            href={`${datasetUrl}?view=portal`}
            variant={view === "portal" ? "secondary" : "ghost"}
            aria-current={view === "portal" ? "page" : undefined}
            onclick={(event) => switchView(event, "portal")}>Portal</Button
        >
    </nav>
    {#if view === "portal"}
        {#key data.name}
            <PortalSubmission endpoint={`${datasetUrl}/portal`} metadataUrl={`${datasetUrl}?view=metadata`} blocked={!!active?.error || !!draft?.dirty} />
        {/key}
    {/if}
    {#if baseline}
        {#key baseline.name}
            <div hidden={view !== "metadata"}>
                <DatasetPanel title="Metadata" description="Edit locally, then save your changes. Commit & push and portal review are separate actions.">
                {#if draft}
                    <MetadataForm
                        {...baseline.overview}
                        keywordFields={baseline.keywordFields}
                        resourceModel={baseline.resourceModel}
                        resourceCountUrl={`${datasetUrl}/resources`}
                        sourceModel={baseline.sourceModel}
                        licenseModel={baseline.licenseModel}
                        contributorModel={baseline.contributorModel}
                        stageOptions={baseline.stageOptions}
                        issues={baseline.issues}
                        {draft}
                        reloadUrl={`${datasetUrl}?view=metadata`}
                        saveUrl={`${datasetUrl}/save`}
                        commitUrl={`${datasetUrl}/commit`}
                        gitUrl={`${datasetUrl}/git`}
                        branchState={baseline.gitState}
                        datasetId={baseline.name}
                        ondraft={updateDraft}
                    />
                {:else}
                    <p role="alert">
                        Safe metadata editing is unavailable: {active?.error} The
                        original JSON is still available in datapackage.json.
                    </p>
                    {#if baseline.issues.length}
                        <ul
                            aria-label="Metadata validation"
                            class="list-disc pl-5"
                        >
                            {#each baseline.issues as issue, index (`${index}:${issue}`)}<li
                                >
                                    {issue}
                                </li>{/each}
                        </ul>
                    {/if}
                {/if}
                </DatasetPanel>
            </div>
        {/key}
    {/if}
    {#if view === "readme" && data.view === "readme"}
        <DatasetPanel title="README" description="Read-only README.md. Embedded HTML and images are disabled. Only credential-free HTTPS links are clickable.">
        {#if data.readme.status === "unavailable"}
            <Alert.Root>
                <Alert.Title>README unavailable</Alert.Title>
                <Alert.Description
                    >{data.readme.message} You can still open Metadata.</Alert.Description
                >
            </Alert.Root>
        {:else}
            {#if data.readme.template}
                <Alert.Root>
                    <Alert.Title>Template README</Alert.Title>
                    <Alert.Description
                        >This README is unchanged from a reviewed tpl-dataset
                        template. Replace it with dataset-specific
                        documentation.</Alert.Description
                    >
                </Alert.Root>
            {/if}
            {#if data.readme.empty}
                <p>README.md is empty.</p>
            {:else}
                <ReadmeBody nodes={data.readme.nodes} buckets={data.buckets.status === 'available' ? data.buckets : undefined} />
            {/if}
        {/if}
        {#if data.buckets.status === "available" && (data.readme.status === 'unavailable' || data.readme.empty)}
            <BucketChart buckets={data.buckets} />
        {:else if data.buckets.status === "unavailable"}
            <Alert.Root>
                <Alert.Title>Bucket chart unavailable</Alert.Title>
                <Alert.Description>{data.buckets.message}</Alert.Description>
            </Alert.Root>
        {/if}
        </DatasetPanel>
    {:else if view === "datapackage"}
        <DatasetPanel title="datapackage.json" description="Read-only JSON preview. Metadata edits appear here without saving.">
        {#if active?.error}
            <p role="alert" class="text-sm text-destructive">
                Some form edits could not be represented: {active.error} This shows
                the last representable draft. Return to Metadata to resolve them.
            </p>
        {/if}
        <div role="textbox" aria-readonly="true" aria-multiline="true" aria-label="Data Package JSON" tabindex="0"
            class="max-w-full overflow-x-auto rounded-md border bg-muted focus-visible:outline-2 focus-visible:outline-ring">
            <pre class="min-w-max p-4 text-xs leading-relaxed"><code><JsonSyntax tokens={jsonTokens} /></code></pre>
        </div>
        </DatasetPanel>
    {/if}
</section>
