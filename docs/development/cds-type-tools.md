# CDS Type (DRTY) tools

A CDS Type (`define type`, ADT object DRTY/STY — a CDS Simple Type such as an
enum) lives under `/sap/bc/adt/ddic/drty/sources`, in the same "blue" (wbobj)
family as a Behavior Definition. Support is provided by a new `cdsType` client in
`@mcp-abap-adt/adt-clients` (a clone of the behaviorDefinition client), exposed
via `client.getCdsType()`.

Tools (`available_in: onprem, cloud` — DRTY needs the `cloudDevelopment` ABAP
language version):

- **CreateCdsType** — `name`, `package_name`, `transport_request?`,
  `description?`, `source?`, `activate?`. With `source`: create → set → activate
  in one call. Without `source`: a minimal inactive scalar scaffold
  (`define type NAME : abap.char(10);`).
- **UpdateCdsType** — `name`, `source`, `transport_request?`, `activate?`.
- **GetCdsType** — `name`, `version?` (`active`/`inactive`).
- **DeleteCdsType** — `name`, `transport_request?`.

`source` must contain `define type` (and not `define view`/`define table
entity`) — a guard rejects view/table-entity sources.

Tested via `src/__tests__/integration/high/cdsType/CdsType.test.ts` (standard
`createTestConnectionAndSession` policy; gated by `NS_TEST_PACKAGE`, optionally
`NS_TEST_TRANSPORT` / `NS_TEST_CDSTYPE_NAME`; skips cleanly when unset).
