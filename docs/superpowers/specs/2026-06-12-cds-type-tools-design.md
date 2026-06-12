# Design: CDS Type (DRTY) MCP tools

**Date:** 2026-06-12
**Status:** Draft (awaiting review)
**Scope:** new `cdsType` client in the `@mcp-abap-adt/adt-clients` fork + thin MCP handlers in `@mcp-abap-adt/core`.

## Problem

The MCP cannot create a **CDS Type** — ADT object type `DRTY/STY` (a "CDS Simple
Type", e.g. a CDS enum like `/NSP/MedAdherenceCodeENUM`). `@mcp-abap-adt/adt-clients`
has no support for it, and it is not served under the DDLS (view) endpoints.

## Reverse-engineered protocol (verified live)

A throwaway DRTY (`/NSP/MCP_TYPE_TEST`) was created, updated, activated, read and
deleted end-to-end against an on-prem S/4 system. The object lives under
`/sap/bc/adt/ddic/drty/sources/` and belongs to the "blue" (`wbobj`) family — the
same family as behavior definitions. The proven sequence:

| Step | Method + URL | Headers | Body |
|------|---|---|---|
| Create | `POST /sap/bc/adt/ddic/drty/sources?corrNr={tr}` | CT/Accept `application/vnd.sap.adt.blues.v1+xml` | `<blue:blueSource … adtcore:name="{name}" adtcore:type="DRTY/STY" adtcore:masterLanguage="EN" adtcore:abapLanguageVersion="cloudDevelopment"><adtcore:packageRef adtcore:name="{pkg}"/></blue:blueSource>` |
| Lock | `POST /sap/bc/adt/ddic/drty/sources/{enc}?_action=LOCK&accessMode=MODIFY` | Accept `ACCEPT_LOCK`, CT `application/xml` | `asx:abap` lock envelope |
| Update | `PUT /sap/bc/adt/ddic/drty/sources/{enc}/source/main?lockHandle={h}&corrNr={tr}` | CT `text/plain; charset=utf-8` | the DDL source |
| Unlock | `POST /sap/bc/adt/ddic/drty/sources/{enc}?_action=UNLOCK&lockHandle={h}` | — | — |
| Activate | `POST /sap/bc/adt/activation?method=activate&preauditRequested=true` | CT/Accept `application/xml` | `adtcore:objectReferences` with the object URI |
| Read | `GET /sap/bc/adt/ddic/drty/sources/{enc}/source/main` | Accept `text/plain` | — |
| Delete | `POST /sap/bc/adt/deletion/check` then `POST /sap/bc/adt/deletion/delete` | deletion check/request content types | `del:checkRequest` / `del:deletionRequest` with the object URI |

`{enc}` = `encodeURIComponent(name).toLowerCase()` (so `/NSP/X` → `%2frhp%2fx`).

**Statefulness is mandatory:** the lock only persists if the connection is
stateful. The orchestration must call `connection.setSessionType('stateful')`
before lock and `'stateless'` after unlock / on error — exactly as `AdtView` and
`AdtBehaviorDefinition` already do.

Source shape: `@EndUserText.label: '…'` + `define type NAME : <base> [enum { … }];`.

## Architecture

### adt-clients fork — new `cdsType` module

Mirror the `behaviorDefinition` module (closest sibling — same "blue" family),
under `src/core/cdsType/`:

- `create.ts`, `lock.ts`, `update.ts`, `unlock.ts`, `activation.ts`, `read.ts`,
  `delete.ts`, `types.ts`, `index.ts` — low-level functions on the
  `/sap/bc/adt/ddic/drty/sources` endpoints with the content types above. All URL
  paths use `encodeSapObjectName(name).toLowerCase()` (namespace-safe from day
  one — the bug we already fixed for BDEF must not be reintroduced).
- `AdtCdsType.ts` — orchestration class mirroring `AdtBehaviorDefinition`:
  `create()`, `read()`, `update()`, `activate()`, `lock()`, `unlock()`,
  `delete()`, managing `setSessionType('stateful'|'stateless')` around lock/update.
- Wire `getCdsType()` onto the `AdtClient` (the same place `getBehaviorDefinition()` /
  `getView()` are exposed). Export the new public types.
- Add a content-type constant `CT_CDS_TYPE = 'application/vnd.sap.adt.blues.v1+xml'`
  (or reuse the existing blues constant) in `constants/contentTypes.ts`.

### core fork — 4 thin MCP handlers

Under `src/handlers/cds_type/high/`, delegating to `client.getCdsType()`:

- **CreateCdsType** — `name`, `package_name`, `transport_request?`,
  `description?`, `source?`, `activate?`. With `source`: create → set → activate
  in one call. Without `source`: create a minimal **inactive** scalar scaffold
  `define type NAME : abap.char(10);`.
- **UpdateCdsType** — `name`, `source`, `transport_request?`, `activate?`.
- **GetCdsType** — `name`, `version?`.
- **DeleteCdsType** — `name`, `transport_request?`.

`source` must contain `define type` (a guard rejects other DDL). A
`cdsTypeSource.ts` helper provides `isCdsTypeSource` + `buildCdsTypeScaffold`.
All four set `available_in: ['onprem', 'cloud']` (DRTY needs the
`cloudDevelopment` ABAP language version). Registered in
`HighLevelHandlersGroup.ts`.

## Testing

- **adt-clients:** unit tests (mocked connection) asserting each low-level URL is
  namespace-encoded (mirroring the BDEF `Namespace.test.ts`), and that
  create/lock/update use the right method + content types.
- **core:** unit test for `isCdsTypeSource` / `buildCdsTypeScaffold`; a gated live
  CRUD integration test (standard `createTestConnectionAndSession` policy; skips
  without `NS_TEST_PACKAGE`) that creates (with source + activate), reads, and
  deletes a throwaway CDS type.

## Delivery

- adt-clients fork: branch `feat/cds-type-client` → PR to `fr0ster/mcp-abap-adt-clients`.
- core fork: branch `feat/cds-type-tools` → PR to `fr0ster/mcp-abap-adt`.
- Local wiring via the existing `npm link` of the adt-clients fork (core
  `package.json` keeps its published semver range).

## Decisions (resolved)

- Implementation lives in the adt-clients fork (new `cdsType` module), not as raw
  `makeAdtRequest` calls in core handlers — consistent with every other object
  type and the core's "no URL building" convention.
- Tool shape mirrors the just-shipped TableEntity tools (single-call create,
  scaffold, guard, full CRUD).
- Scaffold for `CreateCdsType` without `source`: scalar `define type NAME :
  abap.char(10);`, created inactive.

## Non-goals

- Non-`DRTY/STY` CDS artifacts (already covered: views/table entities via the
  view tools; access controls, etc.).
- Editing enum value semantics beyond passing through the user's DDL source.
