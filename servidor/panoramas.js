// Adaptador del servicio que ya utiliza el generador del banco. Es opcional:
// si no responde, el juego conserva el banco y nunca relaja los filtros.
export async function buscarPanorama(lat, lng, radio = 400, { signal } = {}) {
  const url = 'https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch?pb='
    + `!1m5!1sapiv3!5sUS!11m2!1m1!1b0!2m4!1m2!3d${lat}!4d${lng}!2d${radio}`
    + '!3m10!2m2!1ses!2sES!9m1!1e2!11m4!1m3!1e2!2b1!3e2!4m6!1e1!1e2!1e3!1e4!1e8!1e6&callback=_cb';
  const r = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`Street View: ${r.status}`);
  const texto = await r.text();
  const p = JSON.parse(texto.slice(texto.indexOf('(') + 1, texto.lastIndexOf(')')))?.[1];
  const pos = p?.[5]?.[0]?.[1];
  if (p?.[1]?.[0] !== 2 || !pos || pos[4] !== 'ES') return null;
  const direccion = p[3]?.[2] || [], fecha = p[6]?.[7];
  const u = {
    pano: p[1][1], lat: pos[0][2], lng: pos[0][3], rumbo: pos[2]?.[0] ?? 0,
    calle: direccion.length > 1 ? direccion[0][0]?.replace(/^\d+[A-Za-z]?,?\s+/, '') : null,
    lugar: (direccion.length > 1 ? direccion[1][0] : direccion[0]?.[0])?.split(',')[0] ?? null,
    fecha: Array.isArray(fecha) ? `${fecha[0]}-${String(fecha[1]).padStart(2, '0')}` : null,
  };
  return typeof u.pano === 'string' && Number.isFinite(u.lat) && Number.isFinite(u.lng) ? u : null;
}
