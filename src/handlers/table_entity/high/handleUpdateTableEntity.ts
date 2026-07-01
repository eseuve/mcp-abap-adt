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
import { handleUpdateDdl } from '../../ddl/high/handleUpdateDdl';
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
        'source is not a table entity; it must contain "define table entity". Use UpdateDdl for CDS views.',
      ),
    );
  }

  const activate = args.activate !== false;
  const updated = await handleUpdateDdl(context, {
    ddl_name: args.name,
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
