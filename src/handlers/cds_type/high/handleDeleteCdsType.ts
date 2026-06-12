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
  description:
    'Operation: Delete. Subject: CdsType. Delete a CDS Type (`define type`, DRTY/STY).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'CDS type name.' },
      transport_request: {
        type: 'string',
        description: 'Transport request (required for transportable objects).',
      },
    },
    required: ['name'],
  },
} as const;

interface DeleteCdsTypeArgs {
  name: string;
  transport_request?: string;
}

export async function handleDeleteCdsType(
  context: HandlerContext,
  params: any,
) {
  const { connection, logger } = context;
  const args: DeleteCdsTypeArgs = params;
  if (!args.name)
    return return_error(new Error('Missing required parameter: name'));
  try {
    const client = createAdtClient(connection, logger);
    await client
      .getCdsType()
      .delete({ name: args.name, transportRequest: args.transport_request });
    return return_response({
      data: JSON.stringify(
        {
          success: true,
          name: args.name.toUpperCase(),
          kind: 'cds_type',
          transport_request: args.transport_request || null,
          message: `CDS type ${args.name.toUpperCase()} deleted successfully.`,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    const msg = extractAdtErrorMessage(
      error,
      `Failed to delete CDS type ${args.name}`,
    );
    logger?.error(msg);
    return return_error(new Error(msg));
  }
}
