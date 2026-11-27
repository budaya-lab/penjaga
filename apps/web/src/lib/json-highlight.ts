import { createScanner } from 'jsonc-parser';

export type JsonToken = { offset: number; text: string; kind: 'key' | 'string' | 'number' | 'literal' | 'punctuation' | 'plain' };
const MAX_TOKENS = 20000;

export function highlightJson(text: string, limit = MAX_TOKENS): JsonToken[] {
  const scanner = createScanner(text);
  const tokens: JsonToken[] = [];
  let previousString: JsonToken | undefined;
  let end = 0;
  while (tokens.length < limit) {
    scanner.scan();
    const offset = scanner.getTokenOffset();
    const length = scanner.getTokenLength();
    if (!length) break;
    end = offset + length;
    const raw = text.slice(offset, end);
    let kind: JsonToken['kind'] = 'plain';
    // Raw lexemes preserve spelling without accessing the library's ambient const enums.
    if (!scanner.getTokenError()) {
      if (raw[0] === '"') kind = 'string';
      else if (raw[0] === '-' || (raw[0] >= '0' && raw[0] <= '9')) kind = 'number';
      else if (['true', 'false', 'null'].includes(raw)) kind = 'literal';
      else if (raw.length === 1 && '{}[],:'.includes(raw)) kind = 'punctuation';
      if (raw === ':' && previousString) previousString.kind = 'key';
    }
    const token: JsonToken = { offset, text: raw, kind };
    tokens.push(token);
    if (raw.trim()) previousString = kind === 'string' ? token : undefined;
  }
  // Highlighting is cosmetic: keep the complete remainder when the rendering budget is used.
  if (end < text.length) tokens.push({ offset: end, text: text.slice(end), kind: 'plain' });
  return tokens;
}

export function highlightJsonLines(lines: readonly string[]): JsonToken[][] {
  let remaining = MAX_TOKENS;
  return lines.map((line) => {
    const tokens = highlightJson(line, remaining);
    remaining = Math.max(0, remaining - tokens.length);
    return tokens;
  });
}
