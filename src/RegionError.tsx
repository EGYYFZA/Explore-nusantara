export default function RegionError() {
  return <main className="route-error"><h1>Data wilayah tidak tersedia.</h1><p>Periksa koneksi, lalu coba lagi.</p><button onClick={() => window.location.reload()}>Muat ulang</button></main>;
}
