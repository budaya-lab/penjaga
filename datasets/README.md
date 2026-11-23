# Steward demo datasets

Run Steward against this directory from the Penjaga repository root:

```sh
DATASET_ROOT="$PWD/datasets" pnpm --filter @penjaga/steward dev
```

The three `ds-*` folders demonstrate separate dashboard states:

- `ds-steward-demo-valid`: valid metadata and real CSV, JSON array, JSONL and PDF resources. Steward can count the first three formats; PDF is unsupported for record counting.
- `ds-steward-demo-metadata-issues`: parseable metadata with three intentional validation issues. The unsafe resource path is only a descriptor value; no file is read.
- `ds-steward-demo-unavailable`: a discoverable folder with no `datapackage.json`, so its metadata status is Unavailable.

All content is synthetic. The samples are demonstrations, not real data or claims about licensing, provenance or access rights. The unavailable state is represented by a missing descriptor so it works consistently across operating systems; it does not change filesystem permissions.
