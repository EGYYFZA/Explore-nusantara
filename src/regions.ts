import { legacyIds } from './legacy-ids.ts';

export type Region = { id: number; name: string; center: [number, number]; zoom: number; bounds?: [[number, number], [number, number]] };
export type Province = Region;
export type Regency = Region & { province_id: number };
export type District = Region & { regency_id: number };
export type RegionsData = { Provinces: Province[]; Regencies: Regency[]; district: District[] };
export type Selection = { province?: Province; regency?: Regency; district?: District };
export type Photo = {
  id: string; title: string; location: string; provinceId: number; regencyId: number | null;
  src: string; author: string; license: string; licenseUrl: string; source: string;
};

export const indonesia: Region = { id: 0, name: 'Indonesia', center: [118, -2.5], zoom: 4 };

export function searchRegions(regions: Region[], query: string) {
  const search = query.trim().toLocaleLowerCase('id');
  return regions.filter(region => region.name.toLocaleLowerCase('id').includes(search));
}

export function parseRegions(value: unknown): RegionsData {
  if (!value || typeof value !== 'object') throw new Error('Format data wilayah tidak valid.');
  const data = value as RegionsData;
  for (const key of ['Provinces', 'Regencies', 'district'] as const) {
    const items = data[key];
    if (!Array.isArray(items) || new Set(items.map(item => item?.id)).size !== items.length) {
      throw new Error('Daftar wilayah tidak valid.');
    }
    for (const item of items) {
      if (!item || !Number.isInteger(item.id) || typeof item.name !== 'string' || !item.name.trim()
        || !Array.isArray(item.center) || item.center.length !== 2
        || !item.center.every(Number.isFinite) || Math.abs(item.center[0]) > 180
        || Math.abs(item.center[1]) > 85 || !Number.isFinite(item.zoom) || item.zoom < 0 || item.zoom > 18) {
        throw new Error('Koordinat atau nama wilayah tidak valid.');
      }
      if (item.bounds && (!Array.isArray(item.bounds) || item.bounds.length !== 2
        || !item.bounds.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))
        || item.bounds[0][0] >= item.bounds[1][0] || item.bounds[0][1] >= item.bounds[1][1]
        || item.bounds.some(point => Math.abs(point[0]) > 180 || Math.abs(point[1]) > 85))) {
        throw new Error('Batas tampilan wilayah tidak valid.');
      }
    }
  }
  const provinceIds = new Set(data.Provinces.map(item => item.id));
  const regencyIds = new Set(data.Regencies.map(item => item.id));
  if (data.Regencies.some(item => !provinceIds.has(item.province_id))
    || data.district.some(item => !regencyIds.has(item.regency_id))) {
    throw new Error('Hubungan antarwilayah tidak valid.');
  }
  return data;
}

export function getSelection(data: RegionsData, params: URLSearchParams): Selection {
  const legacy = Object.hasOwn(legacyIds.province, params.get('province') ?? '');
  const resolve = (key: 'province' | 'regency' | 'district') => {
    const value = params.get(key) ?? '';
    return legacy ? String((legacyIds[key] as Record<string, number>)[value] ?? '') : value;
  };
  const province = data.Provinces.find(item => String(item.id) === resolve('province'));
  const regency = province && data.Regencies.find(item => item.province_id === province.id && String(item.id) === resolve('regency'));
  const district = regency && data.district.find(item => item.regency_id === regency.id && String(item.id) === resolve('district'));
  return { province, regency, district };
}

export function getGallery(photos: Photo[], selection: Selection) {
  const local = selection.regency ? photos.filter(photo => photo.regencyId === selection.regency?.id) : [];
  if (local.length) return { photos: local, area: selection.regency!.name };
  if (selection.province) return { photos: photos.filter(photo => photo.provinceId === selection.province?.id), area: selection.province.name };
  const featured = photos.filter((photo, index) => photos.findIndex(item => item.provinceId === photo.provinceId) === index);
  return { photos: [...featured, ...photos.filter(photo => !featured.includes(photo))], area: 'Indonesia' };
}

