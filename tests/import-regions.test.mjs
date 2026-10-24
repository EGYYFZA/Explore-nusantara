import test from 'node:test';
import assert from 'node:assert/strict';
import { readCopyRows, geometryBounds, convertRegions } from '../scripts/import-regions.mjs';

test('importer reads COPY data without executing SQL and rejects truncated rows', () => {
  const sql = 'DROP TABLE ignored;\nCOPY public.provinces (kode, nama, extra) FROM stdin;\n51\tBali\\tIsland\t\\N\n\\.\n';
  assert.deepEqual(readCopyRows(sql, 'provinces'), [{ kode: '51', nama: 'Bali\tIsland', extra: null }]);
  assert.throws(() => readCopyRows(sql, 'cities'), /Missing COPY/);
  assert.throws(() => readCopyRows(sql.replace('\\.\n', ''), 'provinces'), /Unterminated/);
  assert.throws(() => readCopyRows(sql.replace('\t\\N', ''), 'provinces'), /Invalid/);
});

test('EWKB bounds support both byte orders and reject malformed geometry', () => {
  for (const endian of ['LE', 'BE']) {
    const points = [[115, -9], [116, -9], [116, -8], [115, -9]];
    const buffer = Buffer.alloc(17 + points.length * 16);
    buffer.writeUInt8(endian === 'LE' ? 1 : 0);
    buffer['writeUInt32' + endian](0x20000003, 1);
    buffer['writeUInt32' + endian](4326, 5);
    buffer['writeUInt32' + endian](1, 9);
    buffer['writeUInt32' + endian](points.length, 13);
    points.flat().forEach((value, index) => buffer['writeDouble' + endian](value, 17 + index * 8));
    assert.deepEqual(geometryBounds(buffer.toString('hex')), [[115, -9], [116, -8]]);
    assert.throws(() => geometryBounds(buffer.subarray(0, -1).toString('hex')));
    assert.throws(() => geometryBounds(buffer.toString('hex') + '00'), /trailing/);
  }
  assert.throws(() => geometryBounds('invalid'), /Invalid EWKB/);
});

test('conversion preserves official IDs and rejects missing coordinates or orphaned children', () => {
  const place = { kode: '51', nama: ' Bali ', lat: '-8.5', lng: '115', luas: '5900' };
  const tables = { provinces: [place], cities: [{ ...place, kode: '51.71', province_kode: '51' }],
    districts: [{ ...place, kode: '51.71.01', city_kode: '51.71' }] };
  const data = convertRegions(tables);
  assert.equal(data.Provinces[0].name, 'Bali');
  assert.equal(data.district[0].id, 517101);
  assert.equal(data.district[0].regency_id, 5171);
  tables.provinces[0].lat = null;
  assert.throws(() => convertRegions(tables), /Missing coordinates/);
  tables.provinces[0].lat = '-8.5';
  tables.cities[0].province_kode = '99';
  assert.throws(() => convertRegions(tables), /Hubungan/);
});
