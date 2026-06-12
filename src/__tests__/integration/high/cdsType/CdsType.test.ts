import { handleCreateCdsType } from '../../../../handlers/cds_type/high/handleCreateCdsType';
import { handleDeleteCdsType } from '../../../../handlers/cds_type/high/handleDeleteCdsType';
import { handleGetCdsType } from '../../../../handlers/cds_type/high/handleGetCdsType';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../../helpers/sessionHelpers';
import {
  createHandlerContext,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

const PKG = process.env.NS_TEST_PACKAGE?.trim();
const TRANSPORT = process.env.NS_TEST_TRANSPORT?.trim();
const NAME = process.env.NS_TEST_CDSTYPE_NAME?.trim() || 'Z_MCP_CDSTYPE_TEST';
const logger = createTestLogger('cds-type');
const describeOrSkip = PKG ? describe : describe.skip;

describeOrSkip('CdsType tools (live CRUD)', () => {
  let connection: Awaited<
    ReturnType<typeof createTestConnectionAndSession>
  >['connection'];

  async function deleteType(ctx: ReturnType<typeof createHandlerContext>) {
    let last: Awaited<ReturnType<typeof handleDeleteCdsType>> | undefined;
    for (let i = 0; i < 3; i++) {
      last = await handleDeleteCdsType(ctx, {
        name: NAME,
        transport_request: TRANSPORT,
      });
      if (!last.isError) return last;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return last;
  }

  beforeAll(async () => {
    if (!PKG) return;
    ({ connection } = await createTestConnectionAndSession());
  }, getTimeout('long'));
  afterAll(async () => {
    if (!PKG || !connection) return;
    await deleteType(createHandlerContext({ connection, logger }));
  }, getTimeout('long'));

  it(
    'creates (with source + activate), reads it back, then deletes it',
    async () => {
      const ctx = createHandlerContext({ connection, logger });
      const source = `@EndUserText.label: 'MCP test type'
define type ${NAME} : abap.int4 enum
{
  unknown = initial;
  one     = 1;
}
`;
      const created = await handleCreateCdsType(ctx, {
        name: NAME,
        package_name: PKG,
        transport_request: TRANSPORT,
        description: 'MCP CDS type CRUD test',
        source,
        activate: true,
      });
      expect(created.isError).toBe(false);
      const cd = parseHandlerResponse(created);
      expect(cd.kind).toBe('cds_type');
      expect(cd.activated).toBe(true);

      const got = await handleGetCdsType(ctx, { name: NAME });
      expect(got.isError).toBe(false);
      expect(String(parseHandlerResponse(got).source).toLowerCase()).toContain(
        'define type',
      );

      const deleted = await deleteType(ctx);
      expect(deleted?.isError).toBe(false);
      const gone = await handleGetCdsType(ctx, { name: NAME });
      expect(gone.isError).toBe(true);
    },
    getTimeout('long'),
  );
});
