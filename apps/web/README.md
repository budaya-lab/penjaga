# Local Dataset Steward

A local SvelteKit app for datasets under `DATASET_ROOT`. It discovers
immediate `ds-*` directories, shows metadata status, and opens each dataset's
README by default. Directories without a descriptor remain visible. The dashboard
supports search and metadata-status filters. Its Branch and Git status columns
show the current branch, saved metadata/generated README changes, locally known
unpushed commits and missing upstream tracking. These read-only checks never
fetch source history or scan research files. Unavailable Git state does not hide
the dataset or change its metadata status. Refresh reloads both statuses.

## Views

All dataset views share one content width, section heading, description and
spacing. Read-only previews scroll within their content area; Metadata keeps its
form navigation and explicit Save/push actions. Portal review uses the same
section layout rather than a separate card treatment.

- **README** renders Markdown as escaped text and allowlisted elements. Embedded
  HTML and images are disabled. Only credential-free HTTPS links are clickable.
  Task/project/stage/version Shields badges render as local app badges, without fetching
  their images. Other images remain text-only.
  Exact matches to reviewed template README fingerprints are labelled; this does
  not prove dataset origin or quality. Opening the README tab requests fresh
  server data without a full-page reload, so saved changes appear immediately.
  Optional root `buckets.csv` appears as a local horizontal chart with a values
  table, using its supplied headers. The view shows at most 100 buckets in file
  order and flags invalid files. No chart assets or README changes are written.
- **Metadata** provides local form controls for Overview, Keywords, Resources,
  Sources, Licenses and Contributors, plus shared metadata checks. Edits update
  one in-memory object. They appear in the read-only `datapackage.json` preview
  after Metadata is opened and survive switching between the views. **Save
  changes** writes the draft to the dataset's existing descriptor and generates
  its README when metadata checks pass. Reset remains
  disabled; direct JSON editing and dataset creation are not implemented.
- **datapackage.json** displays the saved JSON as escaped text unless Metadata
  has been opened in the current page session, in which case it previews the
  synchronized draft. Normal JSON serialization may change whitespace, escapes
  and number notation. Editing requires strict object JSON with unique keys and is
  bounded to 5 MiB, 128 levels and 100,000 values. Malformed documents and unsafe
  numbers remain viewable but cannot be edited.

Checks use the shared validator and re-run locally 500 ms after edits. They do not
read resource contents. Metadata policy remains authoritative; the form does not
repair or infer values. Unknown properties and metadata on surviving rows are
preserved. A failed or pending edit stays visible and is not silently represented
as saved data.

Overview requires Name, Title and Description. Version and Created are optional;
Created preserves its supplied timestamp until changed, then uses local midnight
for the selected date. Keywords provides Tasks, Projects, Stage and optional
extra tags. Sources accept a safe relative path or a fully qualified HTTP(S) URL;
URLs are never fetched. Licenses allow custom names with common SPDX suggestions.
Contributors map Name to Data Package `title` and support optional Roles.

Resources allow local row edits and safe root-path suggestions. Choosing a path
also fills and synchronizes its generated Name and Format, while preserving manual
overrides. The path extension selects the live counter, even when Format is
overridden. Unsupported formats are marked “Not countable”; read and safety
failures are not reported as zero. Live counts never enter the metadata draft.

The word “count” refers to different values:

- **Live Resource counter:** CSV/TSV data rows (header excluded), top-level JSON
  array items, nonblank JSONL records, or visible regular files recursively inside
  a selected directory. Directory counts do not inspect or count rows inside those
  files; dot-prefixed files and directories are omitted.
- **`datapackage.json` `resources[].count`:** a supplied, non-negative safe
  integer for the resource's item count. Steward does not infer or update it from
  live counts.
- **`buckets.csv` numeric values:** metrics associated with bucket labels, not
  resource item counts or directory file totals. Values may be non-negative
  integers or decimals.

## Save

