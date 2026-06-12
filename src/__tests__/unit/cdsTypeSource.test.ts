import {
  buildCdsTypeScaffold,
  isCdsTypeSource,
} from '../../handlers/cds_type/cdsTypeSource';

describe('cdsTypeSource', () => {
  it('accepts a define type source', () => {
    expect(isCdsTypeSource('define type X : abap.int4 enum { a = 1; }')).toBe(
      true,
    );
  });
  it('accepts leading annotations and mixed case', () => {
    expect(
      isCdsTypeSource(
        "@EndUserText.label: 'x'\nDEFINE  TYPE X : abap.char(1);",
      ),
    ).toBe(true);
  });
  it('rejects a table entity / view source', () => {
    expect(
      isCdsTypeSource('define table entity X { key a : abap.int4; }'),
    ).toBe(false);
    expect(
      isCdsTypeSource('define view entity X as select from y { key y.a }'),
    ).toBe(false);
  });
  it('scaffold is a valid scalar define type carrying the name', () => {
    const s = buildCdsTypeScaffold('Z_MY_TYPE');
    expect(isCdsTypeSource(s)).toBe(true);
    expect(s).toContain('Z_MY_TYPE');
    expect(s).toContain('abap.char(10)');
  });
});
