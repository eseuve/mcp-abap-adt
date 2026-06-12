/**
 * Helpers for CDS table entity (`define table entity`) sources.
 * A table entity is a DDLS/DF object, so it reuses the view (DDLS) handlers;
 * these helpers only distinguish a table-entity source and build a scaffold.
 */

/** True if the DDL source declares a `define table entity` (case/space-insensitive). */
export function isTableEntitySource(source: string): boolean {
  return /\bdefine\s+table\s+entity\b/i.test(source ?? '');
}

/** Minimal, valid table-entity scaffold with a UUID key, carrying the given name. */
export function buildTableEntityScaffold(name: string): string {
  return `@AbapCatalog.deliveryClass: #APPLICATION_DATA
@ClientHandling.type: #CLIENT_DEPENDENT
define table entity ${name}
{
  key Uuid : sysuuid_x16;
}
`;
}