Save sends the current JSON draft to one same-origin endpoint. The server repeats
strict JSON admission and shared metadata checks, then writes the exact text using
a same-directory temporary file and atomic rename. Metadata policy issues do not
block saving incomplete work; malformed or unsafe JSON does. Unrepresentable form
inputs block Save. Failed requests retain the draft; edits made during a save
remain unsaved until the next Save.

This first version assumes one user and no external file changes. There is no
revision/conflict detection: Save overwrites the descriptor currently on disk.
Basic file permissions and ownership are retained, but ACLs and extended
attributes are not preserved. After the descriptor is saved, passing metadata
checks trigger `README.md` generation. The README includes supplied metadata,
existing descriptor resource counts and optional `buckets.csv` (item labels
followed by non-negative numeric values, at most 1 MB). Both supplied column
headers appear in the generated table. Resource `count` still requires a
non-negative safe integer. Save never scans resources, recalculates counts or
changes bucket files.
The generated layout is title, name/Created-date subtitle, badges (including
Version when supplied), then description paragraphs. Contributors and sources
use lists; only resources and buckets use tables. The subtitle shows the supplied
Created calendar date without timezone conversion; missing dates/versions are
omitted. The viewer hides Penjaga's generated header, its legacy header and the notes delimiter, not
arbitrary HTML, and renders tight lists without extra paragraph wrappers.

Text below `<!-- notes -->` is kept exactly. An unmarked handwritten README is
moved below that marker; only exact reviewed template bytes are discarded.
Missing READMEs are created privately (mode `0600`). Existing READMEs require a
regular, single-link UTF-8 file, and retain basic permissions and ownership.
Generation is bounded to 5 MiB; identical output is not rewritten. Metadata issues
skip generation. Unreadable/invalid buckets or README write failures leave the
README untouched and show a warning without undoing a successful metadata Save.
The two files are replaced separately, not as one transaction.

## Commit and push

The Metadata footer shows the dataset's **current Git branch** and distinguishes
unsaved edits, saved files needing a commit, and local commits waiting to be pushed.
**Commit & push** is disabled when nothing needs sending, while checks are pending,
or while edits remain unsaved/invalid. Git status refreshes after Save and push;
**Check Git** reloads it after external Git work. The status uses local tracking
refs; the push and Portal checks separately verify GitHub's actual branch.

The commit message is not a permanent form field. Click **Commit & push** to open
a confirmation dialog listing the saved files and destination branch. Only there
can you edit the default `chore(metadata): update dataset metadata` message in a
textarea and confirm the push. Multiline subject/body messages are supported
within the existing 200-character limit. If only an existing commit needs pushing, **Push changes** opens
a confirmation without making another commit. The browser supplies dialog focus
and Escape handling; closing is disabled while the confirmed request runs.
Save remains local and independent. Metadata checks must pass.

Steward commits only `datapackage.json` and a Penjaga-generated `README.md` when
present. Handwritten READMEs and unrelated staged/unstaged files stay untouched.
The explicit commit uses your Git identity and editable message; dataset hooks
and metadata clean filters never run. Research files and buckets are not read,
staged or committed by this operation.

The dataset must be its own Git repository, with credential-free GitHub origin
fetch/push URLs for the same repository. GitHub access uses the existing local
Git/gh credentials. Steward refuses main/master/the remote default branch and
detached HEAD. It can create the current feature branch on the remote, but does
not create local branches. It checks remote refs without fetching source history.
If the remote advanced, reconcile it in Git; Steward never merges or force-pushes.
Existing unpushed commits must also touch only metadata/README, so a metadata
push cannot silently publish unrelated research changes.

Commit/push requests are same-origin and bounded. Save is disabled during the
operation, the cursor shows busy, and newer form edits remain unsaved. A failed
push leaves the commit local; retrying reuses it rather than making duplicates.
Portal submission remains a separate preview/confirmation step after this push.

## Portal submission

