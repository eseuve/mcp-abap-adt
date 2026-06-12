# Design: Dedicated CDS Table Entity MCP tools

**Date:** 2026-06-12
**Status:** Draft (awaiting review)
**Scope:** `@mcp-abap-adt/core` only — no `@mcp-abap-adt/adt-clients` change.

## Problem

Users (and AI agents, the MCP's primary consumers) cannot discover how to create
a **CDS table entity** (`define table entity …` — the CDS-managed persisted
database table). There is no tool named after it, and the `View` tools never
mention that they can create one.

Diagnostic finding (verified live against an on-prem S/4 system): a table entity
**is a `DDLS/DF` object**, served by the same `/sap/bc/adt/ddic/ddl/sources/…`
endpoints as a CDS view. The existing `CreateView` → `UpdateView` (set
`define table entity` source + activate) flow already creates one successfully
(create → lock → check → update → unlock → check → activate all passed, and the
generated `STOB` persisted table is produced on activation). So this is **not a
bug** — it is a discoverability gap.

## Goal

Expose dedicated, clearly-described `TableEntity` CRUD tools that delegate to the
existing DDLS client, so humans and agents can create/update/read/delete table
entities without knowing they are "views" underneath.

## Non-goals

- CDS Type (`DRTY/STY`) creation — tracked separately (different, unknown ADT
  endpoint; its own spec → plan cycle).
- Any change to `@mcp-abap-adt/adt-clients`. The DDLS client already does
  everything needed (and already URL-encodes namespaced names).
- Classic DDIC tables (`TABL`) — `CreateTable` already covers those.

## Design

### Object model

A table entity is a `DDLS/DF` whose source is `define table entity NAME { … }`.
Activation generates the underlying persisted table (`STOB/DO`). Reading,
locking, updating, activating and deleting all go through the same DDL-sources
endpoints the `view` client already implements.

### Tools (high-level)

New handlers under `src/handlers/table_entity/high/`, each a thin delegate to
`createAdtClient(connection).getView()…` (or the existing view high-level
handlers where convenient). Registered in
`src/lib/handlers/groups/HighLevelHandlersGroup.ts` following the existing
`{ toolDefinition, handler: withContext(...) }` pattern.

All four tools set `available_in: ['onprem', 'cloud']` (table entities require a
modern release; not `legacy`).

1. **`CreateTableEntity`** — args: `name`, `package_name`, `transport_request?`,
   `description?`, `source?`, `activate?` (default `true`).
   - If `source` is provided: validate it (see *Source guard*), create the empty
     `DDLS/DF`, set the source, and activate (unless `activate: false`) — a
     single agent-friendly call. Mechanically: reuse `CreateView` then
     `UpdateView`.
   - If `source` is omitted: create the `DDLS/DF` carrying a **minimal scaffold**
     source — `define table entity NAME { key Uuid : sysuuid_x16; }` — left
     **inactive**, as a valid starting point the caller completes and activates
     via `UpdateTableEntity`. (Open question O1 below.)
   - Response includes the object URI and a hint to use `UpdateTableEntity`.

2. **`UpdateTableEntity`** — args: `name`, `source`, `transport_request?`,
   `activate?` (default `true`). Validates the source (*Source guard*), then
   lock → check → update → unlock → (activate). Delegates to the view update
   flow.

3. **`GetTableEntity`** — args: `name`, `version?` (`active`/`inactive`).
   Returns the DDL source. Thin delegate to the DDLS read.

4. **`DeleteTableEntity`** — args: `name`, `transport_request?`. Thin delegate to
   the DDLS delete.

### Source guard

For `CreateTableEntity` (when `source` given) and `UpdateTableEntity`: if the
source does not contain `define table entity` (case-insensitive, ignoring
leading annotations/whitespace), return a clear error — e.g. *"source is not a
table entity; it must start with `define table entity`. Use UpdateView for CDS
views."* This stops an agent silently turning a table entity into a view.

### Reuse, not duplication

The handlers contain no URL building; they call the existing DDLS/view client
methods. The only new logic is: tool definitions/descriptions, the source guard,
the optional single-call create orchestration, and the scaffold.

## Testing

Follow the project's standard integration-test policy (the connection comes from
`createTestConnectionAndSession()`, driven by `tests/test-config.yaml` + the
session `.env` — never a hand-built connection):

`src/__tests__/integration/.../TableEntity.test.ts` — gated by an env var
(`NS_TEST_PACKAGE` / `NS_TEST_TRANSPORT`, `describe.skip` when unset, like the
namespace test). It: creates a throwaway table entity (single-call create with
source), reads it back (asserts `define table entity` present), then deletes it.
Cleanup in `afterAll`.

A unit-level test is not applicable (handlers are thin delegates; logic is the
source guard, which gets a tiny pure-function unit test).

## Delivery

A single clean commit on `feat/table-entity-tools` in the core fork: the four
handlers, the registration wiring, the source-guard helper + its unit test, the
integration test, and a short doc under `docs/development/`. Push to the fork;
the user decides on the PR. No `adt-clients` change.

## Open questions

- **O1 — scaffold vs empty on `CreateTableEntity` without `source`:** ship a
  minimal `key Uuid : sysuuid_x16` scaffold (valid starting point, but imposes a
  field), or create a truly empty inactive object and only *suggest* a scaffold
  in the response text? Current choice: minimal scaffold, inactive.
- **O2 — key-field data element in the scaffold:** `sysuuid_x16` is a safe,
  ubiquitous standard type. Acceptable default? (Alternative: `abap.char(10)`
  key.)
