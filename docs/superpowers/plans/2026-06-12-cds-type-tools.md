# CDS Type (DRTY) Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `CreateCdsType` / `UpdateCdsType` / `GetCdsType` / `DeleteCdsType` MCP tools backed by a new `cdsType` client in the adt-clients fork, and make all our improvements (BDEF namespace fix + table-entity tools + CDS-type tools) available in the user's local MCP immediately.

**Architecture:** A CDS Type is a `DRTY/STY` object on `/sap/bc/adt/ddic/drty/sources/`, in the same "blue" (wbobj) family as a Behavior Definition. The new adt-clients `cdsType` module is a clone of the `behaviorDefinition` module (which already handles stateful lock→update→unlock→activate) with the endpoint/type/content-type/create-payload adapted. Thin core handlers delegate to `client.getCdsType()`.

**Tech Stack:** TypeScript, MCP handlers, Jest (ts-jest), Biome. Two repos: `mcp-abap-adt-clients` fork (`/Users/<user>/Developer/BTP/mcp-abap-adt-clients`, branch `feat/cds-type-client`) and `mcp-abap-adt` core (`/Users/<user>/Developer/BTP/mcp-abap-adt`, branch `feat/cds-type-tools`).

**Proven DRTY protocol (verified live):** see `docs/superpowers/specs/2026-06-12-cds-type-tools-design.md` for the exact request table. Create payload:
```xml
<?xml version="1.0" encoding="UTF-8"?><blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="{desc}" adtcore:language="EN" adtcore:name="{name}" adtcore:type="DRTY/STY" adtcore:masterLanguage="EN" adtcore:abapLanguageVersion="cloudDevelopment"><adtcore:packageRef adtcore:name="{pkg}"/></blue:blueSource>
```
Endpoint base `/sap/bc/adt/ddic/drty/sources`; statefulness via `connection.setSessionType('stateful')` before lock and `'stateless')` after unlock (already done by the cloned orchestration class).

---

## PART A — adt-clients fork: `cdsType` module

Work in `/Users/<user>/Developer/BTP/mcp-abap-adt-clients`.

### Task A0: Branch off the namespace fix

The local MCP must keep the BDEF namespace fix AND gain the cdsType client. Branch from the existing fix branch so the fork build has both.

- [ ] **Step 1:** `cd /Users/<user>/Developer/BTP/mcp-abap-adt-clients && git checkout fix/bdef-namespace-url-encoding && git pull --ff-only fork fix/bdef-namespace-url-encoding 2>/dev/null; git checkout -b feat/cds-type-client`
- [ ] **Step 2:** `git branch --show-current` → expect `feat/cds-type-client`.

### Task A1: Clone behaviorDefinition → cdsType and transform

**Files:**
- Create dir: `src/core/cdsType/` (copy of `src/core/behaviorDefinition/`)
- Modify: `src/clients/AdtClient.ts`, `src/clients/AdtClientLegacy.ts`, `src/index.ts`

- [ ] **Step 1: Copy the module**

```bash
cp -r src/core/behaviorDefinition src/core/cdsType
```

- [ ] **Step 2: Apply the endpoint/type transformations**

In every file under `src/core/cdsType/`, replace:
- `/sap/bc/adt/bo/behaviordefinitions` → `/sap/bc/adt/ddic/drty/sources`
- `BDEF/BDO` → `DRTY/STY`
- `behaviordefinitions/${...}` URL segments stay as-is after the base swap (they already use `encodeSapObjectName(...)` — keep that; do NOT introduce raw names).

```bash
cd src/core/cdsType
perl -0pi -e 's{/sap/bc/adt/bo/behaviordefinitions}{/sap/bc/adt/ddic/drty/sources}g; s{BDEF/BDO}{DRTY/STY}g;' *.ts
cd ../../..
```

- [ ] **Step 3: Fix the create payload** in `src/core/cdsType/create.ts`

Replace the `<blue:blueSource …>` body so it (a) carries `adtcore:abapLanguageVersion="cloudDevelopment"`, and (b) drops the `<adtcore:adtTemplate>…implementation_type…</adtcore:adtTemplate>` block. The final `xmlBody` must read exactly:

