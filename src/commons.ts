import type { Photo, Selection } from './regions.ts';

type CommonsPage = {
  pageid?: number; title?: string;
  imageinfo?: { width?: number; height?: number; mime?: string; thumburl?: string;
    descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[];
};

export function plainText(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function trustedUrl(value: unknown, hosts: string[]) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !hosts.includes(url.hostname) || url.username || url.password) return null;
    url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

export function commonsPhoto(value: unknown, context: Pick<Photo, 'provinceId' | 'regencyId' | 'location'>): Photo | null {
  if (!value || typeof value !== 'object') return null;
  const page = value as CommonsPage;
  const image = Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined;
  if (!image || !Number.isInteger(page.pageid) || typeof page.title !== 'string'
    || typeof image.width !== 'number' || typeof image.height !== 'number' || !Number.isFinite(image.width) || !Number.isFinite(image.height)
    || image.width < 800 || image.height < 400 || image.width / image.height < 1.1 || image.width / image.height > 3.5
    || image.mime !== 'image/jpeg' || /\b(map|logo|flag|stamp|diagram|portrait|replica|miniature)\b|coat of arms|TMII/i.test(page.title)) return null;
  const metadata = image.extmetadata;
  const license = metadata?.LicenseShortName?.value;
  const author = metadata?.Artist?.value;
  if (typeof license !== 'string' || !/^(CC BY(?:-SA)? [1-4]\.0|CC0(?: 1\.0)?|Public domain)$/.test(license)
    || typeof author !== 'string' || !plainText(author)) return null;
  const src = trustedUrl(image.thumburl, ['upload.wikimedia.org', 'thumb.wikimedia.org']);
  const source = trustedUrl(image.descriptionurl, ['commons.wikimedia.org']);
  const licenseUrl = trustedUrl(metadata?.LicenseUrl?.value, ['creativecommons.org'])
    ?? (license === 'Public domain' ? 'https://creativecommons.org/publicdomain/mark/1.0/' : null);
  if (!src || !source || !licenseUrl || !new URL(source).pathname.startsWith('/wiki/File:')) return null;
  return { id: `commons-${page.pageid}`, title: plainText(page.title).replace(/^File:/, '').replace(/\.jpe?g$/i, '').replaceAll('_', ' '),
    ...context, src, author: plainText(author), license, licenseUrl, source };
}

export async function nearbyPhotos(selection: Selection, signal: AbortSignal): Promise<Photo[]> {
  const place = selection.district ?? selection.regency;
  if (!place || !selection.province) return [];
  const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'geosearch', ggscoord: `${place.center[1]}|${place.center[0]}`, ggsradius: '10000',
    ggsnamespace: '6', ggsprimary: 'all', ggslimit: '40', prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280', maxlag: '5' });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal });
  if (!response.ok) throw new Error('Layanan foto belum tersedia.');
  const data = await response.json();
  if (!data || typeof data !== 'object' || data.error || (!data.query && data.batchcomplete === undefined)) {
    throw new Error('Respons layanan foto tidak valid.');
  }
  const pages = data.query?.pages ?? [];
  if (!Array.isArray(pages)) throw new Error('Daftar foto tidak valid.');
  return pages.map(page => commonsPhoto(page, { provinceId: selection.province!.id,
    regencyId: selection.regency?.id ?? null, location: `Sekitar ${place.name}` })).filter((photo): photo is Photo => photo !== null).slice(0, 18);
}
