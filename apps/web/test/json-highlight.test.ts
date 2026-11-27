import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highlightJson, highlightJsonLines } from '../src/lib/json-highlight.ts';

test('highlights JSON keys, strings, numbers and literals without changing raw text', () => {
  const text = '{\r\n "name" \n : "A \\"quote\\"", "count": -1.20e+3, "ready": true, "missing": null, "off": false, "empty": [] }\n';
  const tokens = highlightJson(text);
  assert.equal(tokens.map((token) => token.text).join(''), text);
  assert.deepEqual(tokens.filter((token) => token.kind === 'key').map((token) => token.text), ['"name"', '"count"', '"ready"', '"missing"', '"off"', '"empty"']);
  assert.deepEqual(tokens.filter((token) => token.kind === 'string').map((token) => token.text), ['"A \\"quote\\""']);
  assert.deepEqual(tokens.filter((token) => token.kind === 'number').map((token) => token.text), ['-1.20e+3']);
  assert.deepEqual(tokens.filter((token) => token.kind === 'literal').map((token) => token.text), ['true', 'null', 'false']);
  assert.equal(new Set(tokens.map((token) => token.offset)).size, tokens.length);
});

test('keeps malformed JSON, HTML-shaped text, unsafe numbers and incomplete strings readable verbatim', () => {
  for (const text of ['', '{invalid JSON\n<script>alert(1)</script>', '{"n":9007199254740993}', '{"broken":"unterminated', '{"escape":"\\q"}', '// comment\n{"key": true}', '{"unicode":"\\u0061"}']) {
    assert.equal(highlightJson(text).map((token) => token.text).join(''), text);
  }
});

test('bounds highlighting while keeping every remaining byte as plain text, across diff lines too', () => {
  const text = JSON.stringify(Array.from({ length: 15000 }, (_, index) => index));
  const tokens = highlightJson(text);
  assert.ok(tokens.length <= 20001);
  assert.equal(tokens.at(-1)?.kind, 'plain');
  assert.equal(tokens.map((token) => token.text).join(''), text);
  const lines = Array.from({ length: 10000 }, () => '  "count": 178,');
  const highlighted = highlightJsonLines(lines);
  assert.deepEqual(highlighted.map((tokens) => tokens.map((token) => token.text).join('')), lines);
  assert.ok(highlighted.flat().filter((token) => token.kind !== 'plain').length <= 20000);
  assert.ok(highlighted.at(-1)?.every((token) => token.kind === 'plain'));
});
