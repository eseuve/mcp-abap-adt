/**
 * CreateTableEntity - create a CDS table entity (DDLS/DF) via the view (DDLS)
 * handlers. With `source`: create -> set source -> activate (one call).
 * Without `source`: create + set a minimal inactive scaffold.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { handleCreateView } from '../../view/high/handleCreateView';
import { handleUpdateView } from '../../view/high/handleUpdateView';
import {
  buildTableEntityScaffold,
  isTableEntitySource,
} from '../tableEntitySource';

export const TOOL_DEFINITION = {
  name: 'CreateTableEntity',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: TableEntity. Create a CDS table entity (`define table entity`) — a CDS-managed persisted database table (DDLS/DF). Pass `source` to create, set it, and activate in one call; omit `source` to create a minimal inactive scaffold (key Uuid). Edit later with UpdateTableEntity.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Table entity name (e.g., Z_T_MY_ENTITY or /NS/T_MY_ENTITY).',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZPKG, $TMP for local objects).',
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
          'Optional complete DDL source starting with "define table entity". If omitted, a minimal inactive scaffold with a key Uuid field is created.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate after setting source. Default true. Ignored when no source is provided (the scaffold stays inactive).',
      },
    },
    required: ['name', 'package_name'],
  },
} as const;

interface CreateTableEntityArgs {
  name: string;
  package_name: string;
  transport_request?: string;
  description?: string;
  source?: string;
  activate?: boolean;
}

export async function handleCreateTableEntity(
  context: HandlerContext,
  params: any,
) {
  const args: CreateTableEntityArgs = params;
  if (!args.name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: name and package_name'),
    );
  }

  const hasSource =
    typeof args.source === 'string' && args.source.trim().length > 0;
  if (hasSource && !isTableEntitySource(args.source as string)) {
    return return_error(
      new Error(
        'source is not a table entity; it must contain "define table entity". Use CreateView for CDS views.',
      ),
    );
  }

  const effectiveSource = hasSource
    ? (args.source as string)
    : buildTableEntityScaffold(args.name);
  // Provided source activates per `activate` (default true); a scaffold stays inactive.
  const activate = hasSource ? args.activate !== false : false;

  const created = await handleCreateView(context, {
    view_name: args.name,
    package_name: args.package_name,
    transport_request: args.transport_request,
    description: args.description || args.name,
  });
  if (created?.isError) return created;

  const updated = await handleUpdateView(context, {
    view_name: args.name,
    ddl_source: effectiveSource,
    transport_request: args.transport_request,
    activate,
  });
  if (updated?.isError) return updated;

  return return_response({
    data: JSON.stringify(
      {
        success: true,
        name: args.name.toUpperCase(),
        package_name: args.package_name,
        transport_request: args.transport_request || null,
        type: 'DDLS',
        kind: 'table_entity',
        activated: activate,
        scaffolded: !hasSource,
        message: hasSource
          ? `Table entity ${args.name.toUpperCase()} created${activate ? ' and activated' : ''} successfully.`
          : `Table entity ${args.name.toUpperCase()} created as an inactive scaffold. Edit it with UpdateTableEntity to add fields, then it will activate.`,
      },
      null,
      2,
    ),
  } as AxiosResponse);
}
