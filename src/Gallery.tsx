"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Camera, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import photos from './data/photos.json';
import { getGallery, type Photo, type Selection } from './regions';
import { motionTokens } from './motion-tokens';
import { nearbyPhotos } from './commons';

function PhotoImage({ photo, eager = false }: { photo: Photo; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="image-fallback"><Camera size={27} /><span>Foto belum tersedia</span></span> : <img src={photo.src} alt={eager ? `${photo.title}, ${photo.location}` : ''} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />;
}

export default function Gallery({ selection }: { selection: Selection }) {
  const localGallery = getGallery(photos, selection);
  const { province, regency, district } = selection;
  const place = district ?? regency;
  const [nearby, setNearby] = useState<Photo[]>([]);
  const [photoStatus, setPhotoStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const gallery = { area: localGallery.area, photos: [...localGallery.photos,
    ...nearby.filter(photo => !localGallery.photos.some(local => local.source === photo.source))] };
  const [expanded, setExpanded] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [viewerPhotos, setViewerPhotos] = useState<Photo[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const reduced = useReducedMotion();
  const shownPhotos = expanded ? gallery.photos : gallery.photos.slice(0, 3);
  const selected = (viewerPhotos.length ? viewerPhotos : gallery.photos)[photoIndex];
  const fallback = district || (regency && gallery.area !== regency.name);

  useEffect(() => {
    if (!regency) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      nearbyPhotos({ province, regency, district }, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
        .then(results => { if (!controller.signal.aborted) { setNearby(results); setPhotoStatus('ready'); } })
        .catch(() => { if (!controller.signal.aborted) setPhotoStatus('error'); });
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [province, regency, district, attempt]);

  function movePhoto(direction: number) { if (viewerPhotos.length) setPhotoIndex(index => (index + direction + viewerPhotos.length) % viewerPhotos.length); }

  return (
    <section id="gallery" className="gallery-section" aria-labelledby="gallery-title">
      <div className="gallery-heading"><h2 id="gallery-title">Galeri.</h2><span className="photo-count">{gallery.photos.length} foto</span></div>
      {place && <p className="gallery-notice" role="status">{nearby.length ? `Foto sekitar ${place.name} (radius 10 km) dan koleksi ${localGallery.area}.`
        : photoStatus === 'loading' ? `Mencari foto sekitar ${place.name}… Menampilkan koleksi ${localGallery.area}.`
        : photoStatus === 'error' ? `Layanan foto belum terhubung. Menampilkan koleksi ${localGallery.area}.`
        : fallback ? `Foto sekitar ${place.name} belum tersedia. Menampilkan koleksi ${localGallery.area}.` : `Koleksi ${localGallery.area}.`}
        {photoStatus === 'error' && <button className="photo-retry" onClick={() => { setPhotoStatus('loading'); setAttempt(value => value + 1); }}>Coba lagi</button>}</p>}
      {gallery.photos.length ? <div className="photo-grid" key={gallery.area}>
        {shownPhotos.map((photo, index) => <motion.figure key={photo.id} initial={{ opacity: 0, y: reduced ? 0 : motionTokens.distance.sm }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? motionTokens.duration.fast : motionTokens.duration.normal }}>
          <button className="photo-button" onClick={event => { trigger.current = event.currentTarget; setViewerPhotos(gallery.photos); setPhotoIndex(index); dialog.current?.showModal(); }}><PhotoImage photo={photo} /><span className="photo-expand" aria-hidden="true"><ArrowUpRight size={19} /></span><span className="photo-caption"><strong>{photo.title}</strong><span>{photo.location}</span></span></button>
          <figcaption>Foto: {photo.author} · <a href={photo.source} target="_blank" rel="noreferrer">{photo.license} <ArrowUpRight size={10} /></a></figcaption>
        </motion.figure>)}
      </div> : <div className="gallery-empty"><Camera size={24} aria-hidden="true" /><p>Foto belum tersedia. Pilih wilayah lain.</p></div>}
      {gallery.photos.length > 3 && <button className="more-photos" onClick={() => setExpanded(value => !value)}>{expanded ? 'Tampilkan lebih sedikit' : `Lihat semua ${gallery.photos.length} foto`} <ArrowDown size={14} /></button>}
      <dialog ref={dialog} className="photo-dialog" aria-labelledby="photo-title" onClose={() => trigger.current?.focus()} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} onKeyDown={event => { if (event.key === 'ArrowRight') movePhoto(1); if (event.key === 'ArrowLeft') movePhoto(-1); }}>
        {selected && <div className="photo-dialog-content"><button className="dialog-close" onClick={() => dialog.current?.close()} aria-label="Tutup foto"><X size={21} /></button><PhotoImage key={selected.id} photo={selected} eager /><div className="dialog-caption"><div><span>{selected.location}</span><h3 id="photo-title">{selected.title}</h3><p>Foto: {selected.author} · <a href={selected.licenseUrl} target="_blank" rel="noreferrer">{selected.license}</a> · <a href={selected.source} target="_blank" rel="noreferrer">Sumber asli</a><br />Pratinjau galeri dipotong untuk tampilan.</p></div><div className="dialog-navigation"><button onClick={() => movePhoto(-1)} aria-label="Foto sebelumnya" disabled={viewerPhotos.length < 2}><ArrowLeft size={18} /></button><span>{photoIndex + 1} / {viewerPhotos.length || gallery.photos.length}</span><button onClick={() => movePhoto(1)} aria-label="Foto berikutnya" disabled={viewerPhotos.length < 2}><ArrowRight size={18} /></button></div></div></div>}
      </dialog>
    </section>
  );
}