The **Portal** tab previews catalogue content and prepares a catalogue-data PR
using a dedicated local clone of `budaya-lab/data-portal`. Opening the tab loads
a readiness checklist for Save → Push to GitHub → Review portal PR, then a unified
current-to-proposed JSON diff; **Refresh preview** reloads it. A saved/pushed
mismatch is an expected **needs push** state, not a generic failed action: it shows
the actual repository/branch/pushed commit, a GitHub-versus-saved diff and an
**Open Metadata to commit & push** link. No catalogue setup/write is attempted
until those metadata snapshots match. Real errors identify source verification,
portal setup, validation, proposal push or PR creation, with a next action. The diff marks added/removed lines, shows unchanged context and line
numbers, and can be focused for keyboard scrolling. During submission the page
uses a busy cursor and the action reads **Submitting…**; both reset when the
request finishes or the tab is left.
No portal code or workflow changes are needed. Save remains local; it never
commits, pushes or submits metadata.

Only `DATASET_ROOT` is required:

```sh
DATASET_ROOT="/absolute/path/to/datasets" pnpm --filter @penjaga/steward dev
```

Steward uses `~/.cache/penjaga/data-portal` as its dedicated portal clone.
Optionally set `PORTAL_CLONE` to a different absolute path outside
`DATASET_ROOT` and developer checkouts. Empty or relative overrides are refused.
Existing unmarked directories are never adopted, including at the default path.

Use the existing local GitHub CLI login. The `gh` account must read source
metadata, push portal branches and create/edit portal PRs. Portal HTTPS Git calls
use `gh auth git-credential` as a per-command helper; Steward does not modify
saved Git/gh authentication settings or put tokens in arguments, remotes or app
forms. Your Git commit identity must be configured.
No login or permission change runs automatically. Steward installs the portal's
locked dependencies inside its dedicated clone; Git, `gh`, Node and pnpm must
already be installed.

1. Save the dataset metadata, then use **Commit & push** in Metadata (or Git
   manually) on its current source feature branch. The dataset must be its own Git repository with a credential-free
   GitHub origin (`https://github.com/ACCOUNT/REPO.git` or
   `git@github.com:ACCOUNT/REPO.git`). Unsaved edits block the action; saved metadata
   must match the pushed branch snapshot. No manual SHA entry is needed.
2. Open **Portal**. On first use, Steward clones portal main into
   the new directory and marks it as app-managed. Existing unmarked directories,
   symlinked paths and unexpected remotes are refused. In a verified app-managed
   clone, unfinished tracked/staged/untracked edits are saved in a named local
   recovery stash before retrying from main; nothing is reset or discarded.
   Preview fast-forwards local main and automatically prepares its dependencies
   with `pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile`.
   Dependency/project install scripts and pnpm hooks are disabled. This does not
   apply catalogue edits or create a PR. Committed proposal branches are retained.
3. Wait for setup to finish. Steward repeats the frozen install on preview and
   before a changed submission, so refreshed portal dependencies stay aligned.
   Installation failures stop before catalogue writes; use **Refresh preview**
   to retry after fixing network/tooling issues. Unexpected install edits stop
   that attempt and are preserved in a recovery stash on the next retry. No
   global tools are installed. Portal package commands do not inherit Steward's
   `NODE_ENV`: installs include development tools, and the portal chooses its
   normal test/build modes.
4. Review the current/proposed entries and confirm their **public disclosure**.
   Metadata for private repositories, restricted listings and PR branches are public.
   Select **Create / update portal PR**. Steward writes only `datasets.json` on a
   per-dataset branch, runs the existing portal checks, pushes and creates/updates
   its PR. Open the returned link for review; nothing auto-merges.

Existing identity, publication, dates, confirmed parents and portal-only fields
survive. Matching uses the pushed Data Package `name` as the exact portal `slug`,
not the GitHub repository name or `sources[]` provenance links. Duplicate slugs
stop the action. Source titles/descriptions/keywords/licences/sources/resource
listings, version and supplied counts replace their catalogue counterparts;
omitted optional source-owned values are removed, not retained as stale metadata.
The current repository landing page is included. Source links require
credential-free HTTPS without query strings or fragments. Unsupported or unsafe
mappings stop the proposal instead of silently keeping old metadata. Counts are
not calculated and parents are not inferred. Restricted listings never become
data links. Source metadata checks must pass, even though local Save allows
incomplete work.

