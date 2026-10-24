import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseRegions } from '../src/regions.ts';

export const regionSource = {
  repository: 'https://github.com/nekoding/wilayah-indonesia',
  commit: '02bdc8fd3b06dcb6a393731509f6865b9bb4d8d3',
};

// Read only the COPY data section; downloaded SQL is never executed.
export function readCopyRows(sql, table) {
  const header = new RegExp(`^COPY public\\.${table} \\(([^)]+)\\) FROM stdin;$`, 'm').exec(sql);
  assert.ok(header, `Missing COPY section for ${table}`);
  const start = header.index + header[0].length + 1;
  const end = sql.indexOf('\n\\.', start);
  assert.ok(end >= start, `Unterminated COPY section for ${table}`);
  const columns = header[1].split(', ');
  return sql.slice(start, end).split('\n').filter(Boolean).map(line => {
    const cells = line.split('\t');
    assert.equal(cells.length, columns.length, `Invalid ${table} row`);
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] === '\\N' ? null
      : cells[index].replace(/\\([\\tnr])/g, (_, key) => ({ '\\': '\\', t: '\t', n: '\n', r: '\r' })[key])]));
  });
}

const id = code => Number(code.replaceAll('.', ''));

export function geometryBounds(hex) {
  assert.match(hex, /^(?:[\da-f]{2})+$/i, 'Invalid EWKB geometry');
  const buffer = Buffer.from(hex, 'hex');
  let offset = 0;
  let littleEndian = true;
  const bounds = [[Infinity, Infinity], [-Infinity, -Infinity]];
  const uint = () => { const value = littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset); offset += 4; return value; };
  const double = () => { const value = littleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset); offset += 8; return value; };
  function read(depth = 0) {
    littleEndian = buffer.readUInt8(offset++) === 1;
    const type = uint();
    assert.equal(type & 0xc0000000, 0, 'Only 2D geometry is supported');
    if (type & 0x20000000) assert.equal(uint(), 4326, 'Expected WGS84 geometry');
    const kind = type & 0xff;
    assert.ok(kind === 3 || (kind === 6 && depth === 0), 'Expected Polygon or MultiPolygon');
    const count = uint();
    if (kind === 6) { for (let index = 0; index < count; index++) read(depth + 1); }
    else for (let ring = 0; ring < count; ring++) {
      const points = uint();
      for (let index = 0; index < points; index++) {
        const x = double(), y = double();
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        bounds[0][0] = Math.min(bounds[0][0], x); bounds[0][1] = Math.min(bounds[0][1], y);
        bounds[1][0] = Math.max(bounds[1][0], x); bounds[1][1] = Math.max(bounds[1][1], y);
      }
    }
  }
  read();
  assert.equal(offset, buffer.length, 'Unexpected trailing geometry data');
  assert.ok(bounds.flat().every(Number.isFinite), 'Empty geometry');
  return bounds.map(point => point.map(value => Number(value.toFixed(6))));
}

export function convertRegions(tables) {
  function place(row, zoom) {
    assert.ok(row.lat !== null && row.lng !== null, `Missing coordinates: ${row.kode}`);
    return { id: id(row.kode), code: row.kode, name: row.nama.trim(),
      center: [Number(Number(row.lng).toFixed(6)), Number(Number(row.lat).toFixed(6))], zoom,
      ...(row.geom ? { bounds: geometryBounds(row.geom) } : {}) };
  }
  const data = {
    Provinces: tables.provinces.map(row => place(row, Number(row.luas) < 10000 ? 8 : Number(row.luas) < 50000 ? 6.5 : 5.5)),
    Regencies: tables.cities.map(row => ({ ...place(row, Number(row.luas) < 1000 ? 11 : 9), province_id: id(row.province_kode) })),
    district: tables.districts.map(row => ({ ...place(row, 12), regency_id: id(row.city_kode) })),
  };
  for (const items of Object.values(data)) items.sort((a, b) => a.id - b.id);
  parseRegions(data);
  return data;
}

async function download(path) {
  const url = `https://raw.githubusercontent.com/nekoding/wilayah-indonesia/${regionSource.commit}/${path}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Dataset download failed: ${response.status} ${path}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const tables = {};
  for (const table of ['provinces', 'cities', 'districts']) {
    tables[table] = readCopyRows(gunzipSync(await download(`data/${table}.sql.gz`)).toString('utf8'), table);
  }
  const data = convertRegions(tables);
  assert.equal(data.Provinces.length, 38);
  assert.equal(data.Regencies.length, 514);
  assert.equal(data.district.length, 7285);
  const old = JSON.parse(await fs.readFile('public/data/indonesia_regions.json', 'utf8'));
  const normalize = name => name.toLowerCase().replace(/^dki\s+/, 'daerah khusus ibukota ')
    .replace(/^(kota|kabupaten)\s+(administrasi\s+)?/, '').replaceAll(' ', '');
  const migrating = old.Provinces.every(item => item.id < 11);
  const aliases = { province: {}, regency: {}, district: {} };
  for (const item of migrating ? old.Provinces : []) {
    const match = data.Provinces.find(row => normalize(row.name) === normalize(item.name));
    assert.ok(match, `Unmatched province ${item.name}`);
    aliases.province[item.id] = match.id;
  }
  for (const item of migrating ? old.Regencies : []) {
    const candidates = data.Regencies.filter(row => row.province_id === aliases.province[item.province_id] && normalize(row.name) === normalize(item.name));
    const match = candidates.find(row => item.name.startsWith('Kota ') && row.name.startsWith('Kota '))
      ?? (candidates.length === 1 ? candidates[0] : undefined);
    assert.ok(match, `Unmatched city ${item.name}`);
    aliases.regency[item.id] = match.id;
  }
  for (const item of migrating ? old.district : []) {
    const match = data.district.find(row => row.regency_id === aliases.regency[item.regency_id] && normalize(row.name) === normalize(item.name));
    assert.ok(match, `Unmatched district ${item.name}`);
    aliases.district[item.id] = match.id;
  }
  const photos = JSON.parse(await fs.readFile('src/data/photos.json', 'utf8')).map(photo => migrating ? ({ ...photo,
    provinceId: aliases.province[photo.provinceId], regencyId: photo.regencyId === null ? null : aliases.regency[photo.regencyId] }) : photo);
  const license = await download('LICENSE');
  await fs.mkdir('public/data/licenses', { recursive: true });
  await fs.writeFile('public/data/licenses/wilayah-indonesia-MIT.txt', license);
  await fs.writeFile('public/data/indonesia_regions.json', JSON.stringify(data) + '\n');
  await fs.writeFile('public/data/regions-source.json', JSON.stringify({ ...regionSource, imported: '2026-10-24', counts: {
    provinces: data.Provinces.length, regencies: data.Regencies.length, districts: data.district.length },
    coordinates: 'Province/city capitals and district polygon centroids. Not administrative boundaries.' }, null, 2) + '\n');
  if (migrating) await fs.writeFile('src/legacy-ids.ts', 'export const legacyIds = ' + JSON.stringify(aliases, null, 2) + ' as const;\n');
  await fs.writeFile('src/data/photos.json', JSON.stringify(photos, null, 2) + '\n');
  console.log('Imported', data.Provinces.length, data.Regencies.length, data.district.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
