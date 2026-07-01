/**
 * DeleteTableEntity - delete a CDS table entity (DDLS/DF). Delegates to
 * DeleteDdl and re-labels the payload.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { handleDeleteDdl } from '../../ddl/high/handleDeleteDdl';

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

  const res = await handleDeleteDdl(context, {
    ddl_name: args.name,
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
