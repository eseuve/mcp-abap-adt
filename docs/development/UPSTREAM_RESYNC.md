# Upstream Re-sync Procedure

How to pull new upstream (`fr0ster`) releases into our two forks while keeping
the fixes that are not yet upstream. This is a recurring chore; the
`upstream-resync` skill automates the mechanical parts, this doc explains the
*why* so you can handle the parts that need judgment.

## The two repos are version-locked

| Repo | Package | Local path | Canonical branch |
|------|---------|-----------|------------------|
| core | `@mcp-abap-adt/core` | `mcp-abap-adt` | `local/all-features` |
| clients | `@mcp-abap-adt/adt-clients` | `mcp-abap-adt-clients` | `feat/cds-type-client` |

Core delegates **all** ADT URL building to clients. They ship on independent
version tracks, so **you cannot rebase each onto its own tip independently.**

> **THE gotcha.** Core's `package.json` declares the clients version it was
> built against (`"@mcp-abap-adt/adt-clients": "^8.0.0"`). The clients repo tip
> may be *ahead* of that (e.g. `v9.0.0`). A newer clients major drops/renames
> exported types, so pairing latest-core with latest-clients **fails to
> compile** with dozens of `has no exported member 'IPackageConfig'`-style
> errors in *upstream* core files.
>
> **Rule:** pick the latest core, read its declared `adt-clients` range, and
> rebase clients onto the matching tag (`vX.0.0`), **not** the clients tip.

## Remotes (push targets are the eseuve forks only)

```
# core:    origin  = git@github-eseuve:eseuve/mcp-abap-adt.git         (fork)
#          upstream= git@github.com:fr0ster/mcp-abap-adt.git
# clients: fork    = git@github-eseuve:eseuve/mcp-abap-adt-clients.git (fork)
#          origin  = git@github.com:fr0ster/mcp-abap-adt-clients.git   (upstream)
```

Push **only** to the eseuve forks, using the `github-eseuve` SSH alias. Never
push to `fr0ster`. Never let the real customer namespace, transport numbers,
or the system id appear in any commit message or diff — replace them with the
placeholders `/NSP/`, `<TRANSPORT>`, `<system>`. Real values live only in
gitignored `tests/test-config.yaml` and agent memory.

## The keep/drop matrix — check every fix against upstream first

Before carrying a commit forward, check whether the maintainer already merged
an equivalent. If they did, **drop ours** (redundant). If not, **keep**.

Cheap probes:

```bash
# clients: is our DDLX namespace fix still needed?
git show origin/main:src/core/metadataExtension/read.ts | grep -n "toLowerCase\|encodeSapObjectName"
# clients: is our CdsType client still absent upstream?
git ls-tree origin/main:src/core | grep -i cdstype
# core: are our tools still absent upstream?
git ls-tree upstream/main:src/handlers | grep -iE "table_entity|cds_type"
# core: did our CreatePackage 409 fix land? (grep for isLockConflict)
git show upstream/main:src/handlers/package/high/handleCreatePackage.ts | grep -n isLockConflict
```

History of decisions:

| Fix | Status | Action |
|-----|--------|--------|
| BDEF namespace URL-encoding (clients) | **landed upstream** (v6.x) | dropped |
| DDLX/metadataExtension namespace URL-encoding (clients) | still raw `.toLowerCase()` | **keep** |
| CdsType DRTY client (clients) | absent upstream | **keep** |
| `getVersions`/`getVersionSource` for CdsType (clients) | required by `IAdtObject` (v7.0.0) | **keep** (adaptation) |
| TableEntity tools ×6 (core) | absent upstream | **keep** |
| CdsType tools ×6 (core) | absent upstream | **keep** |
| CheckMetadataExtension active-version default (core) | upstream still defaults inactive | **keep** |
| CreatePackage 409 lock-vs-exists (core) | upstream treats all 409 as "exists" | **keep** |

## Our carried commits (the keep set)

**clients — 5 commits off `v8.0.0`:**
1. `feat(cdsType)` — DRTY CDS type client (cloned from behaviorDefinition)
2. `test(cdsType)` — namespace URL-encoding unit tests
3. `docs(cdsType)` — JSDoc cleanup + `CT_CDS_TYPE`
4. `fix(metadataExtension)` — URL-encode namespaced names (the DDLX fix)
5. `feat(cdsType)` — `getVersions`/`getVersionSource` (v7.0.0 `IAdtObject`)

