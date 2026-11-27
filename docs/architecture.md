# Architecture

## Package boundaries

```text
Portable consumers ──> @penjaga/validator
                        metadata / policy / stages / bucket parser

Node tools ───────────> @penjaga/validator/repository
                        portable checks + bundled policy + filesystem checks

CLI ─────────────────> repository adapter
Steward checks ──────> portable metadata checks
Steward resource UI ─> separate bounded read-only counter
```

The validator owns shared rules and matched policy. Portable APIs perform no I/O
and accept untrusted values. The Node adapter loads the package's bundled policy
and checks referenced paths and optional root buckets. Neither entry point
modifies files, runs dataset code, counts resources or establishes publication
authority. API details and release procedures are in the
[validator reference](reference.md).

## Steward data flow

The SvelteKit app runs locally against an explicit `DATASET_ROOT` parent. Server
loads discover immediate `ds-*` directories. The dashboard returns folder names,
metadata status, allowlisted summary values and read-only metadata Git state,
not descriptor text or private resource paths. Git state reuses the detail
view's safe branch inspector: current branch, changes to `datapackage.json` and
marked generated `README.md`, and ahead counts from local tracking refs. It does
not fetch, refresh the index or scan research files. Git-unavailable rows retain
their independent metadata status.
Dataset detail defaults to README; Metadata and `datapackage.json` are separate
views. README, Metadata, JSON and Portal share a semantic section/header layout
and one content width; navigation still preserves the dataset-scoped draft.
The reader accepts only discovered datasets and the fixed filenames
`README.md`, `datapackage.json` and optional `buckets.csv`. The README view parses
buckets with the shared parser and shows a local shadcn-svelte/LayerChart bar
chart and values table, capped at 100 rows in file order. Missing buckets are
omitted; invalid files show a warning without blocking the README. No chart
assets are written or added to generated READMEs.

README Markdown is parsed on the server into an allowlisted tree. Svelte renders
escaped text and elements; raw HTML and images are disabled, and only credential-
free HTTPS links are clickable. Recognized task/project/stage/version Shields image tokens
become escaped local Badge components; no image URL is sent to the client or
fetched. Other image tokens remain alt text. Reviewed template fingerprints identify exact
README matches only; they do not establish provenance.

Metadata checks use the portable validator and matched policy. They do not read
resource files or infer, migrate or normalize metadata. The Metadata form edits
one page-scoped working object; the JSON preview and checks use its
`JSON.stringify` output. Unknown properties and metadata on surviving rows are
preserved. Strict admission rejects malformed or duplicate-key JSON and unsafe
number conversions. Formatting and equivalent number notation may normalize.

After Metadata has opened, shallow Metadata/JSON navigation retains the form,
draft and loaded revision. README tab navigation uses `goto` with `refreshAll`
to re-run server loads even when returning from a shallow URL to the underlying
README route. It keeps the dataset-scoped draft and does not reload the document. Failed or pending inputs remain visible and do not
silently replace the last representable JSON. A direct JSON visit shows saved
text until Metadata is opened. Reset remains disabled. Direct JSON editing and
dataset creation are not implemented.

Explicit Save posts the serialized document as UTF-8 `application/json` to
`/datasets/[name]/save`. The server bounds the body to 5 MiB, repeats strict
admission and shared metadata checks, then replaces only the discovered dataset's
existing regular descriptor using an exclusive same-directory temporary file,
file sync and atomic rename. Policy issues are reported but do not block saving
incomplete work. No resource contents are read. Success advances the browser's
saved baseline without replacing newer edits or row identities; failure retains
the draft. This single-user version assumes no external changes and has no
revision/conflict protocol. Basic mode and ownership survive; ACLs and extended
attributes do not.

