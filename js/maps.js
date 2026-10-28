/* Leaflet y rutas reales. No se generan distancias ni polilíneas ficticias. */
(() => {
  const maps = new WeakMap();
  const active = new Set();
  function removeMap(container) {
    const map=maps.get(container);if(!map)return;
    map.stop();map.remove();maps.delete(container);active.delete(map);
  }
  function dispose(root) {
    for(const map of [...active]){const container=map.getContainer();if(container===root||root?.contains(container))removeMap(container);}
  }
  function canvas(container) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) throw new Error('No se encontró el contenedor del mapa.');
    removeMap(container);
    container.replaceChildren();
    container.style.minHeight = '320px';
    if (!window.L) { container.textContent = 'No se pudo cargar el mapa. Recargue la página para reintentar.'; return null; }
    const map = L.map(container, { scrollWheelZoom: false,zoomControl:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false }).setView([-15.8402, -70.0219], 13);
    L.control.zoom({zoomInTitle:'Acercar mapa',zoomOutTitle:'Alejar mapa'}).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    maps.set(container, map);
    active.add(map);
    setTimeout(() => {if(container.isConnected&&maps.get(container)===map)map.invalidateSize();}, 120);
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
    return { map, setPosition, getPosition: () => position, destroy: () => removeMap(map.getContainer()) };
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
      removeMap(map.getContainer());
      if (typeof container === 'string') container = document.querySelector(container);
      container.textContent = 'No se pudo calcular una ruta para estas ubicaciones.';
      return null;
    }
    const color=({rojo:'#bf604b',amarillo:'#c99b31'})[route.estado_viabilidad]||'#087f5b';
    const polyline = L.geoJSON(route.geometry, { style: { color, weight: 6, opacity: .9 } }).addTo(map);
    const popup=(label,point)=>{const node=document.createElement('div');const strong=document.createElement('strong');strong.textContent=`${label} · ${point.nombre||''}`;node.append(strong);if(point.direccion){const p=document.createElement('p');p.textContent=point.direccion;node.append(p);}return node;};
    L.marker([route.origen.latitud, route.origen.longitud], { icon: markerIcon('A','#087f5b'),title:'A · Establecimiento donante' }).addTo(map).bindPopup(popup('A · Donante',route.origen));
    L.marker([route.destino.latitud, route.destino.longitud], { icon: markerIcon('B','#ef8d3c'),title:'B · Beneficiaria' }).addTo(map).bindPopup(popup('B · Beneficiaria',route.destino));
    map.fitBounds(polyline.getBounds(), { padding: [35,35],animate:false });
    return map;
  }
  // Mapa simple de llegada: el punto de recojo es fijo y el punto de salida se marca tocando el mapa.
  function mountEta(container, { destination, start, onStart } = {}) {
    const map = canvas(container);
    if (!map) return { setStart() {}, getStart: () => null, showLine() {}, clearLine() {} };
    const goal = [Number(destination.latitud), Number(destination.longitud)];
    L.marker(goal, { icon: markerIcon('B','#ef8d3c'), title: 'Lugar de recojo' }).addTo(map).bindTooltip('Lugar de recojo');
    map.setView(goal, 14);
    let pin = null, line = null, position = null;
    function clearLine() { if (line) { line.remove(); line = null; } }
    function setStart(lat, lng) {
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
      position = { latitud: Number(lat), longitud: Number(lng) };
      if (!pin) {
        pin = L.marker([lat,lng], { draggable: true, icon: markerIcon('A','#087f5b'), title: 'Punto de salida' }).addTo(map).bindTooltip('Sales de aquí');
        pin.on('dragend', () => { const point = pin.getLatLng(); setStart(point.lat, point.lng); });
      } else pin.setLatLng([lat,lng]);
      clearLine();
      map.fitBounds(L.latLngBounds([goal, [lat,lng]]), { padding: [45,45], maxZoom: 16, animate: false });
      onStart?.(position);
    }
    function showLine(geometry) {
      clearLine();
      line = L.geoJSON(geometry, { style: { color: '#087f5b', weight: 6, opacity: .9 } }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [35,35], animate: false });
    }
    map.on('click', event => setStart(event.latlng.lat, event.latlng.lng));
    if (start && Number.isFinite(Number(start.latitud)) && Number.isFinite(Number(start.longitud))) setStart(start.latitud, start.longitud);
    return { setStart, getStart: () => position, showLine, clearLine };
  }
  window.REAMaps = { mountPicker, mountEta, search, showRoute, dispose };
})();
