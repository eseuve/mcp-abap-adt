# CDS Table Entity tools

A CDS **table entity** (`define table entity …`) is a CDS-managed persisted
database table. In ADT it is a `DDLS/DF` object served by the same endpoints as a
CDS view, so these tools delegate to the existing DDLS (view) handlers — there is
no dedicated `@mcp-abap-adt/adt-clients` client, and no change to that package.

Tools (`available_in: onprem, cloud`):

- **CreateTableEntity** — `name`, `package_name`, `transport_request?`,
  `description?`, `source?`, `activate?`. With `source`: create → set → activate
  in one call. Without `source`: create a minimal **inactive** scaffold
  (`key Uuid : sysuuid_x16`) as a starting point to complete via
  `UpdateTableEntity`.
- **UpdateTableEntity** — `name`, `source`, `transport_request?`, `activate?`.
- **GetTableEntity** — `name`, `version?` (`active`/`inactive`).
- **DeleteTableEntity** — `name`, `transport_request?`.

`source` must contain `define table entity` — a guard rejects CDS view sources
(use `CreateView`/`UpdateView` for views).

Note: if `CreateTableEntity` is called with a `source` whose activation fails
(e.g. a DDL error), the empty DDLS object is created but left without active
source; fix the source with `UpdateTableEntity`, or remove it with
`DeleteTableEntity`.

Tested via `src/__tests__/integration/high/tableEntity/TableEntity.test.ts`
(standard `createTestConnectionAndSession` policy; gated by `NS_TEST_PACKAGE`,
optionally `NS_TEST_TRANSPORT` / `NS_TEST_TE_NAME`; skips cleanly when unset).
