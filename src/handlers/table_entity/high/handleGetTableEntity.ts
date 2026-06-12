/**
 * GetTableEntity - read a table entity's DDL source. Delegates to GetView and
 * re-labels the payload with table-entity terminology.
 */
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { handleGetView } from '../../view/high/handleGetView';

export const TOOL_DEFINITION = {
  name: 'GetTableEntity',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read. Subject: TableEntity. Retrieve the DDL source of a CDS table entity (`define table entity`). Supports active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Table entity name.' },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read. Default "active".',
      },
    },
    required: ['name'],
  },
} as const;

interface GetTableEntityArgs {
  name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetTableEntity(
  context: HandlerContext,
  params: any,
) {
  const args: GetTableEntityArgs = params;
  if (!args.name) {
    return return_error(new Error('Missing required parameter: name'));
  }

  const res = await handleGetView(context, {
    view_name: args.name,
    version: args.version,
  });
  if (res?.isError) return res;

  const text = res?.content?.find?.((c: any) => c.type === 'text')?.text;
  try {
    const v = JSON.parse(text);
    return return_response({
      data: JSON.stringify(
        {
          success: true,
          name: v.view_name,
          version: v.version,
          kind: 'table_entity',
          source: v.view_data,
          status: v.status,
          status_text: v.status_text,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch {
    // Fall back to the raw GetView response if the payload is not JSON.
    return res;
  }
}
