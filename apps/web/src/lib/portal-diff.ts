export type PortalDiffLine = {
  kind: 'context' | 'remove' | 'add';
  text: string;
  oldLine: number | null;
  newLine: number | null;
};

function namedResources(items: unknown[]): Map<string, unknown> | null {
  const named = new Map<string, unknown>();
  for (const item of items) {
    if (item === null || typeof item !== 'object' || !('name' in item) || typeof item.name !== 'string' || !item.name.trim() || named.has(item.name)) return null;
    named.set(item.name, item);
  }
  return named;
}

// Resource identity survives insertions and removals; values and array order stay untouched.
function alignObjectKeys(value: unknown, reference: unknown, field?: string): unknown {
  if (Array.isArray(value)) {
    const previous = Array.isArray(reference) ? reference : [];
    const oldResources = field === 'resources' ? namedResources(previous) : null;
    const newResources = field === 'resources' ? namedResources(value) : null;
    if (oldResources && newResources) return [...newResources].map(([name, item]) => alignObjectKeys(item, oldResources.get(name)));
    return value.map((item, index) => alignObjectKeys(item, previous[index]));
  }
  if (value === null || typeof value !== 'object') return value;
  const current = value as Record<string, unknown>;
  const previous = reference !== null && typeof reference === 'object' && !Array.isArray(reference) ? reference as Record<string, unknown> : {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return Object.fromEntries([...keys].filter((key) => Object.hasOwn(current, key))
    .map((key) => [key, alignObjectKeys(current[key], previous[key], key)]));
}

export function preservePortalFieldOrder(before: Record<string, unknown> | null, after: Record<string, unknown>): Record<string, unknown> {
  return alignObjectKeys(after, before) as Record<string, unknown>;
}

export function portalEntryDiff(before: Record<string, unknown> | null, after: Record<string, unknown>): PortalDiffLine[] {
  const oldLines = before === null ? [] : JSON.stringify(before, null, 2).split('\n');
  const newLines = JSON.stringify(preservePortalFieldOrder(before, after), null, 2).split('\n');
  const lines: PortalDiffLine[] = [];
  let oldNumber = 0;
  let newNumber = 0;
  const push = (kind: PortalDiffLine['kind'], text: string) => lines.push({
    kind, text, oldLine: kind === 'add' ? null : ++oldNumber, newLine: kind === 'remove' ? null : ++newNumber,
  });
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    push('context', oldLines[start]);
    start++;
  }
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const width = newEnd - start + 1;
  const cells = (oldEnd - start + 1) * width;
  // Oversized replacements remain complete but do not attempt minimal alignment.
  const matches = cells <= 1_000_000 ? new Uint32Array(cells) : null;
  if (matches) {
    for (let old = oldEnd - 1; old >= start; old--) {
      for (let next = newEnd - 1; next >= start; next--) {
        const index = (old - start) * width + next - start;
        matches[index] = oldLines[old] === newLines[next]
          ? 1 + matches[index + width + 1]
          : Math.max(matches[index + width], matches[index + 1]);
      }
    }
  }
  let old = start;
  let next = start;
  while (old < oldEnd || next < newEnd) {
    if (old < oldEnd && next < newEnd && oldLines[old] === newLines[next]) {
      push('context', oldLines[old++]);
      next++;
    } else if (next === newEnd || (old < oldEnd && (!matches
      || matches[(old - start + 1) * width + next - start] >= matches[(old - start) * width + next - start + 1]))) {
      push('remove', oldLines[old++]);
    } else {
      push('add', newLines[next++]);
    }
  }
  for (let index = oldEnd; index < oldLines.length; index++) push('context', oldLines[index]);
  return lines;
}
