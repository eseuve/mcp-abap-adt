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

  // Deleting right after activation can transiently fail while the freshly
  // generated persisted table settles; retry a few times.
  async function deleteEntity(ctx: ReturnType<typeof createHandlerContext>) {
    let last: Awaited<ReturnType<typeof handleDeleteTableEntity>> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      last = await handleDeleteTableEntity(ctx, {
        name: NAME,
        transport_request: TRANSPORT,
      });
      if (!last.isError) return last;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return last;
  }

  // Safety net: best-effort cleanup if the test threw before its own delete.
  afterAll(async () => {
    if (!PKG || !connection) return;
    await deleteEntity(createHandlerContext({ connection, logger }));
  }, getTimeout('long'));

  it(
    'creates (with source + activate), reads it back, then deletes it',
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

      // Create (single call: create -> set source -> activate)
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

      // Read back: the persisted source is a real table entity
      const got = await handleGetTableEntity(ctx, { name: NAME });
      expect(got.isError).toBe(false);
      const gotData = parseHandlerResponse(got);
      expect(String(gotData.source).toLowerCase()).toContain(
        'define table entity',
      );

      // Delete (asserted — leaves no orphan)
      const deleted = await deleteEntity(ctx);
      expect(deleted?.isError).toBe(false);

      // Confirm it is gone
      const goneRead = await handleGetTableEntity(ctx, { name: NAME });
      expect(goneRead.isError).toBe(true);
    },
    getTimeout('long'),
  );
});
