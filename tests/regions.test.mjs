import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRegions, getSelection, getGallery, searchRegions } from '../src/regions.ts';
import { regionsLoader } from '../src/loaders.ts';

const data = parseRegions(JSON.parse(fs.readFileSync(new URL('../public/data/indonesia_regions.json', import.meta.url))));
const photos = JSON.parse(fs.readFileSync(new URL('../src/data/photos.json', import.meta.url)));

test('typed region search matches partial names and respects the current parent scope', () => {
  assert.deepEqual(searchRegions(data.Provinces, '  bALi ').map(region => region.id), [51]);
  assert.equal(searchRegions(data.Provinces, 'papua').length, 6);
  const cities = data.Regencies.filter(region => region.province_id === 51);
  assert.deepEqual(searchRegions(cities, 'denpas').map(region => region.id), [5171]);
  assert.deepEqual(searchRegions(cities, 'bandung'), []);
  assert.deepEqual(searchRegions(cities, '   '), cities);
  assert.deepEqual(searchRegions([], 'bali'), []);
});

test('all dataset regions have valid centers and parent relationships', () => {
  assert.equal(data.Provinces.length, 38);
  assert.equal(data.Regencies.length, 514);
  assert.equal(data.district.length, 7285);
  for (const place of [...data.Provinces, ...data.Regencies, ...data.district]) {
    assert.ok(place.center[0] >= 94 && place.center[0] <= 142);
    assert.ok(place.center[1] >= -12 && place.center[1] <= 7);
    assert.ok(place.bounds);
  }
});

test('invalid and inconsistent URL parents cannot select another region', () => {
  assert.equal(getSelection(data, new URLSearchParams('province=3&regency=1&district=1')).regency, undefined);
  assert.equal(getSelection(data, new URLSearchParams('regency=5&district=13')).district, undefined);
  assert.equal(getSelection(data, new URLSearchParams('province=999')).province, undefined);
  const selected = getSelection(data, new URLSearchParams('province=3&regency=5&district=13'));
  assert.equal(selected.district.name, 'Denpasar Selatan');
  assert.deepEqual(getSelection(data, new URLSearchParams('province=51&regency=5171&district=517101')), selected);
  assert.equal(getSelection(data, new URLSearchParams('province=3&regency=5&district=17')).district, undefined);
});

test('gallery fallback names the actual parent area instead of the district', () => {
  for (const district of data.district) {
    const regency = data.Regencies.find(item => item.id === district.regency_id);
    const province = data.Provinces.find(item => item.id === regency.province_id);
    const gallery = getGallery(photos, { district, regency, province });
    assert.ok(gallery.photos.length > 0);
    assert.ok([regency.name, province.name].includes(gallery.area));
    assert.ok(gallery.photos.every(photo => photo.provinceId === province.id));
  }
  assert.equal(new Set(getGallery(photos, {}).photos.slice(0, 3).map(photo => photo.provinceId)).size, 3);
});

test('every photograph has a local asset, source, author and license', () => {
  assert.equal(new Set(photos.map(photo => photo.id)).size, photos.length);
  for (const province of data.Provinces) assert.ok(photos.filter(photo => photo.provinceId === province.id).length >= 3, province.name);
  for (const photo of photos) {
    assert.ok(data.Provinces.some(province => province.id === photo.provinceId));
    if (photo.regencyId !== null) assert.ok(data.Regencies.some(regency => regency.id === photo.regencyId && regency.province_id === photo.provinceId));
    assert.ok(fs.statSync(new URL('../public' + photo.src, import.meta.url)).size > 1000);
    assert.match(photo.source, /^https:\/\/commons.wikimedia.org\/wiki\/File:/);
    assert.ok(photo.author.length > 0);
    assert.match(photo.license, /^(CC BY|CC0|Public domain)/);
    assert.match(photo.licenseUrl, /^https?:\/\/creativecommons.org\//);
  }
});

test('malformed payloads are rejected before rendering a map', () => {
  assert.throws(() => parseRegions(null));
  assert.throws(() => parseRegions({ Provinces: [] }));
  const invalid = structuredClone(data);
  invalid.Provinces[0].center = [NaN, 0];
  assert.throws(() => parseRegions(invalid), /Koordinat/);
  invalid.Provinces[0].center = [104, 1];
  invalid.Regencies[0].province_id = 99;
  assert.throws(() => parseRegions(invalid), /Hubungan/);
  invalid.Regencies[0].province_id = data.Regencies[0].province_id;
  invalid.Provinces[0].bounds = [[110, 2], [100, 1]];
  assert.throws(() => parseRegions(invalid), /Batas/);
});

test('loader rejects HTTP failures and malformed responses', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 503 }));
  await assert.rejects(regionsLoader(), /Gagal memuat/);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ wrong: 'schema' }));
  await assert.rejects(regionsLoader(), /wilayah tidak valid/);
  globalThis.fetch.mock.mockImplementation(async () => Response.json(data));
  assert.deepEqual(await regionsLoader(), data);
});
