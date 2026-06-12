/** True if the DDL declares a CDS `define type` (and not a view/table entity). */
export function isCdsTypeSource(source: string): boolean {
  const s = source ?? '';
  if (/\bdefine\s+(view|table)\b/i.test(s)) return false;
  return /\bdefine\s+type\b/i.test(s);
}

/** Minimal scalar CDS Simple Type scaffold carrying the given name. */
export function buildCdsTypeScaffold(name: string): string {
  return `@EndUserText.label: '${name}'
define type ${name} : abap.char(10);
`;
}