```typescript
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:language="${language}" adtcore:name="${params.name}" adtcore:type="DRTY/STY" adtcore:masterLanguage="${language}" adtcore:abapLanguageVersion="cloudDevelopment"${masterSystemAttr}${responsibleAttr}>
    <adtcore:packageRef adtcore:name="${params.package}"/>
</blue:blueSource>`;
```

Remove any now-unused `implementationType` references in `create.ts`.

- [ ] **Step 4: Strip DRTY-irrelevant config fields** in `src/core/cdsType/types.ts`

Remove `rootEntity` and `implementationType` (and the `BehaviorDefinitionImplementationType` / `AdtBehaviorDefinitionType` types). Rename the exported interfaces/types from `*BehaviorDefinition*` to `*CdsType*`:
- `IBehaviorDefinitionConfig` → `ICdsTypeConfig` (fields: `name`, `description`, `packageName`, `transportRequest?`, `sourceCode?`)
- `IBehaviorDefinitionState` → `ICdsTypeState`
- `IBehaviorDefinitionCreateParams` → `ICdsTypeCreateParams`
- `IBehaviorDefinitionValidationParams` → delete (no validation endpoint is used; also delete `validation.ts` and its `index.ts` export and any `validate()` call in the orchestration class).

- [ ] **Step 5: Rename the orchestration class** `src/core/cdsType/AdtBehaviorDefinition.ts` → `AdtCdsType.ts`

```bash
git -C /Users/<user>/Developer/BTP/mcp-abap-adt-clients mv src/core/cdsType/AdtBehaviorDefinition.ts src/core/cdsType/AdtCdsType.ts
```
Inside it and in `src/core/cdsType/index.ts`, rename the class `AdtBehaviorDefinition` → `AdtCdsType`, drop the `validate()` step from `create()`, drop `check`/`validation` imports if unused, and rename the `*BehaviorDefinition*` type references to the `*CdsType*` names from Step 4. Keep the `setSessionType('stateful'|'stateless')` calls exactly as they are.

- [ ] **Step 6: Wire `getCdsType()` into the client** `src/clients/AdtClient.ts`

Add an import near the other `Adt*` imports:
```typescript
import { AdtCdsType } from '../core/cdsType/AdtCdsType';
import type { ICdsTypeConfig, ICdsTypeState } from '../core/cdsType';
```
Add a factory method next to `getBehaviorDefinition()`:
```typescript
  getCdsType(): IAdtObject<ICdsTypeConfig, ICdsTypeState> {
    return new AdtCdsType(this.connection, this.logger);
  }
```
In `src/clients/AdtClientLegacy.ts`, add an override that throws like `getBehaviorDefinition` does (DRTY is not available on legacy):
```typescript
  override getCdsType(): never {
    throw new Error('CDS types (DRTY) are not supported on legacy systems');
  }
```
(Match the exact throw style already used by `getBehaviorDefinition(): never` in that file.)

- [ ] **Step 7: Export the public types** in `src/index.ts`

Mirror the `behaviorDefinition` export block (around line 85-96), adding:
```typescript
export type {
  ICdsTypeConfig,
  ICdsTypeCreateParams,
  ICdsTypeState,
} from './core/cdsType';
```

- [ ] **Step 8: Build**

Run: `cd /Users/<user>/Developer/BTP/mcp-abap-adt-clients && npm run build`
Expected: Biome clean + tsc no errors. Fix any leftover `BehaviorDefinition`/`implementationType`/`rootEntity`/`validate` references the compiler flags.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(cdsType): add DRTY CDS type client (clone of behaviorDefinition)"
```

### Task A2: Namespace URL-encoding unit test for cdsType

**Files:**
- Test: `src/__tests__/unit/core/cdsType/Namespace.test.ts`

- [ ] **Step 1: Write the test** (mirror the BDEF namespace test, asserting the drty endpoints encode the name)

```typescript
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { lock } from '../../../../core/cdsType/lock';
import { unlock } from '../../../../core/cdsType/unlock';
import { update } from '../../../../core/cdsType/update';

const LOCK_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><LOCK_HANDLE>LH1</LOCK_HANDLE><CORRNR/></DATA></asx:values></asx:abap>`;

function conn(data = '') {
  return { makeAdtRequest: jest.fn().mockResolvedValue({ status: 200, data }) } as unknown as IAbapConnection;
}
const firstUrl = (c: IAbapConnection) => (c.makeAdtRequest as jest.Mock).mock.calls[0][0].url;

const NS = '/NSP/MYTYPE';
const ENC = 'drty/sources/%2fnsp%2fmytype';
const RAW = 'drty/sources//nsp';

