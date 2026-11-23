export const readmeTags = ['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'strong', 'em', 's', 'code', 'pre', 'a', 'span', 'table', 'thead',
  'tbody', 'tr', 'th', 'td', 'hr', 'br'] as const;

export type ReadmeTag = (typeof readmeTags)[number];

export type ReadmeNode =
  | { tag: 'text'; text: string }
  | { tag: 'badge'; text: string }
  | { tag: ReadmeTag; children: ReadmeNode[]; href?: string; start?: number };

function nodeText(node: ReadmeNode): string {
  return node.tag === 'text' || node.tag === 'badge'
    ? node.text : node.children.map(nodeText).join('');
}

export function findBucketTable(nodes: ReadmeNode[]): ReadmeNode | undefined {
  let headingLevel = 0;
  for (const node of nodes) {
    if (/^h[2-6]$/.test(node.tag)) {
      const level = Number(node.tag.slice(1));
      if (headingLevel && level <= headingLevel) return undefined;
      if (!headingLevel && nodeText(node).trim().toLowerCase() === 'buckets') headingLevel = level;
    } else if (headingLevel && node.tag === 'table') {
      return node;
    }
  }
  return undefined;
}
