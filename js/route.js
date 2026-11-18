/* Cálculo explícito: las rutas provienen del servidor; el tráfico es un escenario manual. */
(() => {
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const min = n => n == null ? 'Sin dato' : `${Math.max(0, Math.ceil(n))} min`;
  function mount(root, { id, tracking = false, origen, destino, requiresCold = false, closed = false, onResult } = {}) {
    const controls = root?.querySelector('[data-route-controls]'), map = root?.querySelector('[data-route-map]');
    if (!controls || !map) return;
    REAMaps.showPlaces(map, { origen, destino });
    if (closed) { controls.innerHTML = '<p class="field-hint">El recojo ha terminado. Consulta el historial para ver lo registrado.</p>'; return; }
    controls.innerHTML = `<div class="route-options"><label>Posible demora adicional<select class="form-control" data-route-traffic><option value="0">Sin demora adicional</option><option value="15" selected>15 minutos</option><option value="30">30 minutos</option><option value="60">1 hora</option></select></label>${requiresCold && !tracking ? '<label>¿Pueden mantenerlo frío?<select class="form-control" data-route-cold><option value="">Aún no lo sé</option><option value="true">Sí</option><option value="false">No</option></select></label>' : ''}<button type="button" class="btn btn-primary" data-calculate-route><i class="fa-solid fa-route"></i> Calcular recorrido</button></div><p class="field-hint">La ruta estima un viaje en vehículo por carretera. La demora se elige manualmente; no hay tráfico ni GPS en vivo.</p><div data-route-result aria-live="polite"></div>`;
    const button = controls.querySelector('[data-calculate-route]'), result = controls.querySelector('[data-route-result]');
    button.addEventListener('click', async () => {
      button.disabled = true; result.innerHTML = '<p role="status">Consultando el mapa y calculando el tiempo…</p>';
      try {
        const cold = controls.querySelector('[data-route-cold]')?.value;
        const body = { demora_trafico_min: Number(controls.querySelector('[data-route-traffic]').value) };
        if (cold) body.dispone_cadena_frio = cold === 'true';
        const response = await REA.request(tracking ? `/api/seguimiento/${id}/evaluacion-ruta` : `/api/donaciones/${id}/evaluacion-ruta`, { method: 'POST', body });
        const data = response.data, v = data.evaluacion, color = ['verde','amarillo','rojo','gris'].includes(v.color) ? v.color : 'gris';
        const names = { verde:'Con margen de tiempo', amarillo:'Revisar antes de coordinar', rojo:'Requiere atención', gris:'Faltan datos' };
        result.innerHTML = `<div class="route-result ${color}"><div class="route-result-heading"><span class="route-light" aria-hidden="true"></span><div><strong>${names[color]}</strong><p>${e(v.mensaje)}</p></div></div><div class="route-facts"><div><span>Del donante a la beneficiaria</span><strong>${Number(data.vuelta.distancia_km).toFixed(1)} km · ${min(data.vuelta.duracion_min)}</strong></div><div><span>Ir a recoger</span><strong>${min(data.ida.duracion_min)}</strong></div><div><span>Tiempo total estimado</span><strong>${min(v.tiempo_total_min)}</strong></div><div><span>Tiempo declarado disponible</span><strong>${min(v.tiempo_disponible_min)}</strong></div></div>${v.avisos.map(a=>`<p>${e(a)}</p>`).join('')}<p class="field-hint">Incluye ${min(v.recojo_min)} para recojo, ${min(v.demora_trafico_min)} de demora elegida${v.espera_min > 0 ? ` y ${min(v.espera_min)} de espera prevista` : ''}. La información es declarada; el color no certifica la calidad del alimento.</p></div>`;
        REAMaps.showPlaces(map, { origen, destino, geometry: data.vuelta.geometria });
        onResult?.(data);
      } catch (error) { result.innerHTML = `<div class="mvp-message error" role="alert">${e(error.message)} No se dibujó una ruta ficticia.</div>`; }
      finally { button.disabled = false; }
    });
  }
  window.REARoute = { mount };
})();