describe('cds type namespace URL encoding', () => {
  it('lock() encodes the namespaced name', async () => {
    const c = conn(LOCK_RESPONSE);
    await lock(c, NS);
    expect(firstUrl(c)).toContain(ENC);
    expect(firstUrl(c)).not.toContain(RAW);
  });
  it('update() encodes the namespaced name', async () => {
    const c = conn();
    await update(c, { name: NS, sourceCode: 'define type X : abap.char(1);', lockHandle: 'LH1' });
    expect(firstUrl(c)).toContain(ENC);
  });
  it('unlock() encodes the namespaced name', async () => {
    const c = conn();
    await unlock(c, NS, 'LH1');
    expect(firstUrl(c)).toContain(ENC);
  });
});
```

(If the cloned `lock`/`update`/`unlock` signatures differ, adjust the calls to match the cloned functions — they are identical to `behaviorDefinition`'s.)

- [ ] **Step 2: Run + build**

Run: `npx jest cdsType/Namespace --runInBand` → 3 passing. Then `npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(cdsType): namespace URL-encoding unit tests"
```

---

## PART B — core fork: CDS Type handlers

Work in `/Users/<user>/Developer/BTP/mcp-abap-adt` on branch `feat/cds-type-tools` (already created). Ensure the adt-clients fork is linked: `npm link @mcp-abap-adt/adt-clients` (already linked from earlier work; re-run if needed). Rebuild the fork (Task A) first so `client.getCdsType()` exists.

### Task B1: Source guard + scaffold helpers (TDD)

**Files:**
- Create: `src/handlers/cds_type/cdsTypeSource.ts`
- Test: `src/__tests__/unit/cdsTypeSource.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { buildCdsTypeScaffold, isCdsTypeSource } from '../../handlers/cds_type/cdsTypeSource';