Portal resources follow the dataset's `resources` array and order, with one
explicit exception: retain an existing public `buckets` summary even when the
dataset does not declare it. This keeps the chart/download available. Other
portal-only resources are removed. A declared `buckets` resource takes precedence
so the entry is never duplicated. Existing summary bytes are not refreshed. Supplied titles/formats/counts replace old values; omitted
counts are removed. No resource files are copied, refreshed or deleted.
Restricted paths remain metadata-only, with the portal's directory-path syntax.
Public resources retain only existing reviewed release URLs; new or changed
public download mappings are blocked rather than guessed. Portal format/path
rules still apply.

The confirmation is tied to the previewed source and portal base. Changed inputs
require another preview. Validation or write failures leave recoverable edits in
the managed clone. **Refresh preview** automatically saves unfinished tracked,
staged and untracked work in a local Git recovery stash and starts from portal
main. The preview notes show the recovery stash ID; use `git stash list` in the
clone to find saved attempts later. Stashes are never automatically applied,
dropped or pushed. Ignored dependency/build caches stay in place. If Git cannot
preserve the work, Steward stops without resetting or deleting it. Developer
checkouts and dataset repositories are never stashed. Push/PR failures retain the
proposal commit/branch for retry. Never edit proposal branches as general working
branches. Conflicting changes from another PR may require manual resolution.
Some existing portal tests pin historical wording/keywords/counts; an intended
source update can fail those checks. Steward reports the failure and does not
rewrite or bypass portal tests. Run `pnpm validate` in the clone to inspect details.

Submission never clones/fetches source histories, reads ordinary resource bytes
or file patches, executes dataset scripts, changes source Git state, or updates
source metadata/README files. It reads only the fixed descriptor and bounded Git
metadata. Credentials stay server-side. Continue to run this single-user tool on
loopback only. Portal code remains unchanged; superseded portal PR #49 is not used.

## Run locally

Use Node.js 24+ and pnpm 12.x. Install from the `penjaga/` workspace root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
DATASET_ROOT="/absolute/path/to/datasets" pnpm --filter @penjaga/steward dev
```

`DATASET_ROOT` must name the parent directory, not a dataset. To open the
three included demo datasets from the repository root, run:

```sh
DATASET_ROOT="$PWD/datasets" pnpm --filter @penjaga/steward dev
```

The demos show valid countable CSV/JSON/JSONL resources plus an uncounted PDF,
metadata issues and an unavailable descriptor. See [`datasets/README.md`](../../datasets/README.md)
for details. The development server binds to loopback. For a built server:

```sh
pnpm --filter @penjaga/steward build
DATASET_ROOT="/absolute/path/to/datasets" pnpm --filter @penjaga/steward start
```

The start wrapper binds to `127.0.0.1` and uses port 3000 unless `PORT` is set.
Do not expose or reverse-proxy this local tool onto a network.

README, descriptor and bucket reads are limited to discovered datasets and the
fixed filenames `README.md`, `datapackage.json` and `buckets.csv`. They are bounded
to 5 MiB (1 MB for buckets) and require regular, single-link UTF-8 files. The
separate resource counter reads only safe selected paths and has byte, traversal,
depth and time limits. Directory
counts omit dot-prefixed files and directories. These checks
reduce risk but do not sandbox hostile concurrent filesystem changes. Only an
explicit Save writes the descriptor and, when checks pass, its generated README.

## Checks

From the workspace root:

```sh
pnpm lint
pnpm --filter @penjaga/steward check
pnpm --filter @penjaga/steward test
```

Tests use temporary fixtures and exercise dev/build HTTP behavior. A Vite bundle
and VM probe checks that browser draft code has no Node built-ins; it is not an
interactive browser test. CI runs the app check and tests, but not ESLint.

The full dependency audit reports one owner-deferred moderate `minimatch`
advisory in the lint dependency graph
([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)). No
override or advisory ignore is configured. Recheck it during dependency updates
and before release; this is not release clearance.
