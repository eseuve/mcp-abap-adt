---
name: upstream-resync
description: Re-sync the mcp-abap-adt (core) and mcp-abap-adt-clients forks onto new fr0ster upstream releases while carrying forward only the fixes not yet upstream. Use when the user asks to update/import upstream, sync the forks, "actualiza nuestros repositorios", or pull new adt-clients/core versions.
---

# Upstream Re-sync

Rebase both forks onto new upstream, keep only our still-unique fixes, verify,
leave running locally. Full rationale: `docs/development/UPSTREAM_RESYNC.md` —
read it if a step surprises you.

Paths: core = `mcp-abap-adt`, clients = `mcp-abap-adt-clients` (siblings).
Announce: "Using upstream-resync to sync the forks." Make one todo per phase.

## Phase 0 — Fetch & version-pair (do this before anything else)

```bash
cd mcp-abap-adt        && git fetch upstream && git log --oneline -1 upstream/main
cd ../mcp-abap-adt-clients && git fetch origin && git log --oneline -1 origin/main
```

1. Latest **core** = `upstream/main`. Read its declared clients range:
   `git show upstream/main:package.json | grep adt-clients` → e.g. `^8.0.0`.
2. **Clients base = the matching tag, NOT the clients tip.** `^8.0.0` → rebase
   clients onto tag `v8.0.0` (`git tag | grep '^v8\.' | sort -V | tail`).
   Pairing latest-core with a newer clients major will not compile.

## Phase 1 — Keep/drop matrix

For each fix we carry, probe whether upstream already has it (drop if so):

```bash
# clients
git show origin/main:src/core/metadataExtension/read.ts | grep -c encodeSapObjectName   # 0 → DDLX fix still needed
git ls-tree origin/main:src/core | grep -i cdstype                                       # empty → CdsType still ours
# core
git ls-tree upstream/main:src/handlers | grep -iE "table_entity|cds_type"                # empty → tools still ours
git show upstream/main:src/handlers/package/high/handleCreatePackage.ts | grep -c isLockConflict  # 0 → 409 fix still ours
git show upstream/main:src/handlers/ddlx/high/handleCheckMetadataExtension.ts | grep -i "default: active"  # absent → fix still ours
```

Our current unique commits (confirm SHAs with `git log --oneline <base>..<old-canonical>`):
- **clients (5):** CdsType DRTY client, cdsType namespace tests, cdsType JSDoc,
  DDLX namespace fix, CdsType `getVersions`/`getVersionSource`.
- **core (many):** TableEntity ×6 +2 tests, CdsType ×6 +1 test, DDLX
  active-version fix ×2, CreatePackage 409 fix ×1, table-entity→ddl adaptation,
  dependency repin.

Anything that landed upstream (BDEF did, historically) → drop it.

## Phase 2 — Clients rebase (do first; core depends on it)

```bash
cd mcp-abap-adt-clients
git tag -f backup/clients-pre-resync-<ver> <old-canonical>
git checkout -b resync/clients-<ver> v<major>.0.0        # the matched tag
# cherry-pick our 5, OLDEST first (explicit list — zsh won't split a var):
for c in <sha1> <sha2> <sha3> <sha4> <sha5>; do git cherry-pick -x "$c" || break; done
```

Conflict handling:
- `src/index.core.ts` (re-export barrel): `git checkout --ours src/index.core.ts`,
  then add the cdsType exports (`AdtCdsTypeType`, `ICdsTypeConfig`,
  `ICdsTypeCreateParams`, `ICdsTypeState`) matching the barrel's local style.
- `src/core/metadataExtension/*.ts` (DDLX): `git checkout --ours` each, then
  re-apply the fix — wrap `name.toLowerCase()` → `encodeSapObjectName(name).toLowerCase()`
  and add `import { encodeSapObjectName } from '../../utils/internalUtils';`.
  Verify every `lowerName` only feeds a URL path first.
- `AdtClient.ts` facade must gain `getCdsType()` (usually auto-merges).

```bash
git add -A && git -c core.editor=true cherry-pick --continue
npm install && npm run build \
  && npx jest src/__tests__/unit/core/cdsType src/__tests__/unit/core/metadataExtension
```

## Phase 3 — Core rebase

```bash
cd mcp-abap-adt
git tag -f backup/core-pre-resync-<ver> local/all-features
git checkout -b resync/core-<ver> upstream/main
for c in <18-19 shas oldest-first>; do git cherry-pick -x "$c" || break; done
```

Expected conflicts / adaptations:
- **CreatePackage** — upstream rewrites the catch block. Keep our
  `isLockConflict` / `isAlreadyExists` split but use upstream's `return_error(...)`
  style (not `throw McpError`, which needs an import upstream lacks).
- **TableEntity handlers** delegate to `ddl/high` (View→Ddl). If a picked
  commit still references `view/high`, restore the adapted files:
  `git checkout backup/core-pre-resync-<prev> -- src/handlers/table_entity/high/*.ts`
  then confirm `upstream/main:src/handlers/ddl/high/*` uses `ddl_name`/`ddl_source`.
- **Repin the dependency** and commit it:
  `"@mcp-abap-adt/adt-clients": "file:../mcp-abap-adt-clients"` (else npm pulls
  the published package without our CdsType client).

```bash
npm install && npm run build && npx jest      # plain jest: admin/ + integration/ are already ignored
```

Do **not** add `--testPathIgnorePatterns=integration` — it un-ignores the
live-SAP admin tests. Expect ~530 unit tests green.

## Phase 4 — Promote & leave running locally

```bash
cd mcp-abap-adt-clients && git branch -f feat/cds-type-client resync/clients-<ver> && git checkout feat/cds-type-client && npm run build
cd ../mcp-abap-adt       && git branch -f local/all-features   resync/core-<ver>    && git checkout local/all-features   && npm run build
# then tell the user: run /mcp to reconnect so the server reloads dist
```

Live smoke test through the reconnected MCP: `GetCdsType <ns>/<enum>`,
`GetDdl <ns>/<view>`, and check the `CheckMetadataExtension` schema shows
`version` "Default: active".

## Phase 5 — Push (only if the user asks)

Pushing is outward-facing — confirm first unless the user already said to.
Push **only** to the eseuve forks (`github-eseuve` SSH alias), never `fr0ster`:

```bash
cd mcp-abap-adt-clients && git push --force-with-lease=feat/cds-type-client:<remote-sha> fork feat/cds-type-client
cd ../mcp-abap-adt       && git push --force-with-lease=local/all-features:<remote-sha>  origin local/all-features
```

Before pushing, grep the new commits for the real customer namespace,
transport numbers, and system id — scrub to `/NSP/`, `<TRANSPORT>`, `<system>`
if present. Real values stay only in gitignored config and memory.

## Notes
- zsh does not word-split unquoted vars — use explicit lists in `for` loops.
- macOS BSD sed lacks `\|`; use `sed -E` or `perl -pi`.
- husky pre-commit runs the build; `--no-verify` only to bypass a *transient*
  cross-repo mismatch, never a real error.