describe('cdsTypeSource', () => {
  it('accepts a define type source', () => {
    expect(isCdsTypeSource('define type X : abap.int4 enum { a = 1; }')).toBe(true);
  });
  it('accepts leading annotations and mixed case', () => {
    expect(isCdsTypeSource("@EndUserText.label: 'x'\nDEFINE  TYPE X : abap.char(1);")).toBe(true);
  });
  it('rejects a table entity / view source', () => {
    expect(isCdsTypeSource('define table entity X { key a : abap.int4; }')).toBe(false);
    expect(isCdsTypeSource('define view entity X as select from y { key y.a }')).toBe(false);
  });
  it('scaffold is a valid scalar define type carrying the name', () => {
    const s = buildCdsTypeScaffold('Z_MY_TYPE');
    expect(isCdsTypeSource(s)).toBe(true);
    expect(s).toContain('Z_MY_TYPE');
    expect(s).toContain('abap.char(10)');
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `npx jest cdsTypeSource --runInBand` → FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// src/handlers/cds_type/cdsTypeSource.ts
/** True if the DDL declares a CDS `define type` (and not a view/table entity). */
export function isCdsTypeSource(source: string): boolean {
  const s = source ?? '';
  if (/\bdefine\s+(view|table)\b/i.test(s)) return false;
  return /\bdefine\s+type\b/i.test(s);
}

/** Minimal scalar CDS Simple Type scaffold carrying the given name. */
export function buildCdsTypeScaffold(name: string): string {
  return `@EndUserText.label: '${name}'
define type ${name} : abap.char(10);
`;
}
```

- [ ] **Step 4: Run → pass**

Run: `npx jest cdsTypeSource --runInBand` → 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/cds_type/cdsTypeSource.ts src/__tests__/unit/cdsTypeSource.test.ts
git commit -m "feat(cds-type): add source guard and scaffold helpers"
```

### Task B2: CreateCdsType handler

**Files:**
- Create: `src/handlers/cds_type/high/handleCreateCdsType.ts`

- [ ] **Step 1: Write the handler**

```typescript
// src/handlers/cds_type/high/handleCreateCdsType.ts
import type { ICdsTypeConfig } from '@mcp-abap-adt/adt-clients';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  extractAdtErrorMessage,
  return_error,
  return_response,
} from '../../../lib/utils';
import { buildCdsTypeScaffold, isCdsTypeSource } from '../cdsTypeSource';

export const TOOL_DEFINITION = {
  name: 'CreateCdsType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: CdsType. Create a CDS Type (`define type`, ADT object DRTY/STY — a CDS Simple Type, e.g. a CDS enum). With `source`: create, set it, and activate in one call; without `source`: create a minimal inactive scalar scaffold (`define type NAME : abap.char(10);`). Edit later with UpdateCdsType.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'CDS type name (e.g., Z_MY_TYPE or /NS/MY_TYPE).' },
      package_name: { type: 'string', description: 'Package name (e.g., ZPKG, $TMP).' },
      transport_request: { type: 'string', description: 'Transport request (required for transportable packages).' },
      description: { type: 'string', description: 'Optional description (defaults to name).' },
      source: { type: 'string', description: 'Optional complete DDL source starting with "define type". If omitted, a minimal inactive scalar scaffold is created.' },
      activate: { type: 'boolean', description: 'Activate after setting source. Default true. Ignored when no source is provided (scaffold stays inactive).' },
    },
    required: ['name', 'package_name'],
  },
} as const;

interface CreateCdsTypeArgs {
  name: string;
  package_name: string;
  transport_request?: string;
  description?: string;
  source?: string;
  activate?: boolean;
}

export async function handleCreateCdsType(context: HandlerContext, params: any) {
  const { connection, logger } = context;
  const args: CreateCdsTypeArgs = params;
  if (!args.name || !args.package_name) {
    return return_error(new Error('Missing required parameters: name and package_name'));
  }
  const hasSource = typeof args.source === 'string' && args.source.trim().length > 0;
  if (hasSource && !isCdsTypeSource(args.source as string)) {
    return return_error(new Error('source is not a CDS type; it must contain "define type" (and not "define view"/"define table entity").'));
  }
  const effectiveSource = hasSource ? (args.source as string) : buildCdsTypeScaffold(args.name);
  const activate = hasSource ? args.activate !== false : false;

  try {
    const client = createAdtClient(connection, logger);
    const cds = client.getCdsType();

    const createConfig: Pick<ICdsTypeConfig, 'name' | 'description' | 'packageName' | 'transportRequest'> = {
      name: args.name,
      description: args.description || args.name,
      packageName: args.package_name,
      transportRequest: args.transport_request,
    };
    await cds.create(createConfig);

    await cds.update(
      { name: args.name, sourceCode: effectiveSource, transportRequest: args.transport_request },
      { activateOnUpdate: activate },
    );

    return return_response({
      data: JSON.stringify({
        success: true,
        name: args.name.toUpperCase(),
        package_name: args.package_name,
        transport_request: args.transport_request || null,
        type: 'DRTY',
        kind: 'cds_type',
        activated: activate,
        scaffolded: !hasSource,
        message: hasSource
          ? `CDS type ${args.name.toUpperCase()} created${activate ? ' and activated' : ''} successfully.`
          : `CDS type ${args.name.toUpperCase()} created as an inactive scaffold. Edit it with UpdateCdsType, then it will activate.`,
      }, null, 2),
    } as AxiosResponse);
  } catch (error: any) {
    const msg = extractAdtErrorMessage(error, `Failed to create CDS type ${args.name}`);
    logger?.error(msg);
    return return_error(new Error(msg));
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` → no errors. (If `cds.update`'s second-arg option name differs from `activateOnUpdate`, match the cloned `AdtCdsType.update` signature — it mirrors `AdtBehaviorDefinition.update`.)

- [ ] **Step 3: Commit**

```bash
git add src/handlers/cds_type/high/handleCreateCdsType.ts
git commit -m "feat(cds-type): add CreateCdsType handler"
```

### Task B3: UpdateCdsType handler

**Files:**
- Create: `src/handlers/cds_type/high/handleUpdateCdsType.ts`

- [ ] **Step 1: Write the handler**

```typescript
// src/handlers/cds_type/high/handleUpdateCdsType.ts
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  extractAdtErrorMessage,
  return_error,
  return_response,
} from '../../../lib/utils';
import { isCdsTypeSource } from '../cdsTypeSource';

export const TOOL_DEFINITION = {
  name: 'UpdateCdsType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update. Subject: CdsType. Update the DDL source of a CDS Type (`define type`, DRTY/STY). Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'CDS type name.' },
      source: { type: 'string', description: 'Complete DDL source starting with "define type".' },
      transport_request: { type: 'string', description: 'Transport request (required for transportable packages).' },
      activate: { type: 'boolean', description: 'Activate after update. Default true.' },
    },
    required: ['name', 'source'],
  },
} as const;

interface UpdateCdsTypeArgs {
  name: string;
  source: string;
  transport_request?: string;
  activate?: boolean;
}

export async function handleUpdateCdsType(context: HandlerContext, params: any) {
  const { connection, logger } = context;
  const args: UpdateCdsTypeArgs = params;
  if (!args.name || !args.source) {
    return return_error(new Error('Missing required parameters: name and source'));
  }
  if (!isCdsTypeSource(args.source)) {
    return return_error(new Error('source is not a CDS type; it must contain "define type" (and not "define view"/"define table entity").'));
  }
  const activate = args.activate !== false;
  try {
    const client = createAdtClient(connection, logger);
    await client.getCdsType().update(
      { name: args.name, sourceCode: args.source, transportRequest: args.transport_request },
      { activateOnUpdate: activate },
    );
    return return_response({
      data: JSON.stringify({
        success: true,
        name: args.name.toUpperCase(),
        kind: 'cds_type',
        activated: activate,
        message: `CDS type ${args.name.toUpperCase()} updated${activate ? ' and activated' : ''} successfully.`,
      }, null, 2),
    } as AxiosResponse);
  } catch (error: any) {
    const msg = extractAdtErrorMessage(error, `Failed to update CDS type ${args.name}`);
    logger?.error(msg);
    return return_error(new Error(msg));
  }
}
```

- [ ] **Step 2: Typecheck** → `npx tsc --noEmit -p tsconfig.json` → no errors.
- [ ] **Step 3: Commit** → `git add src/handlers/cds_type/high/handleUpdateCdsType.ts && git commit -m "feat(cds-type): add UpdateCdsType handler"`

### Task B4: GetCdsType handler

**Files:**
- Create: `src/handlers/cds_type/high/handleGetCdsType.ts`

- [ ] **Step 1: Write the handler**

```typescript
// src/handlers/cds_type/high/handleGetCdsType.ts
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  extractAdtErrorMessage,
  return_error,
  return_response,
  safeStringify,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetCdsType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read. Subject: CdsType. Retrieve the DDL source of a CDS Type (`define type`, DRTY/STY). Supports active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'CDS type name.' },
      version: { type: 'string', enum: ['active', 'inactive'], description: 'Version to read. Default "active".' },
    },
    required: ['name'],
  },
} as const;

interface GetCdsTypeArgs {
  name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetCdsType(context: HandlerContext, params: any) {
  const { connection, logger } = context;
  const args: GetCdsTypeArgs = params;
  if (!args.name) return return_error(new Error('Missing required parameter: name'));
  const version = args.version || 'active';
  try {
    const client = createAdtClient(connection, logger);
    const state = await client.getCdsType().read({ name: args.name }, version);
    const data = state?.readResult?.data;
    const source = typeof data === 'string' ? data : safeStringify(data);
    if (!source || !/define\s+type/i.test(source)) {
      return return_error(new Error(`CDS type ${args.name} not found`));
    }
    return return_response({
      data: JSON.stringify({ success: true, name: args.name.toUpperCase(), version, kind: 'cds_type', source }, null, 2),
    } as AxiosResponse);
  } catch (error: any) {
    const msg = extractAdtErrorMessage(error, `Failed to read CDS type ${args.name}`);
    logger?.error(msg);
    return return_error(new Error(msg));
  }
}
```

- [ ] **Step 2: Typecheck** → no errors. (Confirm `read(config, version)` matches the cloned `AdtCdsType.read` signature — mirrors `AdtBehaviorDefinition.read`.)
- [ ] **Step 3: Commit** → `git add ... && git commit -m "feat(cds-type): add GetCdsType handler"`

### Task B5: DeleteCdsType handler

**Files:**
- Create: `src/handlers/cds_type/high/handleDeleteCdsType.ts`

- [ ] **Step 1: Write the handler**

```typescript
// src/handlers/cds_type/high/handleDeleteCdsType.ts
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  extractAdtErrorMessage,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteCdsType',
  available_in: ['onprem', 'cloud'] as const,
  description: 'Operation: Delete. Subject: CdsType. Delete a CDS Type (`define type`, DRTY/STY).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'CDS type name.' },
      transport_request: { type: 'string', description: 'Transport request (required for transportable objects).' },
    },
    required: ['name'],
  },
} as const;

interface DeleteCdsTypeArgs {
  name: string;
  transport_request?: string;
}

export async function handleDeleteCdsType(context: HandlerContext, params: any) {
  const { connection, logger } = context;
  const args: DeleteCdsTypeArgs = params;
  if (!args.name) return return_error(new Error('Missing required parameter: name'));
  try {
    const client = createAdtClient(connection, logger);
    await client.getCdsType().delete({ name: args.name, transportRequest: args.transport_request });
    return return_response({
      data: JSON.stringify({
        success: true,
        name: args.name.toUpperCase(),
        kind: 'cds_type',
        transport_request: args.transport_request || null,
        message: `CDS type ${args.name.toUpperCase()} deleted successfully.`,
      }, null, 2),
    } as AxiosResponse);
  } catch (error: any) {
    const msg = extractAdtErrorMessage(error, `Failed to delete CDS type ${args.name}`);
    logger?.error(msg);
    return return_error(new Error(msg));
  }
}
```

- [ ] **Step 2: Typecheck** → no errors. (`delete(config)` takes the transport inside `config.transportRequest`, matching the cloned `AdtCdsType.delete`.)
- [ ] **Step 3: Commit** → `git add ... && git commit -m "feat(cds-type): add DeleteCdsType handler"`

### Task B6: Register the tools

**Files:**
- Modify: `src/lib/handlers/groups/HighLevelHandlersGroup.ts`

- [ ] **Step 1: Add imports** (near the other high-level handler imports):

```typescript
import { TOOL_DEFINITION as CreateCdsType_Tool, handleCreateCdsType } from '../../../handlers/cds_type/high/handleCreateCdsType';
import { TOOL_DEFINITION as UpdateCdsType_Tool, handleUpdateCdsType } from '../../../handlers/cds_type/high/handleUpdateCdsType';
import { TOOL_DEFINITION as GetCdsType_Tool, handleGetCdsType } from '../../../handlers/cds_type/high/handleGetCdsType';
import { TOOL_DEFINITION as DeleteCdsType_Tool, handleDeleteCdsType } from '../../../handlers/cds_type/high/handleDeleteCdsType';
```

- [ ] **Step 2: Register** inside the `getHandlers()` return array:

```typescript
      { toolDefinition: CreateCdsType_Tool, handler: withContext(handleCreateCdsType) },
      { toolDefinition: UpdateCdsType_Tool, handler: withContext(handleUpdateCdsType) },
      { toolDefinition: GetCdsType_Tool, handler: withContext(handleGetCdsType) },
      { toolDefinition: DeleteCdsType_Tool, handler: withContext(handleDeleteCdsType) },
```

- [ ] **Step 3: Build + handler test** → `npm run build:fast && npx jest handlers.test --runInBand` → build OK, passes.
- [ ] **Step 4: Commit** → `git add ... && git commit -m "feat(cds-type): register CdsType tools in HighLevelHandlersGroup"`

### Task B7: Live CRUD integration test (gated)

**Files:**
- Create: `src/__tests__/integration/high/cdsType/CdsType.test.ts`

- [ ] **Step 1: Write the test** (standard policy, gated by `NS_TEST_PACKAGE`, asserted delete + confirm-gone with retry — mirror `TableEntity.test.ts`)

```typescript
import { handleCreateCdsType } from '../../../../handlers/cds_type/high/handleCreateCdsType';
import { handleDeleteCdsType } from '../../../../handlers/cds_type/high/handleDeleteCdsType';
import { handleGetCdsType } from '../../../../handlers/cds_type/high/handleGetCdsType';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../../helpers/sessionHelpers';
import { createHandlerContext, parseHandlerResponse } from '../../helpers/testHelpers';

const PKG = process.env.NS_TEST_PACKAGE?.trim();
const TRANSPORT = process.env.NS_TEST_TRANSPORT?.trim();
const NAME = process.env.NS_TEST_CDSTYPE_NAME?.trim() || 'Z_MCP_CDSTYPE_TEST';
const logger = createTestLogger('cds-type');
const describeOrSkip = PKG ? describe : describe.skip;

describeOrSkip('CdsType tools (live CRUD)', () => {
  let connection: Awaited<ReturnType<typeof createTestConnectionAndSession>>['connection'];

  async function deleteType(ctx: ReturnType<typeof createHandlerContext>) {
    let last: Awaited<ReturnType<typeof handleDeleteCdsType>> | undefined;
    for (let i = 0; i < 3; i++) {
      last = await handleDeleteCdsType(ctx, { name: NAME, transport_request: TRANSPORT });
      if (!last.isError) return last;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return last;
  }

  beforeAll(async () => { if (!PKG) return; ({ connection } = await createTestConnectionAndSession()); }, getTimeout('long'));
  afterAll(async () => { if (!PKG || !connection) return; await deleteType(createHandlerContext({ connection, logger })); }, getTimeout('long'));

  it('creates (with source + activate), reads it back, then deletes it', async () => {
    const ctx = createHandlerContext({ connection, logger });
    const source = `@EndUserText.label: 'MCP test type'
define type ${NAME} : abap.int4 enum
{
  unknown = initial;
  one     = 1;
}
`;
    const created = await handleCreateCdsType(ctx, { name: NAME, package_name: PKG, transport_request: TRANSPORT, description: 'MCP CDS type CRUD test', source, activate: true });
    expect(created.isError).toBe(false);
    const cd = parseHandlerResponse(created);
    expect(cd.kind).toBe('cds_type');
    expect(cd.activated).toBe(true);

    const got = await handleGetCdsType(ctx, { name: NAME });
    expect(got.isError).toBe(false);
    expect(String(parseHandlerResponse(got).source).toLowerCase()).toContain('define type');

    const deleted = await deleteType(ctx);
    expect(deleted?.isError).toBe(false);
    const gone = await handleGetCdsType(ctx, { name: NAME });
    expect(gone.isError).toBe(true);
  }, getTimeout('long'));
});
```

- [ ] **Step 2: Gated-off skip** → `npx jest --testPathPatterns="integration/high/cdsType" --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit` → `1 skipped`.
- [ ] **Step 3: Live (controller runs this — needs SAP creds):**
```bash
NS_TEST_PACKAGE='/NSP/MEDICATIONSTATEMENT' NS_TEST_TRANSPORT='<TRANSPORT>' NS_TEST_CDSTYPE_NAME='/NSP/MCP_CDSTYPE_TEST' \
  npx jest --testPathPatterns="integration/high/cdsType" --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit
```
Expected: `1 passed`; the entity is deleted (the test asserts gone).
- [ ] **Step 4: Commit** → `git add ... && git commit -m "test(cds-type): add live CRUD integration test (gated)"`

---

## PART C — Docs, delivery, and LOCAL availability of ALL improvements

### Task C1: Docs + remove spec/plan

**Files:**
- Create: `docs/development/cds-type-tools.md`
- Delete: `docs/superpowers/specs/2026-06-12-cds-type-tools-design.md`, `docs/superpowers/plans/2026-06-12-cds-type-tools.md`

- [ ] **Step 1: Write the doc**

```markdown
# CDS Type (DRTY) tools

A CDS Type (`define type`, ADT object DRTY/STY — a CDS Simple Type such as an
enum) lives under `/sap/bc/adt/ddic/drty/sources`. Support is provided by a new
`cdsType` client in `@mcp-abap-adt/adt-clients` (a clone of the behaviorDefinition
client), exposed via `client.getCdsType()`.

Tools (`available_in: onprem, cloud`):
- **CreateCdsType** — `name`, `package_name`, `transport_request?`, `description?`, `source?`, `activate?`. With `source`: create → set → activate in one call. Without `source`: a minimal inactive scalar scaffold (`define type NAME : abap.char(10);`).
- **UpdateCdsType** — `name`, `source`, `transport_request?`, `activate?`.
- **GetCdsType** — `name`, `version?`.
- **DeleteCdsType** — `name`, `transport_request?`.

`source` must contain `define type` (and not `define view`/`define table entity`).
Tested via `src/__tests__/integration/high/cdsType/CdsType.test.ts` (gated by `NS_TEST_PACKAGE`).
```

- [ ] **Step 2: Remove spec/plan** → `git rm docs/superpowers/specs/2026-06-12-cds-type-tools-design.md docs/superpowers/plans/2026-06-12-cds-type-tools.md`
- [ ] **Step 3: Full verify** → `npm run build && npm test` → build clean, unit suite passes.
- [ ] **Step 4: Commit** → `git add docs/development/cds-type-tools.md && git commit -m "docs(cds-type): document the CdsType tools and remove spec/plan"`

### Task C2: Push fork branches

- [ ] **Step 1:** adt-clients fork: `cd /Users/<user>/Developer/BTP/mcp-abap-adt-clients && git push -u fork feat/cds-type-client`
- [ ] **Step 2:** core fork: `cd /Users/<user>/Developer/BTP/mcp-abap-adt && git push -u origin feat/cds-type-tools`

### Task C3: Build the combined LOCAL MCP (all improvements)

The user's MCP must have BDEF namespace fix + table-entity tools + CDS-type tools. Combine them on a local integration branch and build.

- [ ] **Step 1: adt-clients** — `feat/cds-type-client` is already based on `fix/bdef-namespace-url-encoding`, so it has both the namespace fix and cdsType. Ensure it is the checked-out, built, linked branch:
```bash
cd /Users/<user>/Developer/BTP/mcp-abap-adt-clients
git checkout feat/cds-type-client && npm run build && npm link
```
- [ ] **Step 2: core integration branch** — combine the table-entity and cds-type tools:
```bash
cd /Users/<user>/Developer/BTP/mcp-abap-adt
git checkout -B local/all-features main
git merge --no-edit feat/table-entity-tools feat/cds-type-tools
npm link @mcp-abap-adt/adt-clients
npm run build
```
Expected: clean merge (the two branches touch different files + the same registration file — resolve the `HighLevelHandlersGroup.ts` import/registration conflict by keeping BOTH sets of imports and BOTH sets of array entries), build clean.
- [ ] **Step 3: Smoke-test the built server lists the new tools:**
```bash
node -e 'const {HighLevelHandlersGroup}=require("./dist/lib/handlers/groups/HighLevelHandlersGroup.js"); const names=new (HighLevelHandlersGroup)().getHandlers().map(h=>h.toolDefinition.name); for(const n of ["CreateTableEntity","CreateCdsType","UpdateCdsType","GetCdsType","DeleteCdsType"]) console.log(n, names.includes(n)?"OK":"MISSING");'
```
Expected: all `OK`. (If the group constructor needs args, adapt the snippet to how the group is instantiated in `BaseMcpServer.ts`.)

### Task C4: Point the user's MCP client at the local build

The MCP is configured with `command: "mcp-abap-adt"`, `args: ["--transport=stdio","--env=<system>"]` in `~/.claude.json` (global `mcpServers.abap-adt` AND project `projects./Users/<user>.mcpServers.abap-adt`) and in `~/Library/Application Support/Claude/claude_desktop_config.json` (`mcpServers.abap-adt`). Repoint them to the local launcher.

- [ ] **Step 1: Back up the configs**
```bash
cp ~/.claude.json ~/.claude.json.bak-$(node -e 'console.log(Date.now())' 2>/dev/null || echo manual)
cp "$HOME/Library/Application Support/Claude/claude_desktop_config.json" "$HOME/Library/Application Support/Claude/claude_desktop_config.json.bak"
```
- [ ] **Step 2: Update both files** — set `command: "node"` and prepend the launcher path to args, for every `abap-adt` block:
  - new `command`: `"node"`
  - new `args`: `["/Users/<user>/Developer/BTP/mcp-abap-adt/dist/server/launcher.js", "--transport=stdio", "--env=<system>"]`

  Use a Node script that walks the JSON and rewrites each `abap-adt` server whose `command === "mcp-abap-adt"`. (Controller will do this edit with the user's confirmation, since it changes their global client config.)
- [ ] **Step 3: Tell the user to fully restart Claude Code / Claude Desktop**, then verify a new tool works, e.g. ask the MCP to `GetCdsType` for `/NSP/MedAdherenceCodeENUM` (should return the enum source) and confirm `CreateTableEntity` / `CreateCdsType` appear in the tool list.

### Task C5: Report

- [ ] Report pushed fork branches + English PR-title/body drafts (adt-clients and core), and confirm the local MCP now exposes all improvements.

---

## Self-Review

- **Spec coverage:** new `cdsType` client mirroring behaviorDefinition with the proven DRTY protocol (Task A1, payload from spec), `getCdsType()` wiring (A1), namespace-safe URLs + unit test (A1/A2), 4 handlers with single-call create + scalar scaffold + `define type` guard + `available_in: onprem,cloud` (B1-B5), registration (B6), gated live CRUD test (B7), docs (C1), 2 fork branches/PRs (C2/C5), and the LOCAL availability of all improvements via combined build + MCP config repoint (C3/C4). All spec sections covered.
- **Placeholder scan:** the clone-and-transform tasks give exact `perl`/edit instructions and the exact create payload; handler tasks give complete code; the only "match the cloned signature" notes are guarded by "mirrors AdtBehaviorDefinition" with a concrete fallback. No TBD/TODO.
- **Type consistency:** `ICdsTypeConfig`/`ICdsTypeState`/`ICdsTypeCreateParams`, `AdtCdsType`, `getCdsType()`, `isCdsTypeSource`/`buildCdsTypeScaffold`, and the handler→client method calls are used consistently. The client surface was VERIFIED against `AdtBehaviorDefinition`: `create(config, options?)`, `update(config, { activateOnUpdate })` (does the full lock→update→unlock→activate chain), `read(config, version, options?)`, `delete(config)` (transport in `config.transportRequest`). The handler code matches these exactly.
