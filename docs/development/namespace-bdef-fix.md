# Namespaced (`/NSP/…`) Behavior Definitions — read/update fix

## Symptom

Creating or, more visibly, **updating / activating** a Behavior Definition whose
name lives in a SAP namespace (e.g. `/NSP/R_MY_ENTITY`) failed.
Reading such a BDEF returned `BehaviorDefinition … not found`, even though the
object exists and shows up in search.

## Root cause

This MCP server (`@mcp-abap-adt/core`) does **not** build ADT URLs itself — it
delegates to the `@mcp-abap-adt/adt-clients` dependency. The
`behaviorDefinition` client built its URLs with the raw name:

```ts
`/sap/bc/adt/bo/behaviordefinitions/${name.toLowerCase()}`
```

For a namespaced name like `/NSP/R_MY_ENTITY` that yields
`…/behaviordefinitions//nsp/r_my_entity` — the raw `/` characters
break the ADT path, so lock / update / read / activate / check / unlock / delete
all fail. `create` is unaffected because it POSTs to the collection with the
real name inside the XML body.

Other object clients (`class`, `interface`, `view`, …) already encode the name
with `encodeSapObjectName(name)` (so `/` → `%2f`). The behavior-definition
client simply missed it.

## Fix

The fix lives in the dependency, not in this repo:
`@mcp-abap-adt/adt-clients`, branch `fix/bdef-namespace-url-encoding` — wrap the
name in `encodeSapObjectName(...)` across all behavior-definition URL paths.

Once that fix is released upstream, this repo only needs to track the new
`@mcp-abap-adt/adt-clients` version (a normal `npm update`); no source change is
required here.

## Local testing before the upstream release

`package.json` intentionally keeps the published semver range
(`@mcp-abap-adt/adt-clients: ^5.4.2`) so that a future `npm install` / `npm
update` automatically picks up the fixed published version. To test the patched
client locally **without** pinning it, use `npm link` (which any reinstall
overrides):

```bash
# in the adt-clients fork checkout
cd ../mcp-abap-adt-clients
git checkout fix/bdef-namespace-url-encoding
npm install && npm run build
npm link

# in this repo
cd ../mcp-abap-adt
npm link @mcp-abap-adt/adt-clients
npm run build
```

To revert to the published library at any time: `npm install` (or `npm update`).

## Verification

`src/__tests__/integration/readOnly/behaviorDefinition/NamespaceBdef.test.ts`
reads a namespaced behavior definition through the project's standard test
policy — the connection comes from `createTestConnectionAndSession()` (driven by
`tests/test-config.yaml` + the session `.env`), not from a hand-built
connection. Before the fix the read returns no source ("not found"); after it,
the real source is returned.

Point `environment.env` in `tests/test-config.yaml` at your session file, then
provide a namespaced BDEF name via `NS_TEST_BDEF` (the test skips cleanly when it
is unset, e.g. in CI):

```bash
NS_TEST_BDEF='/YOUR/BDEF_NAME' npm run test:integration -- \
  --testPathPatterns=NamespaceBdef
```
