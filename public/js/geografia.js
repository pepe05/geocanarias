// Geometría compartida por el importador, el navegador y el servidor.
export function puntoEnAnillo(lng, lat, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function puntoEnPoligonos(lng, lat, poligonos) {
  return poligonos.some((p) => puntoEnAnillo(lng, lat, p[0]) && !p.slice(1).some((h) => puntoEnAnillo(lng, lat, h)));
}

export function bboxDe(poligonos) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of poligonos) for (const [lng, lat] of p[0]) {
    b[0] = Math.min(b[0], lng); b[1] = Math.min(b[1], lat);
    b[2] = Math.max(b[2], lng); b[3] = Math.max(b[3], lat);
  }
  return b;
}

export function municipioDe(u, municipios) {
  return municipios.find((m) => m.islas.includes(u.isla)
    && u.lng >= m.bbox[0] && u.lng <= m.bbox[2] && u.lat >= m.bbox[1] && u.lat <= m.bbox[3]
    && puntoEnPoligonos(u.lng, u.lat, m.poligonos));
}
