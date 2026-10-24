import fs from 'node:fs/promises';
import { commonsPhoto } from '../src/commons.ts';

const topics = JSON.parse(await fs.readFile('scripts/photo-topics.json', 'utf8'));
const data = JSON.parse(await fs.readFile('public/data/indonesia_regions.json', 'utf8'));
const photos = JSON.parse(await fs.readFile('src/data/photos.json', 'utf8'));
const headers = { 'User-Agent': 'ExploreNusantara/1.0 (https://github.com/EGYYFZA/Explore-nusantara)' };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if ([429, 503].includes(response.status)) {
      const seconds = Number(response.headers.get('retry-after')) || 60;
      console.log(`Service busy; retrying in ${seconds}s`);
      await response.body?.cancel();
      await delay(seconds * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`Photo request failed: ${response.status}`);
    return response;
  }
  throw new Error('Photo service rate limit persisted. Re-run to resume.');
}

for (const province of data.Provinces) {
  const remaining = 3 - photos.filter(photo => photo.provinceId === province.id && photo.id.startsWith('commons-')).length;
  if (remaining <= 0) continue;
  const terms = topics[province.id];
  const pages = [];
  for (const term of terms) {
    const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2',
      generator: 'search', gsrnamespace: '6', gsrlimit: '20', gsrsearch: `"${term}"`,
      prop: 'imageinfo|coordinates', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '960', maxlag: '5' });
    const result = await (await request('https://commons.wikimedia.org/w/api.php?' + params)).json();
    if (result.error) throw new Error(JSON.stringify(result.error));
    pages.push(...(result.query?.pages ?? []).sort((a, b) => a.index - b.index));
    await delay(6500);
  }
  const candidates = pages.map(page => ({ page, photo: commonsPhoto(page, { provinceId: province.id, regencyId: null, location: province.name }) }))
    .filter(item => {
      if (!item.photo || photos.some(photo => photo.source === item.photo.source || photo.id === item.photo.id)) return false;
      const description = item.page.title + ' ' + (item.page.imageinfo[0].extmetadata.ImageDescription?.value ?? '');
      if (/\b(Sabah|Malaysia|England|United Kingdom|Singapore|Thailand|Australia|Philippines|Netherlands|Ragunan|Junghuhn|Chalcedon|chalcedony|ospek|PPKMB)\b|Naval Battle|Marlborough College|Kantor Kecamatan Losari|Kantor Kelurahan Karampuang|\b(painting|engraving|lithograph|illustration)\b/i.test(description)) return false;
      const year = item.page.imageinfo[0].extmetadata.DateTimeOriginal?.value?.match(/\b(18\d\d|19\d\d|20\d\d)\b/)?.[0];
      if (year && Number(year) < 1990) return false;
      const coordinate = item.page.coordinates?.[0];
      if (coordinate && province.bounds) {
        const [[west, south], [east, north]] = province.bounds;
        if (coordinate.lon < west - 0.2 || coordinate.lon > east + 0.2 || coordinate.lat < south - 0.2 || coordinate.lat > north + 0.2) return false;
      }
      return true;
    });
  const selected = [];
  for (const term of terms) {
    const item = candidates.find(item => !selected.includes(item)
      && term.toLowerCase().split(' ').every(word => item.page.title.toLowerCase().includes(word)));
    if (item && !selected.some(other => other.photo.id === item.photo.id)) selected.push(item);
  }
  for (const item of candidates) {
    if (selected.length >= 3) break;
    if (!selected.some(other => other.photo.id === item.photo.id)) selected.push(item);
  }
  for (const { page, photo } of selected.slice(0, remaining)) {
    const response = await request(photo.src);
    const image = Buffer.from(await response.arrayBuffer());
    if (image[0] !== 0xff || image[1] !== 0xd8) throw new Error(`Not a JPEG: ${page.title}`);
    const path = `/images/${photo.id}.jpg`;
    await fs.writeFile('public' + path, image);
    photos.push({ ...photo, src: path, original: page.title });
    await fs.writeFile('src/data/photos.json', JSON.stringify(photos, null, 2) + '\n');
    console.log(province.name, page.title);
  }
  console.log('PROGRESS', province.id, photos.filter(photo => photo.provinceId === province.id).length, 'photos');
  await delay(6500);
}

const missing = data.Provinces.filter(province => photos.filter(photo => photo.provinceId === province.id).length < 3);
await fs.writeFile('docs/photo-credits.md', '# Photo credits\n\nDownloaded from Wikimedia Commons on 24 October 2026. Resized by Wikimedia; previews are cropped with CSS. Each photograph retains its individual license. Live nearby photographs carry their credits in the application.\n\n'
  + photos.map(photo => `- **${photo.title}** — ${photo.author}, [${photo.license}](${photo.licenseUrl}). [Original](${photo.source}). Local: \`public${photo.src}\`.`).join('\n') + '\n');
console.log('TOTAL', photos.length, 'UNCOVERED', missing.map(province => province.name));
if (missing.length) process.exitCode = 1;
