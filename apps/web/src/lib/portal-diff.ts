export type PortalDiffLine = {
  kind: 'context' | 'remove' | 'add';
  text: string;
  oldLine: number | null;
  newLine: number | null;
};

export function portalEntryDiff(before: Record<string, unknown> | null, after: Record<string, unknown>): PortalDiffLine[] {
  const oldLines = before === null ? [] : JSON.stringify(before, null, 2).split('\n');
  const newLines = JSON.stringify(after, null, 2).split('\n');
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
