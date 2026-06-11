/**
 * Integration test: reading a namespaced behavior definition (e.g. `/NSP/...`).
 *
 * Verifies the `@mcp-abap-adt/adt-clients` fix that URL-encodes namespaced
 * object names. Before the fix the client built
 * `.../behaviordefinitions//nsp/...` (raw slashes) and SAP returned "not found";
 * after the fix the name is encoded (`%2fnsp%2f...`) and the read succeeds.
 *
 * The connection is obtained through the project's standard test policy
 * (`createTestConnectionAndSession()` → config/.env-driven), not built by hand.
 *
 * Provide the namespaced BDEF name via the `NS_TEST_BDEF` env var; the test
 * skips cleanly when it is not set (e.g. CI without a namespaced object):
 *
 *   NS_TEST_BDEF='/YOUR/BDEF_NAME' npm run test:integration -- \
 *     --testPathPatterns=NamespaceBdef
 */

import { handleReadBehaviorDefinition } from '../../../../handlers/behavior_definition/readonly/handleReadBehaviorDefinition';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../../helpers/sessionHelpers';
import {
  createHandlerContext,
  parseHandlerResponse,
} from '../../helpers/testHelpers';

const NS_BDEF = process.env.NS_TEST_BDEF?.trim();
const logger = createTestLogger('namespace-bdef');

const describeOrSkip = NS_BDEF ? describe : describe.skip;

describeOrSkip(
  'Namespaced behavior definition read (adt-clients URL-encoding)',
  () => {
    let connection: Awaited<
      ReturnType<typeof createTestConnectionAndSession>
    >['connection'];

    beforeAll(async () => {
      if (!NS_BDEF) return;
      ({ connection } = await createTestConnectionAndSession());
    }, getTimeout('long'));

    it(
      'reads a namespaced BDEF without "not found"',
      async () => {
        const result = await handleReadBehaviorDefinition(
          createHandlerContext({ connection, logger }),
          { behavior_definition_name: NS_BDEF as string },
        );

        expect(result.isError).toBe(false);

        const payload = parseHandlerResponse(result);
        const text =
          typeof payload === 'string' ? payload : JSON.stringify(payload);
        expect(text.toLowerCase()).toContain('define behavior');
      },
      getTimeout('long'),
    );
  },
);
