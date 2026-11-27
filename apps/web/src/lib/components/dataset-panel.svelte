<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        title,
        description,
        actions,
        children,
        busy = false,
    }: {
        title: string;
        description: string;
        actions?: Snippet;
        children: Snippet;
        busy?: boolean;
    } = $props();
    const id = $props.id();
</script>

<section
    aria-labelledby={`${id}-title`}
    aria-busy={busy}
    class="flex min-w-0 flex-col gap-4"
>
    <header class="flex min-w-0 flex-col gap-2 border-b pb-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
            <h2
                id={`${id}-title`}
                class="font-heading text-xl font-semibold wrap-anywhere"
            >
                {title}
            </h2>
            {#if actions}<div class="shrink-0">{@render actions()}</div>{/if}
        </div>
        <p class="text-xs leading-relaxed text-muted-foreground">
            {description}
        </p>
    </header>
    <div class="flex min-w-0 flex-col gap-4 text-sm">
        {@render children()}
    </div>
</section>
