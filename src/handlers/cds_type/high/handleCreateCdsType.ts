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
      name: {
        type: 'string',
        description: 'CDS type name (e.g., Z_MY_TYPE or /NS/MY_TYPE).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZPKG, $TMP).',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request (required for transportable packages).',
      },
      description: {
        type: 'string',
        description: 'Optional description (defaults to name).',
      },
      source: {
        type: 'string',
        description:
          'Optional complete DDL source starting with "define type". If omitted, a minimal inactive scalar scaffold is created.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate after setting source. Default true. Ignored when no source is provided (scaffold stays inactive).',
      },
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

export async function handleCreateCdsType(
  context: HandlerContext,
  params: any,
) {
  const { connection, logger } = context;
  const args: CreateCdsTypeArgs = params;
  if (!args.name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: name and package_name'),
    );
  }
  const hasSource =
    typeof args.source === 'string' && args.source.trim().length > 0;
  if (hasSource && !isCdsTypeSource(args.source as string)) {
    return return_error(
      new Error(
        'source is not a CDS type; it must contain "define type" (and not "define view"/"define table entity").',
      ),
    );
  }
  const effectiveSource = hasSource
    ? (args.source as string)
    : buildCdsTypeScaffold(args.name);
  const activate = hasSource ? args.activate !== false : false;

  try {
    const client = createAdtClient(connection, logger);
    const cds = client.getCdsType();

    const createConfig: ICdsTypeConfig = {
      name: args.name,
      description: args.description || args.name,
      packageName: args.package_name,
      transportRequest: args.transport_request,
    };
    await cds.create(createConfig);

    await cds.update(
      {
        name: args.name,
        sourceCode: effectiveSource,
        transportRequest: args.transport_request,
      },
      { activateOnUpdate: activate },
    );

    return return_response({
      data: JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    const msg = extractAdtErrorMessage(
      error,
      `Failed to create CDS type ${args.name}`,
    );
    logger?.error(msg);
    return return_error(new Error(msg));
  }
}