**core — off `v8.13.0` (v8.x line):** TableEntity ×6 (guard+scaffold, Create,
Update, Get, Delete, register) + 2 gated live tests; CdsType ×6 + 1 gated live
test; DDLX active-version default fix ×2; CreatePackage 409 fix ×1; plus two
adaptation commits (see below) and the dependency repin.

## Breaking-change adaptations we have had to make

- **View → Ddl rename (clients v6.0.0).** Clients `getView()` → `getDdl()`;
  core's `view/high/handleXView` → `ddl/high/handleXDdl`; arg/response fields
  `view_name`→`ddl_name`, `view_source`→`ddl_source`, `view_data`→`ddl_data`.
  Our TableEntity handlers **delegate** to the Ddl handlers, so they must be
  re-pointed each time. Shortcut: `git checkout <backup-tag> -- src/handlers/table_entity/high/*.ts`
  copies the already-adapted versions (they match the current Ddl handler
  signature — verify with `grep ddl_name` on `upstream/main:.../ddl/high/*`).
- **`IAdtObject` version history (clients v7.0.0).** Added `getVersions` /
  `getVersionSource`. Our CdsType client predated it; `src/core/cdsType/versions.ts`
  mirrors `behaviorDefinition/versions.ts` against the DRTY endpoint
  `/sap/bc/adt/ddic/drty/sources/{name}/source/main/versions`.

When a cherry-pick conflicts in a re-export barrel (`src/index.core.ts`) or a
namespace file (`metadataExtension/*.ts`), take the **upstream** side
(`git checkout --ours <file>`) and re-apply our small addition on top — do not
keep our stale copy of the surrounding code.

## The dependency pointer

Upstream core's `package.json` says `"@mcp-abap-adt/adt-clients": "^8.0.0"`,
which `npm install` resolves to the **published** package — which lacks our
CdsType client and DDLX fix. Repin to the local fork so core consumes our work:

```json
"@mcp-abap-adt/adt-clients": "file:../mcp-abap-adt-clients"
```

Commit this repin. It is one of the carried changes.

## Verification gates ("secured")

```bash
# clients
cd mcp-abap-adt-clients && npm install && npm run build \
  && npx jest src/__tests__/unit/core/cdsType src/__tests__/unit/core/metadataExtension

# core (against the local clients build)
cd mcp-abap-adt && npm install && npm run build && npx jest
```

- Run plain `npx jest` for core. The default config **already ignores**
  `__tests__/admin/` (shared-object setup) and `__tests__/integration/` (both
  need a live SAP system). Do **not** pass `--testPathIgnorePatterns=integration`
  — that *replaces* the ignore list and drags the live admin tests in, which
  then "fail" for lack of a connection.
- Expected green: clients build + 8 namespace unit tests; core build + full
  unit suite (~530 tests).

## Leave it running locally

The global `mcp-abap-adt` binary is symlinked to this working copy; it runs
`dist/server/launcher.js` and loads clients via
`node_modules/@mcp-abap-adt/adt-clients` → symlink → `../mcp-abap-adt-clients`.
So **both `dist/` must be rebuilt** and the MCP reconnected:

```bash
cd mcp-abap-adt-clients && npm run build
cd mcp-abap-adt && npm run build
# then in the client: /mcp   (reconnect so the server reloads the new dist)
```

Live smoke test through the reconnected MCP (proves clients namespace path +
core delegation end-to-end):

- `GetCdsType <ns>/<enum>` → returns the DRTY `define type` source
- `GetDdl <ns>/<view>` → returns the view source (View→Ddl + encoding)
- `CheckMetadataExtension` tool schema shows `version` "Default: active"

## Backups & branch promotion

Before rebasing, tag the current canonical tip on each repo
(`backup/core-pre-resync-<ver>`, `backup/clients-pre-resync-<ver>`). Do the work
on a throwaway `resync/*` branch; once green, `git branch -f <canonical>
<resync>` and check it out. Nothing is pushed until you (the human) decide to.

## Environment notes

- macOS ships **zsh**, which does **not** word-split unquoted variables. A
  `for c in $commits` loop over a space-joined string passes the whole string as
  one arg. Use an explicit literal list or a real array.
- macOS BSD `sed` has no `\|` alternation in basic regex — use `sed -E` or
  `perl -pi`.
- husky's pre-commit hook runs the build. If you must commit while a transient
  cross-repo mismatch makes the build fail, use `git commit --no-verify`; prefer
  fixing the build first.
