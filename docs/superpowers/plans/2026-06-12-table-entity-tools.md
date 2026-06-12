# CDS Table Entity Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dedicated `CreateTableEntity` / `UpdateTableEntity` / `GetTableEntity` / `DeleteTableEntity` MCP tools that delegate to the existing DDLS (view) handlers, so CDS table entities are discoverable and creatable.

**Architecture:** A CDS table entity is a `DDLS/DF` object on the same `/sap/bc/adt/ddic/ddl/sources/…` endpoints as a CDS view (verified live). The new handlers are thin delegates to the existing `handleCreateView` / `handleUpdateView` / `handleGetView` / `handleDeleteView`, adding only: clear tool names/descriptions, a source guard (`define table entity`), a single-call create orchestration, and a minimal inactive scaffold. No `@mcp-abap-adt/adt-clients` change.

**Tech Stack:** TypeScript, MCP tool handlers, Jest (ts-jest), Biome.

---

## File Structure

- Create `src/handlers/table_entity/tableEntitySource.ts` — pure helpers: `isTableEntitySource`, `buildTableEntityScaffold`.
- Create `src/handlers/table_entity/high/handleCreateTableEntity.ts`
- Create `src/handlers/table_entity/high/handleUpdateTableEntity.ts`
- Create `src/handlers/table_entity/high/handleGetTableEntity.ts`
- Create `src/handlers/table_entity/high/handleDeleteTableEntity.ts`
- Modify `src/lib/handlers/groups/HighLevelHandlersGroup.ts` — import + register the 4 tools.
- Create `src/__tests__/unit/tableEntitySource.test.ts` — unit test for the helpers.
- Create `src/__tests__/integration/high/tableEntity/TableEntity.test.ts` — live CRUD test (gated, skips without env).
- Create `docs/development/table-entity-tools.md` — short usage doc.

Reference patterns: `src/handlers/view/high/handleCreateView.ts` (handler shape, `return_response`/`return_error`), `src/lib/handlers/groups/HighLevelHandlersGroup.ts:705-712` (registration), `src/__tests__/integration/readOnly/behaviorDefinition/NamespaceBdef.test.ts` (gated integration test using `createTestConnectionAndSession`).

---

## Task 1: Source guard + scaffold helpers (TDD)

**Files:**
- Create: `src/handlers/table_entity/tableEntitySource.ts`
- Test: `src/__tests__/unit/tableEntitySource.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/unit/tableEntitySource.test.ts
import {
  buildTableEntityScaffold,
  isTableEntitySource,
} from '../../handlers/table_entity/tableEntitySource';

describe('tableEntitySource', () => {
  it('accepts a define table entity source', () => {
    expect(
      isTableEntitySource('define table entity X { key a : abap.int4; }'),
    ).toBe(true);
  });

  it('accepts leading annotations and mixed case', () => {
    expect(
      isTableEntitySource(
        '@AbapCatalog.deliveryClass: #APPLICATION_DATA\nDEFINE  TABLE   ENTITY X {}',
      ),
    ).toBe(true);
  });

  it('rejects a CDS view source', () => {
    expect(
      isTableEntitySource('define view entity X as select from y { key y.a }'),
    ).toBe(false);
  });

  it('rejects empty / non-CDS source', () => {
    expect(isTableEntitySource('')).toBe(false);
    expect(isTableEntitySource('just text')).toBe(false);
  });

  it('scaffold is a valid table entity carrying the name and a key', () => {
    const s = buildTableEntityScaffold('Z_T_X');
    expect(isTableEntitySource(s)).toBe(true);
    expect(s).toContain('Z_T_X');
    expect(s).toContain('key Uuid : sysuuid_x16');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tableEntitySource --runInBand`
Expected: FAIL — cannot find module `tableEntitySource`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/handlers/table_entity/tableEntitySource.ts
/**
 * Helpers for CDS table entity (`define table entity`) sources.
 * A table entity is a DDLS/DF object, so it reuses the view (DDLS) handlers;
 * these helpers only distinguish a table-entity source and build a scaffold.
 */

