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
    await handleDeleteTableEntity(
      createHandlerContext({ connection, logger }),
      {
        name: NAME,
        transport_request: TRANSPORT,
      },
    );
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
