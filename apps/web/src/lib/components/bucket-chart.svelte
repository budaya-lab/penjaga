<script lang="ts">
  import { BarChart } from 'layerchart';
  import * as Chart from '$lib/components/ui/chart/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Table from '$lib/components/ui/table/index.js';
  import type { BucketChartData } from '$lib/server/buckets.ts';

  let { buckets, embedded = false }: { buckets: BucketChartData; embedded?: boolean } = $props();
  let config = $derived({
    value: { label: buckets.valueColumn },
  } satisfies Chart.ChartConfig);
  let maximum = $derived(Math.max(...buckets.rows.map((row) => row.value)));
  let height = $derived(Math.max(200, buckets.rows.length * 32 + 40));
</script>

<section aria-label="Bucket summary" class="w-full min-w-0 max-w-2xl">
  <Card.Root>
    <Card.Header>
      {#if !embedded}<Card.Title><h2>Buckets</h2></Card.Title>{/if}
      <Card.Description>{buckets.valueColumn} by {buckets.labelColumn}</Card.Description>
    </Card.Header>
    <Card.Content class="flex min-w-0 flex-col gap-4">
      {#if buckets.total > buckets.rows.length}
        <p class="text-sm text-muted-foreground">Showing the first {buckets.rows.length} of {buckets.total} buckets in file order.</p>
      {/if}
      <div class="max-h-112 overflow-y-auto" aria-hidden="true">
        <Chart.Container {config} class="aspect-auto w-full">
          <BarChart
            {height}
            data={buckets.rows}
            orientation="horizontal"
            x="value"
            y="label"
            xDomain={[0, maximum || 1]}
            yReverse={false}
            motion="none"
            series={[{ key: 'value', label: buckets.valueColumn, color: 'var(--chart-2)' }]}
            padding={{ left: 112, right: 16, top: 8, bottom: 24 }}
            props={{ yAxis: { format: (label: string) => label.length > 16 ? `${label.slice(0, 15)}…` : label } }}
          >
            {#snippet tooltip({ context })}
              <Chart.Tooltip label={context.tooltip.data?.label}>
                {#snippet formatter({ value, name })}
                  <span class="text-muted-foreground">{name}</span>
                  <span class="font-mono tabular-nums">{String(value)}</span>
                {/snippet}
              </Chart.Tooltip>
            {/snippet}
          </BarChart>
        </Chart.Container>
      </div>
      <details>
        <summary class="cursor-pointer text-sm font-medium">View bucket values</summary>
        <Table.Root>
          <Table.Caption>Values shown in the bucket chart</Table.Caption>
          <Table.Header>
            <Table.Row>
              <Table.Head scope="col">{buckets.labelColumn}</Table.Head>
              <Table.Head scope="col" class="text-right">{buckets.valueColumn}</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each buckets.rows as row (row.label)}
              <Table.Row>
                <Table.Cell>{row.label}</Table.Cell>
                <Table.Cell class="text-right tabular-nums">{row.value}</Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </details>
    </Card.Content>
  </Card.Root>
</section>