/** True if the DDL source declares a `define table entity` (case/space-insensitive). */
export function isTableEntitySource(source: string): boolean {
  return /\bdefine\s+table\s+entity\b/i.test(source ?? '');
}

/** Minimal, valid table-entity scaffold with a UUID key, carrying the given name. */
export function buildTableEntityScaffold(name: string): string {
  return `@AbapCatalog.deliveryClass: #APPLICATION_DATA
@ClientHandling.type: #CLIENT_DEPENDENT
define table entity ${name}
{
  key Uuid : sysuuid_x16;
}
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tableEntitySource --runInBand`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/handlers/table_entity/tableEntitySource.ts src/__tests__/unit/tableEntitySource.test.ts
git commit -m "feat(table-entity): add source guard and scaffold helpers"
```

---

## Task 2: CreateTableEntity handler

**Files:**
- Create: `src/handlers/table_entity/high/handleCreateTableEntity.ts`

- [ ] **Step 1: Write the handler**

```typescript
// src/handlers/table_entity/high/handleCreateTableEntity.ts
/**
 * CreateTableEntity - create a CDS table entity (DDLS/DF) via the view (DDLS)
 * handlers. With `source`: create -> set source -> activate (one call).
 * Without `source`: create + set a minimal inactive scaffold.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { handleCreateView } from '../../view/high/handleCreateView';
import { handleUpdateView } from '../../view/high/handleUpdateView';
import {
  buildTableEntityScaffold,
  isTableEntitySource,
} from '../tableEntitySource';

export const TOOL_DEFINITION = {
  name: 'CreateTableEntity',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: TableEntity. Create a CDS table entity (`define table entity`) — a CDS-managed persisted database table (DDLS/DF). Pass `source` to create, set it, and activate in one call; omit `source` to create a minimal inactive scaffold (key Uuid). Edit later with UpdateTableEntity.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Table entity name (e.g., Z_T_MY_ENTITY or /NS/T_MY_ENTITY).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZPKG, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request (required for transportable packages).',
      },
      description: {
        type: 'string',
        description: 'Optional description (defaults to name).',
      },
      source: {
        type: 'string',
        description:
          'Optional complete DDL source starting with "define table entity". If omitted, a minimal inactive scaffold with a key Uuid field is created.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate after setting source. Default true. Ignored when no source is provided (the scaffold stays inactive).',
      },
    },
    required: ['name', 'package_name'],
  },
} as const;

interface CreateTableEntityArgs {
  name: string;
  package_name: string;
  transport_request?: string;
  description?: string;
  source?: string;
  activate?: boolean;
}

export async function handleCreateTableEntity(
  context: HandlerContext,
  params: any,
) {
  const args: CreateTableEntityArgs = params;
  if (!args.name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: name and package_name'),
    );
  }

  const hasSource =
    typeof args.source === 'string' && args.source.trim().length > 0;
  if (hasSource && !isTableEntitySource(args.source as string)) {
    return return_error(
      new Error(
        'source is not a table entity; it must contain "define table entity". Use CreateView for CDS views.',
      ),
    );
  }

  const effectiveSource = hasSource
    ? (args.source as string)
    : buildTableEntityScaffold(args.name);
  // Provided source activates per `activate` (default true); a scaffold stays inactive.
  const activate = hasSource ? args.activate !== false : false;

  const created = await handleCreateView(context, {
    view_name: args.name,
    package_name: args.package_name,
    transport_request: args.transport_request,
    description: args.description || args.name,
  });
  if (created?.isError) return created;

  const updated = await handleUpdateView(context, {
    view_name: args.name,
    ddl_source: effectiveSource,
    transport_request: args.transport_request,
    activate,
  });
  if (updated?.isError) return updated;

  return return_response({
    data: JSON.stringify(
      {
        success: true,
        name: args.name.toUpperCase(),
        package_name: args.package_name,
        transport_request: args.transport_request || null,
        type: 'DDLS',
        kind: 'table_entity',
        activated: activate,
        scaffolded: !hasSource,
        message: hasSource
          ? `Table entity ${args.name.toUpperCase()} created${activate ? ' and activated' : ''} successfully.`
          : `Table entity ${args.name.toUpperCase()} created as an inactive scaffold. Edit it with UpdateTableEntity to add fields, then it will activate.`,
      },
      null,
      2,
    ),
  } as AxiosResponse);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/table_entity/high/handleCreateTableEntity.ts
git commit -m "feat(table-entity): add CreateTableEntity handler"
```

---

## Task 3: UpdateTableEntity handler

**Files:**
- Create: `src/handlers/table_entity/high/handleUpdateTableEntity.ts`

- [ ] **Step 1: Write the handler**

```typescript
// src/handlers/table_entity/high/handleUpdateTableEntity.ts
/**
 * UpdateTableEntity - set/replace a table entity's DDL source and (optionally)
 * activate. Delegates to the view (DDLS) update flow.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { handleUpdateView } from '../../view/high/handleUpdateView';
import { isTableEntitySource } from '../tableEntitySource';

export const TOOL_DEFINITION = {
  name: 'UpdateTableEntity',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update. Subject: TableEntity. Update the DDL source of a CDS table entity (`define table entity`). Locks, updates, unlocks, and optionally activates (which generates the persisted table).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Table entity name.' },
      source: {
        type: 'string',
        description: 'Complete DDL source starting with "define table entity".',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request (required for transportable packages).',
      },
      activate: {
        type: 'boolean',
        description: 'Activate after update. Default true.',
      },
    },
    required: ['name', 'source'],
  },
} as const;

interface UpdateTableEntityArgs {
  name: string;
  source: string;
  transport_request?: string;
  activate?: boolean;
}

export async function handleUpdateTableEntity(
  context: HandlerContext,
  params: any,
) {
  const args: UpdateTableEntityArgs = params;
  if (!args.name || !args.source) {
    return return_error(
      new Error('Missing required parameters: name and source'),
    );
  }
  if (!isTableEntitySource(args.source)) {
    return return_error(
      new Error(
        'source is not a table entity; it must contain "define table entity". Use UpdateView for CDS views.',
      ),
    );
  }

  const activate = args.activate !== false;
  const updated = await handleUpdateView(context, {
    view_name: args.name,
    ddl_source: args.source,
    transport_request: args.transport_request,
    activate,
  });
  if (updated?.isError) return updated;

  return return_response({
    data: JSON.stringify(
      {
        success: true,
        name: args.name.toUpperCase(),
        kind: 'table_entity',
        activated: activate,
        message: `Table entity ${args.name.toUpperCase()} updated${activate ? ' and activated' : ''} successfully.`,
      },
      null,
      2,
    ),
  } as AxiosResponse);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/table_entity/high/handleUpdateTableEntity.ts
git commit -m "feat(table-entity): add UpdateTableEntity handler"
```

---

## Task 4: GetTableEntity handler

**Files:**
- Create: `src/handlers/table_entity/high/handleGetTableEntity.ts`

- [ ] **Step 1: Write the handler**

```typescript
// src/handlers/table_entity/high/handleGetTableEntity.ts
/**
 * GetTableEntity - read a table entity's DDL source. Delegates to GetView and
 * re-labels the payload with table-entity terminology.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { handleGetView } from '../../view/high/handleGetView';

export const TOOL_DEFINITION = {
  name: 'GetTableEntity',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read. Subject: TableEntity. Retrieve the DDL source of a CDS table entity (`define table entity`). Supports active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Table entity name.' },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read. Default "active".',
      },
    },
    required: ['name'],
  },
} as const;

interface GetTableEntityArgs {
  name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetTableEntity(
  context: HandlerContext,
  params: any,
) {
  const args: GetTableEntityArgs = params;
  if (!args.name) {
    return return_error(new Error('Missing required parameter: name'));
  }

  const res = await handleGetView(context, {
    view_name: args.name,
    version: args.version,
  });
  if (res?.isError) return res;

  const text = res?.content?.find?.((c: any) => c.type === 'text')?.text;
  try {
    const v = JSON.parse(text);
    return return_response({
      data: JSON.stringify(
        {
          success: true,
          name: v.view_name,
          version: v.version,
          kind: 'table_entity',
          source: v.view_data,
          status: v.status,
          status_text: v.status_text,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch {
    // Fall back to the raw GetView response if the payload is not JSON.
    return res;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/table_entity/high/handleGetTableEntity.ts
git commit -m "feat(table-entity): add GetTableEntity handler"
```

---

## Task 5: DeleteTableEntity handler

**Files:**
- Create: `src/handlers/table_entity/high/handleDeleteTableEntity.ts`

- [ ] **Step 1: Write the handler**

```typescript
// src/handlers/table_entity/high/handleDeleteTableEntity.ts
/**
 * DeleteTableEntity - delete a CDS table entity (DDLS/DF). Delegates to
 * DeleteView and re-labels the payload.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { handleDeleteView } from '../../view/high/handleDeleteView';

export const TOOL_DEFINITION = {
  name: 'DeleteTableEntity',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Delete. Subject: TableEntity. Delete a CDS table entity (`define table entity`, DDLS/DF).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Table entity name.' },
      transport_request: {
        type: 'string',
        description:
          'Transport request (required for transportable objects, optional for $TMP).',
      },
    },
    required: ['name'],
  },
} as const;

interface DeleteTableEntityArgs {
  name: string;
  transport_request?: string;
}

export async function handleDeleteTableEntity(
  context: HandlerContext,
  params: any,
) {
  const args: DeleteTableEntityArgs = params;
  if (!args.name) {
    return return_error(new Error('Missing required parameter: name'));
  }

  const res = await handleDeleteView(context, {
    view_name: args.name,
    transport_request: args.transport_request,
  });
  if (res?.isError) return res;

  return return_response({
    data: JSON.stringify(
      {
        success: true,
        name: args.name.toUpperCase(),
        kind: 'table_entity',
        transport_request: args.transport_request || null,
        message: `Table entity ${args.name.toUpperCase()} deleted successfully.`,
      },
      null,
      2,
    ),
  } as AxiosResponse);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/table_entity/high/handleDeleteTableEntity.ts
git commit -m "feat(table-entity): add DeleteTableEntity handler"
```

---

## Task 6: Register the tools

**Files:**
- Modify: `src/lib/handlers/groups/HighLevelHandlersGroup.ts`

- [ ] **Step 1: Add the imports**

Add near the other view imports (around `src/lib/handlers/groups/HighLevelHandlersGroup.ts:457`, after the `handleCreateView` import block):

```typescript
import {
  TOOL_DEFINITION as CreateTableEntity_Tool,
  handleCreateTableEntity,
} from '../../../handlers/table_entity/high/handleCreateTableEntity';
import {
  TOOL_DEFINITION as UpdateTableEntity_Tool,
  handleUpdateTableEntity,
} from '../../../handlers/table_entity/high/handleUpdateTableEntity';
import {
  TOOL_DEFINITION as GetTableEntity_Tool,
  handleGetTableEntity,
} from '../../../handlers/table_entity/high/handleGetTableEntity';
import {
  TOOL_DEFINITION as DeleteTableEntity_Tool,
  handleDeleteTableEntity,
} from '../../../handlers/table_entity/high/handleDeleteTableEntity';
```

- [ ] **Step 2: Register in the `getHandlers()` array**

Add these entries inside the array returned by `getHandlers()` (next to the `CreateView_Tool` entry around line 705):

```typescript
      {
        toolDefinition: CreateTableEntity_Tool,
        handler: withContext(handleCreateTableEntity),
      },
      {
        toolDefinition: UpdateTableEntity_Tool,
        handler: withContext(handleUpdateTableEntity),
      },
      {
        toolDefinition: GetTableEntity_Tool,
        handler: withContext(handleGetTableEntity),
      },
      {
        toolDefinition: DeleteTableEntity_Tool,
        handler: withContext(handleDeleteTableEntity),
      },
```

- [ ] **Step 3: Build + run the handler registry test**

Run: `npm run build:fast && npx jest handlers.test --runInBand`
Expected: build succeeds; the handler test passes (tool names unique, definitions valid).

- [ ] **Step 4: Commit**

```bash
git add src/lib/handlers/groups/HighLevelHandlersGroup.ts
git commit -m "feat(table-entity): register TableEntity tools in HighLevelHandlersGroup"
```

---

## Task 7: Live CRUD integration test (standard policy, gated)

**Files:**
- Create: `src/__tests__/integration/high/tableEntity/TableEntity.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/__tests__/integration/high/tableEntity/TableEntity.test.ts
/**
 * Live CRUD test for the TableEntity tools. Connection comes from the standard
 * test policy (createTestConnectionAndSession, config/.env-driven). Gated by
 * NS_TEST_PACKAGE (+ optional NS_TEST_TRANSPORT); skips cleanly when unset.
 */
import { handleCreateTableEntity } from '../../../../handlers/table_entity/high/handleCreateTableEntity';
import { handleDeleteTableEntity } from '../../../../handlers/table_entity/high/handleDeleteTableEntity';
import { handleGetTableEntity } from '../../../../handlers/table_entity/high/handleGetTableEntity';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../../helpers/sessionHelpers';
import {
  createHandlerContext,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

const PKG = process.env.NS_TEST_PACKAGE?.trim();
const TRANSPORT = process.env.NS_TEST_TRANSPORT?.trim();
const NAME = process.env.NS_TEST_TE_NAME?.trim() || 'Z_T_MCP_TE_TEST';
const logger = createTestLogger('table-entity');

const describeOrSkip = PKG ? describe : describe.skip;

describeOrSkip('TableEntity tools (live CRUD)', () => {
  let connection: Awaited<
    ReturnType<typeof createTestConnectionAndSession>
  >['connection'];

  beforeAll(async () => {
    if (!PKG) return;
    ({ connection } = await createTestConnectionAndSession());
  }, getTimeout('long'));

  afterAll(async () => {
    if (!PKG || !connection) return;
    await handleDeleteTableEntity(createHandlerContext({ connection, logger }), {
      name: NAME,
      transport_request: TRANSPORT,
    });
  }, getTimeout('long'));

  it(
    'creates (with source + activate), reads, then the entity is real',
    async () => {
      const ctx = createHandlerContext({ connection, logger });
      const source = `@AbapCatalog.deliveryClass: #APPLICATION_DATA
@ClientHandling.type: #CLIENT_DEPENDENT
define table entity ${NAME}
{
  key Uuid : sysuuid_x16;
      DescriptionText : abap.char(50);
}
`;

      const created = await handleCreateTableEntity(ctx, {
        name: NAME,
        package_name: PKG,
        transport_request: TRANSPORT,
        description: 'MCP table entity CRUD test',
        source,
        activate: true,
      });
      expect(created.isError).toBe(false);
      const createdData = parseHandlerResponse(created);
      expect(createdData.kind).toBe('table_entity');
      expect(createdData.activated).toBe(true);

      const got = await handleGetTableEntity(ctx, { name: NAME });
      expect(got.isError).toBe(false);
      const gotData = parseHandlerResponse(got);
      expect(String(gotData.source).toLowerCase()).toContain(
        'define table entity',
      );
    },
    getTimeout('long'),
  );
});
```

- [ ] **Step 2: Run it gated-off (no env) — must skip cleanly**

Run: `npx jest --testPathPatterns=TableEntity --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit`
Expected: `Test Suites: 1 skipped`, `Tests: 1 skipped`. No failures.

- [ ] **Step 3: Run it live against the real system — must pass green**

Run (real package + transport; uses `tests/test-config.yaml` env policy):
```bash
NS_TEST_PACKAGE='/NSP/MEDICATIONSTATEMENT' NS_TEST_TRANSPORT='<TRANSPORT>' NS_TEST_TE_NAME='/NSP/T_MCP_TE_TEST' \
  npx jest --testPathPatterns=TableEntity --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit
```
Expected: `Tests: 1 passed`. (The `afterAll` deletes the throwaway entity.)

- [ ] **Step 4: Confirm the throwaway entity was deleted**

Run:
```bash
MCP_ENV_PATH="$HOME/.config/mcp-abap-adt/sessions/<system>.env" node -e 'require("dotenv").config({path:process.env.MCP_ENV_PATH});const{createAbapConnection}=require("@mcp-abap-adt/connection");const{createAdtClient}=require("./dist/lib/clients.js");(async()=>{const c=createAbapConnection({url:process.env.SAP_URL,authType:"basic",username:process.env.SAP_USERNAME,password:process.env.SAP_PASSWORD,client:process.env.SAP_CLIENT||""});if(c.connect)await c.connect();try{await createAdtClient(c).getView().read({viewName:"/NSP/T_MCP_TE_TEST"},"active");console.log("STILL EXISTS")}catch(e){console.log("deleted OK")}})();'
```
Expected: `deleted OK`.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/integration/high/tableEntity/TableEntity.test.ts
git commit -m "test(table-entity): add live CRUD integration test (gated)"
```

---

## Task 8: Docs + full verification + push

**Files:**
- Create: `docs/development/table-entity-tools.md`
- Delete: `docs/superpowers/specs/2026-06-12-table-entity-tools-design.md` and `docs/superpowers/plans/2026-06-12-table-entity-tools.md` (per CLAUDE.md: specs/plans are removed once implemented).

- [ ] **Step 1: Write the doc**

```markdown
# CDS Table Entity tools

A CDS **table entity** (`define table entity …`) is a CDS-managed persisted
database table. In ADT it is a `DDLS/DF` object served by the same endpoints as a
CDS view, so these tools delegate to the existing DDLS (view) handlers — there is
no dedicated `adt-clients` client.

Tools (`available_in: onprem, cloud`):

- **CreateTableEntity** — `name`, `package_name`, `transport_request?`,
  `description?`, `source?`, `activate?`. With `source`: create → set → activate
  in one call. Without `source`: create a minimal inactive scaffold (key Uuid).
- **UpdateTableEntity** — `name`, `source`, `transport_request?`, `activate?`.
- **GetTableEntity** — `name`, `version?`.
- **DeleteTableEntity** — `name`, `transport_request?`.

`source` must contain `define table entity` (a guard rejects view sources).

Tested via `src/__tests__/integration/high/tableEntity/TableEntity.test.ts`
(standard `createTestConnectionAndSession` policy; gated by `NS_TEST_PACKAGE`).
```

- [ ] **Step 2: Remove the spec and plan (now implemented)**

```bash
git rm docs/superpowers/specs/2026-06-12-table-entity-tools-design.md docs/superpowers/plans/2026-06-12-table-entity-tools.md
```

- [ ] **Step 3: Full verification**

Run: `npm run build && npm test`
Expected: build clean (Biome + tsc), unit suite passes (including `tableEntitySource`), integration tests skip without env.

- [ ] **Step 4: Commit + push**

```bash
git add docs/development/table-entity-tools.md
git commit -m "docs(table-entity): document the TableEntity tools and remove spec/plan"
git push -u origin feat/table-entity-tools
```

- [ ] **Step 5: Report** the pushed branch and an English PR title/body draft for the user to open the PR (they decide).

---

## Self-Review

- **Spec coverage:** 4 tools (Tasks 2-5), delegation/no adt-clients change (all tasks), source guard + scaffold incl. O1/O2 decisions (Task 1, used in Task 2), registration (Task 6), `available_in: onprem,cloud` (each TOOL_DEFINITION), standard-policy gated integration test (Task 7), doc + delivery (Task 8). All spec sections covered.
- **Placeholder scan:** none — every step has full code or exact commands.
- **Type consistency:** `isTableEntitySource` / `buildTableEntityScaffold` names match across Task 1, 2, 3; handler arg names (`view_name`, `ddl_source`, `version`) match the real view handler signatures; registration aliases (`CreateTableEntity_Tool` …) match imports and array entries.
