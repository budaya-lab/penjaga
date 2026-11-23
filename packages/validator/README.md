# Dataset validator

Read-only metadata and local-repository checks. Includes compiled JavaScript,
types and matched policy, with no runtime dependencies.

## Install

Use Node.js 24+. The published v2.0.0 package is `@penjaga/validator`, with CLI
`penjaga-validate`:

```sh
VERSION=2.0.0
pnpm add --save-exact --ignore-scripts \
  "https://github.com/budaya-lab/penjaga/releases/download/v${VERSION}/penjaga-validator-${VERSION}.tgz"
pnpm exec penjaga-validate /path/to/dataset
```

The flexible bucket API below is available in published v3.0.0 and later
archives; v2.0.0 keeps its original `count`-only bucket schema. To test current
source locally, run `pnpm pack:validator` from the workspace root, then install
the resulting archive with
`pnpm add --save-exact --ignore-scripts /absolute/path/to/the/archive.tgz`.

Published releases through v1.1.0 retain their original package and CLI names.
For example, this existing release remains installable:

```sh
VERSION=1.1.0
pnpm add --save-exact --ignore-scripts \
  "https://github.com/budaya-lab/penjaga/releases/download/v${VERSION}/lazydata-validator-${VERSION}.tgz"
pnpm exec lazydata-validate /path/to/dataset
```

That historical archive exports `@lazydata/validator`, not `@penjaga/validator`.
The API examples below target the renamed source package. Pin the chosen archive
URL and commit the lockfile. Consumers need no compiler or build step; packages
are not published to a registry.

## Portable API

These functions perform no I/O and do not mutate inputs.

| Function | Result |
| --- | --- |
| `validatePolicy(policy)` | Error strings; `[]` means valid. |
| `validateMetadata(data, policy)` | Metadata error strings. |
| `getStage(keywords, policy)` | Stage or `undefined`. |
| `stageLabel(keywords, policy)` | Stage label or `undefined`. |
| `parseBuckets(textOrBytes)` | `{ labelColumn, valueColumn, rows }`. |

```ts
import { validateMetadata } from '@penjaga/validator';
import policy from '@penjaga/validator/policy' with { type: 'json' };

const errors = validateMetadata(descriptor, policy);
```

Metadata/stage functions throw for invalid policy; `parseBuckets` throws for
invalid CSV. Stage helpers allow missing catalogue stages but reject malformed
keywords, duplicate stages and unknown stages.

### Bucket CSV

`buckets.csv` has exactly two columns: item labels first, numeric values second.
Both headers may have any nonblank name, but must be distinct after trimming.
Labels are unique, nonblank strings; numeric-looking labels such as `001` remain
strings. Numeric values may be non-negative integers or floats, including decimal
exponents. Negative values, empty cells, non-decimal syntax, `NaN`, infinity,
overflow and underflow to zero are rejected. Integral results must be safe integers.
The file must contain at least one data row and be valid UTF-8/CSV within 1 MB.

```ts
import { parseBuckets } from '@penjaga/validator';

const buckets = parseBuckets('items,Mean score\nA,0.75\nB,0\n');
// { labelColumn: 'items', valueColumn: 'Mean score',
//   rows: [{ items: 'A', 'Mean score': 0.75 }, { items: 'B', 'Mean score': 0 }] }
const values = buckets.rows.map((row) => row[buckets.valueColumn]);
```

**Public API migration:** `Buckets` now requires `valueColumn`; `BucketRow` no
longer guarantees a `count` property. Read the numeric field with
`row[buckets.valueColumn]`. Existing label-plus-`count` CSV files still work,
but do not assume that every numeric column is named `count`. These public type
changes shipped in v3.0.0; v2.0.0 consumers do not include the flexible bucket
API. Resource metadata `count` remains a non-negative safe integer; this change
applies only to buckets.

## Local repository API

```ts
import { validateDataPackage } from '@penjaga/validator/repository';

const errors = validateDataPackage(descriptor, datasetRoot);
```

The root defaults to the current directory. This Node-only adapter uses its own
bundled policy, never dataset-local configuration. Descriptor/filesystem issues
return error strings; unreadable or invalid bundled policy throws.

The CLI also defaults to the current directory. Use `--help` for usage; exit codes
are 0 for valid and 1 for errors. It never runs dataset-local scripts.

Validation does not edit files, count resources or infer metadata. These are
selected checks, not full Data Package conformance or permission to publish.
See [policy](dataset.config.json) and the
[validation reference](https://github.com/budaya-lab/penjaga/blob/main/docs/reference.md#validation)
for field rules, limits and safety boundaries.
