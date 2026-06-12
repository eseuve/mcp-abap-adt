// src/handlers/cds_type/high/handleGetCdsType.ts
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  extractAdtErrorMessage,
  return_error,
  return_response,
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
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read. Default "active".',
      },
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
  if (!args.name)
    return return_error(new Error('Missing required parameter: name'));
  const version = args.version || 'active';
  try {
    const client = createAdtClient(connection, logger);
    const state = await client.getCdsType().read({ name: args.name }, version);
    const data = state?.readResult?.data;
    const source = typeof data === 'string' ? data : JSON.stringify(data);
    if (!source || !/define\s+type/i.test(source)) {
      return return_error(new Error(`CDS type ${args.name} not found`));
    }
    return return_response({
      data: JSON.stringify(
        {
          success: true,
          name: args.name.toUpperCase(),
          version,
          kind: 'cds_type',
          source,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    const msg = extractAdtErrorMessage(
      error,
      `Failed to read CDS type ${args.name}`,
    );
    logger?.error(msg);
    return return_error(new Error(msg));
  }
}
