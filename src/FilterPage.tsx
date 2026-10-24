"use client";

import { lazy, Suspense } from 'react';
import { useLoaderData, useSearchParams } from 'react-router-dom';
import { MapPin, RotateCcw } from 'lucide-react';
import { getSelection, indonesia, type RegionsData } from './regions';
import Gallery from './Gallery';
import RegionSelect from './RegionSelect';

const RegionMap = lazy(() => import('./RegionMap'));

export default function FilterPage() {
  const data = useLoaderData() as RegionsData;
  const [params, setParams] = useSearchParams();
  const selection = getSelection(data, params);
  const { province, regency, district } = selection;
  const place = district ?? regency ?? province ?? indonesia;
  const regencies = data.Regencies.filter(item => item.province_id === province?.id);
  const districts = data.district.filter(item => item.regency_id === regency?.id);

  function selectProvince(id: string) {
    setParams(id ? { province: id } : {});
  }

  return (
    <>
      <a className="skip-link" href="#filters">Langsung ke filter</a>
      <main className="explorer-page">
        <section className="filter-section" aria-labelledby="page-title">
          <h1 id="page-title">Nusantara<span>.</span></h1>
          <div className="region-fields" id="filters" role="group" aria-label="Filter wilayah">
            <RegionSelect id="province" label="Provinsi" placeholder="Semua provinsi" options={data.Provinces}
              value={province?.id} onChange={selectProvince} />
            <RegionSelect key={`regency-${province?.id ?? ''}`} id="regency" label="Kota / Kabupaten"
              placeholder="Semua kota / kabupaten" options={regencies} value={regency?.id} disabled={!province}
              onChange={value => setParams(value ? { province: String(province!.id), regency: value } : { province: String(province!.id) })} />
            <RegionSelect key={`district-${regency?.id ?? ''}`} id="district" label="Kecamatan"
              placeholder="Semua kecamatan" options={districts} value={district?.id} disabled={!regency}
              onChange={value => setParams({ province: String(province!.id), regency: String(regency!.id), ...(value ? { district: value } : {}) })} />
            <button className="reset-button" onClick={() => setParams({})} disabled={!params.size}
              aria-label="Reset semua filter" title="Reset filter"><RotateCcw size={19} aria-hidden="true" /></button>
          </div>
        </section>

        <section className="map-section" aria-label={`Peta ${place.name}`}>
          <div className="map-panel">
            <div className="map-location" aria-live="polite" title="Titik pusat wilayah perkiraan">
              <MapPin size={15} aria-hidden="true" /><span>{place.name}</span>
            </div>
            <Suspense fallback={<div className="map-loading" role="status">Memuat peta…</div>}>
              <RegionMap place={place} provinces={data.Provinces}
                onSelectProvince={id => selectProvince(String(id))} />
            </Suspense>
          </div>
        </section>

        <Gallery key={`${province?.id ?? 0}-${regency?.id ?? 0}-${district?.id ?? 0}`} selection={selection} />
        <p className="data-note">Koleksi: {data.Provinces.length} provinsi · {data.Regencies.length} kota/kabupaten · {data.district.length} kecamatan. Koordinat perkiraan.</p>
      </main>
    </>
  );
}
