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
      source: {
        type: 'string',
        description: 'Complete DDL source starting with "define type".',
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

interface UpdateCdsTypeArgs {
  name: string;
  source: string;
  transport_request?: string;
  activate?: boolean;
}

export async function handleUpdateCdsType(
  context: HandlerContext,
  params: any,
) {
  const { connection, logger } = context;
  const args: UpdateCdsTypeArgs = params;
  if (!args.name || !args.source) {
    return return_error(
      new Error('Missing required parameters: name and source'),
    );
  }
  if (!isCdsTypeSource(args.source)) {
    return return_error(
      new Error(
        'source is not a CDS type; it must contain "define type" (and not "define view"/"define table entity").',
      ),
    );
  }
  const activate = args.activate !== false;
  try {
    const client = createAdtClient(connection, logger);
    await client.getCdsType().update(
      {
        name: args.name,
        sourceCode: args.source,
        transportRequest: args.transport_request,
      },
      { activateOnUpdate: activate },
    );
    return return_response({
      data: JSON.stringify(
        {
          success: true,
          name: args.name.toUpperCase(),
          kind: 'cds_type',
          activated: activate,
          message: `CDS type ${args.name.toUpperCase()} updated${activate ? ' and activated' : ''} successfully.`,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    const msg = extractAdtErrorMessage(
      error,
      `Failed to update CDS type ${args.name}`,
    );
    logger?.error(msg);
    return return_error(new Error(msg));
  }
}
