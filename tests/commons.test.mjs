import test from 'node:test';
import assert from 'node:assert/strict';
import { commonsPhoto, nearbyPhotos, plainText } from '../src/commons.ts';

const context = { provinceId: 51, regencyId: 5171, location: 'Sekitar Denpasar' };
const page = { pageid: 123, title: 'File:Sanur_Beach.jpg', imageinfo: [{
  width: 1600, height: 1000, mime: 'image/jpeg',
  thumburl: 'https://upload.wikimedia.org/example.jpg',
  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Sanur_Beach.jpg',
  extmetadata: { Artist: { value: '<a href="/wiki/User:Author">Author &amp; Co</a>' },
    LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' } },
}] };
const selection = { province: { id: 51 }, regency: { id: 5171, name: 'Kota Denpasar', center: [115.21, -8.65] },
  district: { id: 517101, name: 'Denpasar Selatan', center: [115.24, -8.7] } };

test('Commons photos preserve attribution as plain text with trusted links', () => {
  const photo = commonsPhoto(page, context);
  assert.equal(photo.author, 'Author & Co');
  assert.equal(photo.title, 'Sanur Beach');
  assert.equal(photo.provinceId, 51);
  assert.equal(photo.source, page.imageinfo[0].descriptionurl);
  assert.equal(plainText('<b>Author</b> &quot;Name&quot;'), 'Author "Name"');
});

test('skip unsupported licenses, missing credits, unsafe links and unsuitable images', () => {
  for (const [field, value] of [['mime', 'image/svg+xml'], ['width', 100], ['width', NaN],
    ['thumburl', 'https://upload.wikimedia.org.attacker.test/example.jpg'],
    ['thumburl', 'javascript:alert(1)'], ['descriptionurl', 'https://example.com/wiki/File:A.jpg']]) {
    const invalid = structuredClone(page);
    invalid.imageinfo[0][field] = value;
    assert.equal(commonsPhoto(invalid, context), null, field);
  }
  for (const license of ['CC BY-NC 4.0', 'Unknown', '']) {
    const invalid = structuredClone(page);
    invalid.imageinfo[0].extmetadata.LicenseShortName.value = license;
    assert.equal(commonsPhoto(invalid, context), null);
  }
  const invalid = structuredClone(page);
  delete invalid.imageinfo[0].extmetadata.Artist;
  assert.equal(commonsPhoto(invalid, context), null);
  assert.equal(commonsPhoto(null, context), null);
  assert.equal(commonsPhoto({ ...page, title: 'File:Map of Bali.jpg' }, context), null);
});

test('nearby lookup uses district coordinates and explicitly labels radius-based results', async t => {
  const signal = new AbortController().signal;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('ggscoord'), '-8.7|115.24');
    assert.equal(params.get('ggsradius'), '10000');
    assert.equal(params.get('origin'), '*');
    assert.equal(options.signal, signal);
    return Response.json({ query: { pages: [page, { title: 'Missing metadata' }] } });
  });
  const result = await nearbyPhotos(selection, signal);
  assert.equal(result.length, 1);
  assert.equal(result[0].location, 'Sekitar Denpasar Selatan');
  assert.equal(result[0].regencyId, 5171);
  assert.deepEqual(await nearbyPhotos({ province: selection.province }, signal), []);
});

test('nearby lookup distinguishes empty results from HTTP and API failures', async t => {
  const signal = new AbortController().signal;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ batchcomplete: true }));
  assert.deepEqual(await nearbyPhotos(selection, signal), []);
  for (const payload of [null, {}, { error: { code: 'maxlag' } }, { query: { pages: {} } }]) {
    globalThis.fetch.mock.mockImplementation(async () => Response.json(payload));
    await assert.rejects(nearbyPhotos(selection, signal));
  }
  globalThis.fetch.mock.mockImplementation(async () => new Response('', { status: 503 }));
  await assert.rejects(nearbyPhotos(selection, signal), /belum tersedia/);
  globalThis.fetch.mock.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(nearbyPhotos(selection, signal), { name: 'AbortError' });
});
