"use client";

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Map, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed, RotateCcw, TriangleAlert } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { indonesia, type Province, type Region } from './regions';
import { motionTokens } from './motion-tokens';

setWorkerUrl(workerUrl);

type Props = { place: Region; provinces: Province[]; onSelectProvince: (id: number) => void };

function focusPlace(map: Map, place: Region, is3D: boolean, reduced: boolean | null) {
  map.fitBounds(place.bounds ?? [[94.5, -11.5], [141.5, 6]], {
    padding: { top: 75, bottom: 70, left: 35, right: 35 }, maxZoom: place.zoom,
    pitch: is3D ? (place.id ? 52 : 25) : 0, bearing: 0,
    duration: reduced ? 0 : motionTokens.duration.flight * 1000,
  });
}

export default function RegionMap({ place, provinces, onSelectProvince }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const selectedMarker = useRef<Marker | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [terrainError, setTerrainError] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const reduced = useReducedMotion();
  const selectProvince = useEffectEvent(onSelectProvince);

  useEffect(() => {
    if (!container.current) return;
    let map: Map;
    try {
      map = new Map({
        container: container.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: indonesia.center, zoom: indonesia.zoom, pitch: 35, bearing: 0,
        minZoom: 1.5, maxZoom: 17, maxPitch: 70,
        maxBounds: [[85, -40], [153, 35]],
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: false },
        cooperativeGestures: true,
      });
    } catch {
      const timer = window.setTimeout(() => setStatus('error'), 0);
      return () => window.clearTimeout(timer);
    }
    mapRef.current = map;
    map.getCanvas().setAttribute('aria-label', 'Peta Indonesia. Gunakan tombol panah untuk menggeser; plus dan minus untuk zoom.');
    map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
    map.addControl(new ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
    const loadingTimeout = window.setTimeout(() => setStatus('error'), 20000);
    let basemapReady = false;
    map.on('load', () => {
      basemapReady = true;
      window.clearTimeout(loadingTimeout);
      if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#dce9ed');
      if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', '#f1f3ee');
      const elevation = {
        type: 'raster-dem' as const,
        tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium' as const, tileSize: 256, maxzoom: 14,
        attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain © Mapzen, SRTM & contributors</a>',
      };
      map.addSource('elevation', elevation);
      map.addSource('shading', elevation);
      map.addLayer({ id: 'land-relief', type: 'hillshade', source: 'shading', paint: {
        'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#667b74', 'hillshade-highlight-color': '#fffef9',
      } }, map.getLayer('water') ? 'water' : undefined);
      map.addSource('province-locations', { type: 'geojson', cluster: true, clusterRadius: 35, clusterMaxZoom: 7,
        data: { type: 'FeatureCollection', features: provinces.map(province => ({ type: 'Feature',
          properties: { id: province.id, name: province.name }, geometry: { type: 'Point', coordinates: province.center } })) } });
      map.addLayer({ id: 'province-clusters', type: 'circle', source: 'province-locations', filter: ['has', 'point_count'],
        paint: { 'circle-color': '#fff', 'circle-radius': 17, 'circle-stroke-width': 1, 'circle-stroke-color': '#b9c4cc' } });
      map.addLayer({ id: 'province-counts', type: 'symbol', source: 'province-locations', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
        paint: { 'text-color': '#1d1d1f' } });
      map.addLayer({ id: 'province-points', type: 'circle', source: 'province-locations', filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': '#0071e3', 'circle-radius': 6, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      map.on('click', 'province-points', event => {
        const id = Number(event.features?.[0]?.properties.id);
        if (provinces.some(province => province.id === id)) selectProvince(id);
      });
      map.on('click', 'province-clusters', async event => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        try {
          const zoom = await (map.getSource('province-locations') as GeoJSONSource).getClusterExpansionZoom(feature.properties.cluster_id);
          if (mapRef.current === map) map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.max(zoom, map.getZoom() + 1),
            duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600 });
        } catch { /* The province filter remains available if the source is unloaded. */ }
      });
      for (const layer of ['province-points', 'province-clusters']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
      setStatus('ready');
    });
    map.on('error', event => {
      if ('sourceId' in event && event.sourceId === 'elevation') {
        map.setTerrain(null);
        setTerrainError(true);
      } else if (!basemapReady) setStatus('error');
    });
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    const onVisibility = () => { if (document.hidden) map.stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    const onContextLost = () => setStatus('error');
    map.getCanvas().addEventListener('webglcontextlost', onContextLost);
    return () => {
      window.clearTimeout(loadingTimeout);
      document.removeEventListener('visibilitychange', onVisibility);
      resize.disconnect();
      selectedMarker.current?.remove();
      selectedMarker.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [provinces, attempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    map.stop();
    map.setTerrain(is3D && !terrainError ? { source: 'elevation', exaggeration: 1.5 } : null);
    focusPlace(map, place, is3D, reduced);
    selectedMarker.current?.remove();
    selectedMarker.current = null;
    if (place.id) {
      const element = document.createElement('div');
      element.className = 'selected-marker';
      element.textContent = place.name;
      selectedMarker.current = new Marker({ element, anchor: 'bottom' }).setLngLat(place.center).addTo(map);
    }
  }, [place, is3D, status, reduced, terrainError]);

  return (
    <>
      <div ref={container} className="map-canvas" />
      {status === 'loading' && <div className="map-loading" role="status">Memuat peta…</div>}
      {status === 'error' && <div className="map-fallback" role="alert"><TriangleAlert size={28} /><h3>Peta belum bisa ditampilkan</h3><p>Periksa koneksi internet dan dukungan WebGL browser. Filter wilayah dan galeri tetap bisa digunakan.</p><button onClick={() => { setStatus('loading'); setTerrainError(false); setAttempt(value => value + 1); }}><RotateCcw size={15} /> Coba lagi</button></div>}
      {status === 'ready' && <>
        <div className="map-view-controls" role="group" aria-label="Tampilan peta"><button aria-pressed={!is3D} onClick={() => setIs3D(false)}>2D</button><button aria-pressed={is3D} onClick={() => setIs3D(true)}>3D</button></div>
        <button className="recenter-button" aria-label={`Kembalikan peta ke ${place.name}`} onClick={() => {
          const map = mapRef.current;
          if (!map) return;
          focusPlace(map, place, is3D, reduced);
        }}><LocateFixed size={17} /></button>
        {terrainError && <div className="map-hint" role="status">Elevasi belum tersedia. Peta dasar tetap aktif.</div>}
      </>}
    </>
  );
}
