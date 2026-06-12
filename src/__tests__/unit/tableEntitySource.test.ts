import {
  buildTableEntityScaffold,
  isTableEntitySource,
} from '../../handlers/table_entity/tableEntitySource';

describe('tableEntitySource', () => {
  it('accepts a define table entity source', () => {
    expect(
      isTableEntitySource('define table entity X { key a : abap.int4; }'),
    ).toBe(true);
  });

  it('accepts leading annotations and mixed case', () => {
    expect(
      isTableEntitySource(
        '@AbapCatalog.deliveryClass: #APPLICATION_DATA\nDEFINE  TABLE   ENTITY X {}',
      ),
    ).toBe(true);
  });

  it('rejects a CDS view source', () => {
    expect(
      isTableEntitySource('define view entity X as select from y { key y.a }'),
    ).toBe(false);
  });

  it('rejects empty / non-CDS source', () => {
    expect(isTableEntitySource('')).toBe(false);
    expect(isTableEntitySource('just text')).toBe(false);
  });

  it('scaffold is a valid table entity carrying the name and a key', () => {
    const s = buildTableEntityScaffold('Z_T_X');
    expect(isTableEntitySource(s)).toBe(true);
    expect(s).toContain('Z_T_X');
    expect(s).toContain('key Uuid : sysuuid_x16');
  });
});