After descriptor Save, passing metadata checks trigger an app-only README
renderer/writer. It uses the saved object, existing resource counts and optional
`buckets.csv` through the shared `parseBuckets` API. It never counts resources or
changes the descriptor/buckets. The same bounded reader admits this additional
fixed filename with a 1 MB limit. README generation preserves notes after
`<!-- notes -->`, keeps unmarked handwritten text and discards only exact
reviewed templates. It caps output at 5 MiB and atomically replaces changed
README bytes using the same writer as the descriptor. A README failure returns a
separate warning with metadata Save success. The writes are not a two-file
transaction. Generated READMEs start with title, name/Created-date subtitle,
badges and escaped description paragraphs. Contributors/sources use lists;
resources/buckets keep comparison tables. Version joins the badge row when
supplied. The viewer suppresses Penjaga's known bookkeeping markers (and the legacy generated header) and
honors Markdown's hidden tight-list paragraph tokens. Portable validation remains read-only. See
[Save usage](../apps/web/README.md#save).

## Explicit dataset Git operations

The Metadata footer displays the current dataset branch, saved-file changes and
locally unpushed commit count. A read-only no-store `/datasets/[name]/git` endpoint
refreshes this state after Save/push, without network fetches, index writes,
rename detection or clean filters. Clean datasets disable commit/push. The editable
predefined message appears only in a native confirmation dialog, not the form. A separate same-origin POST to `/datasets/[name]/commit` commits
and pushes only saved metadata and a marked generated README. It rechecks the
submitted document against the saved descriptor and shared metadata checks.
Path-limited Git commits preserve unrelated index/worktree changes. Ordinary
resource bytes, bucket data and source history are not read or fetched; hooks
are disabled and clean filters are refused. Saved incomplete metadata remains
possible, but Commit & push requires passing checks.

The source must be its own repository with matching credential-free GitHub
origin fetch/push destinations. Read-only remote refs establish the destination;
main/master/remote-default/detached branches and remote advancement are refused.
Only metadata/README may appear in existing ahead commits; otherwise the push
is blocked before committing. No automatic merge, local branch creation or
force-push occurs. A new remote feature branch can be based on the verified
remote default tip. Operations serialize per dataset; failed pushes retain a
local commit for a duplicate-free retry. This is the only user-approved source
Git-write flow; Save and portal submission do not invoke it automatically.

## Portal proposals

The web app manages a dedicated, marked clone of `budaya-lab/data-portal` at
`~/.cache/penjaga/data-portal` by default, outside the dataset root. An optional
absolute `PORTAL_CLONE` overrides that location. Empty/relative overrides and
existing unmarked directories are refused; it does not adopt developer checkouts.
Opening the dataset's Portal tab (or refreshing its preview) fetches and
fast-forwards local portal main, then prepares an entry comparison without
applying proposal edits. The source reader checks the current dataset branch's pushed
head through local `gh` authentication. It reads only a verified regular root
descriptor at that SHA and compares its parsed metadata with the saved file.
Git database metadata avoids file-diff endpoints; source histories and ordinary
resource bytes are never fetched. Unsaved edits block the UI action. A saved/pushed
mismatch returns a typed `needs-push` result before clone/dependency work, carrying
only the two descriptors and verified source identity/branch/SHA. The Portal tab
shows its readiness checklist, local-vs-GitHub diff and Metadata navigation rather
than treating this expected state as a generic error. Failures from external
commands identify their safe workflow stage without exposing command output.

The app-local adapter matches the pushed Data Package `name` to the exact
catalogue `slug`; repository names and provenance `sources[]` never select an
entry. Duplicate slugs stop the operation. It preserves catalogue identity,
publication, dates and confirmed lineage. New entries remain drafts. Supported
source-owned metadata replaces catalogue values, including sources, version and
supplied totals; absent optional values remove stale catalogue values. Source
links must be credential-free HTTPS without queries/fragments. Private resource paths stay
metadata-only; counts are supplied, not inferred. Resource membership and order
come from the pushed descriptor, with existing public bucket summaries retained
as an approved exception when not already listed. Other portal-only listings
are removed; a declared bucket resource is not duplicated. Resource metadata is replaced, not merged with
stale portal values. No resource files are copied or deleted. Public download
updates keep reviewed release URLs for listed resources; new or changed public
mappings require separate review and are blocked here.

Explicit disclosure confirmation creates/updates a per-repository portal branch
and PR using local Git/gh credentials. HTTPS Git calls delegate to the existing
`gh` login via per-command credential-helper options, not persistent Git settings
or token-bearing arguments/remotes. Git failures name the allowlisted operation
without exposing arguments/output. The server rechecks the preview, runs the
unchanged portal's `pnpm validate`, rechecks source identity/visibility and portal
main, and stages only `datasets.json`. Preview and changed submission prepare
dependencies on verified portal main with a frozen pnpm install, disabling
lifecycle scripts and pnpmfile hooks. Portal pnpm subprocesses omit the inherited
Steward `NODE_ENV`, so development/production server mode cannot alter portal
installs or its test/build modes. Setup rechecks repository cleanliness and
refuses linked dependency directories. Install failures stop before catalogue
writes and can be retried from the tab. Unexpected files or stale inputs stop the
operation. On the next retry, failed writes/validation and other unfinished
tracked/staged/untracked edits are preserved in a named local Git recovery stash
before switching to portal main. Recovery runs only after clone marker/path/remote
verification, and stops on failure; it never applies/drops/pushes stashes. Preview
notes expose the recovery ID. Ignored caches and committed proposal branches stay
in place. No automatic reset, global tool installation, PR merge or source Git write occurs. The app
serializes portal operations within its single local process. Portal application
code/workflows and the portable validator are unchanged. See
[portal setup](../apps/web/README.md#portal-submission).

## Filesystem boundaries

README and descriptor reads require discovered directory names and fixed
filenames. The reader uses bounded UTF-8 reads, no-follow opens, regular
single-link files and identity checks. These checks detect ordinary races but
are not a sandbox against hostile concurrent filesystem changes.

Resource path suggestions list safe root entries without reading their contents.
A separate GET endpoint counts a selected resource on demand. It refuses unsafe
paths, links and special files, and returns totals/status only. CSV/TSV, JSON,
JSONL and directory counts have byte, entry, depth, concurrency and time limits.
Counts are display-only and never enter metadata or shared validation. See the
[Steward README](../apps/web/README.md) for local usage and checks.

## Build and verification

The app imports compiled public exports from the workspace validator. App
`dev`, `build` and `check` compile the validator first. The app's browser bundle
and VM probe check portable draft code; they are not interactive browser tests.
Tests use synthetic temporary datasets. Read-only routes leave files unchanged;
Save tests cover exact descriptor replacement, refused input, README generation,
note preservation, optional bucket handling and pre-rename failure cleanup.
CI runs validator checks/tests and Steward checks/tests. ESLint is available
locally with `pnpm lint` but is not a CI step.
