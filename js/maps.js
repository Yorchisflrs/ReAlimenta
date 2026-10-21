/* Leaflet y rutas reales. No se generan distancias ni polilíneas ficticias. */
(() => {
  const maps = new WeakMap();
  function canvas(container) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) throw new Error('No se encontró el contenedor del mapa.');
    maps.get(container)?.remove();
    container.replaceChildren();
    container.style.minHeight = '320px';
    if (!window.L) { container.textContent = 'No se pudo cargar el mapa. Recargue la página para reintentar.'; return null; }
    const map = L.map(container, { scrollWheelZoom: false }).setView([-15.8402, -70.0219], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    maps.set(container, map);
    setTimeout(() => map.invalidateSize(), 120);
    return map;
  }
  function markerIcon(label, color) {
    const icon = document.createElement('span');
    icon.className = 'rea-map-marker';
    icon.textContent = label;
    icon.style.cssText = `display:grid;place-items:center;width:32px;height:32px;background:${color};border:3px solid white;border-radius:50%;color:white;box-shadow:0 3px 12px #0004;font:700 14px sans-serif`;
    return L.divIcon({ html: icon, className: '', iconSize: [32,32], iconAnchor: [16,16] });
  }
  function mountPicker(container, { latitud, longitud, onChange } = {}) {
    const map = canvas(container);
    if (!map) return { setPosition() {}, getPosition: () => null, destroy() {} };
    let pin = null;
    let position = null;
    function setPosition(lat, lng) {
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
      position = { latitud: Number(lat), longitud: Number(lng) };
      if (!pin) {
        pin = L.marker([lat,lng], { draggable: true, icon: markerIcon('●','#087f5b') }).addTo(map);
        pin.on('dragend', () => { const point = pin.getLatLng(); setPosition(point.lat, point.lng); });
      } else pin.setLatLng([lat,lng]);
      map.setView([lat,lng], Math.max(15,map.getZoom()));
      onChange?.(position);
    }
    map.on('click', event => setPosition(event.latlng.lat, event.latlng.lng));
    if (latitud !== null && latitud !== undefined && latitud !== '' && longitud !== null && longitud !== undefined && longitud !== '') setPosition(latitud,longitud);
    return { map, setPosition, getPosition: () => position, destroy: () => map.remove() };
  }
  async function search(query) {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { credentials: 'same-origin' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'No se pudo buscar la dirección.');
    return result.data;
  }
  function showRoute(container, route) {
    const map = canvas(container);
    if (!map) return null;
    if (!route?.geometry || !route.origen || !route.destino) {
      map.remove();
      if (typeof container === 'string') container = document.querySelector(container);
      container.textContent = 'No se pudo calcular una ruta para estas ubicaciones.';
      return null;
    }
    const polyline = L.geoJSON(route.geometry, { style: { color: '#087f5b', weight: 6, opacity: .9 } }).addTo(map);
    L.marker([route.origen.latitud, route.origen.longitud], { icon: markerIcon('A','#087f5b') }).addTo(map).bindPopup('A · Establecimiento donante');
    L.marker([route.destino.latitud, route.destino.longitud], { icon: markerIcon('B','#ef8d3c') }).addTo(map).bindPopup('B · Organización beneficiaria');
    map.fitBounds(polyline.getBounds(), { padding: [35,35] });
    return map;
  }
  window.REAMaps = { mountPicker, search, showRoute };
})();
