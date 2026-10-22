import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLogistics, validCoordinates } from '../server/logistics.js';

const now = new Date('2026-10-21T15:00:00Z');
const donation = { fecha_disponibilidad: now.toISOString(), fecha_limite_recojo: '2026-10-21T20:00:00Z', fecha_limite_aprovechamiento_declarada: '2026-10-21T20:00:00Z', requiere_cadena_frio: false };
const route = { duracion_estimada_min: 20 };
test('Verde: cálculo temporal de backend suma preparación, recojo, carretera, entrega y margen', () => {
  const result = evaluateLogistics(donation, route, {}, now);
  assert.equal(result.estado_viabilidad, 'verde');
  assert.equal(result.tiempo_total_estimado_min, 70);
  assert.equal(result.margen_tiempo_min, 230);
});
test('Amarillo: margen positivo menor al umbral configurable', () => {
  const result = evaluateLogistics({ ...donation, fecha_limite_aprovechamiento_declarada: '2026-10-21T16:20:00Z' }, route, {}, now);
  assert.equal(result.estado_viabilidad, 'amarillo');
  assert.equal(result.margen_tiempo_min, 10);
});
test('Rojo: tiempo total igual al disponible no es viable', () => {
  const result = evaluateLogistics({ ...donation, fecha_limite_aprovechamiento_declarada: '2026-10-21T16:10:00Z' }, route, {}, now);
  assert.equal(result.estado_viabilidad, 'rojo');
});
test('Gris: falta fecha o ruta y nunca inventa duración', () => {
  assert.equal(evaluateLogistics({ ...donation, fecha_limite_aprovechamiento_declarada: null }, route, {}, now).estado_viabilidad, 'gris');
  const result = evaluateLogistics(donation, null, {}, now);
  assert.equal(result.estado_viabilidad, 'gris');
  assert.equal(result.tiempo_total_estimado_min, null);
});
test('Cadena de frío declarada sin medios produce rojo; sin declaración produce gris', () => {
  const cold = { ...donation, requiere_cadena_frio: true };
  assert.equal(evaluateLogistics(cold, route, { dispone_cadena_frio: false }, now).estado_viabilidad, 'rojo');
  assert.equal(evaluateLogistics(cold, route, {}, now).estado_viabilidad, 'gris');
});
test('Ventana futura y fecha de recojo también cuentan', () => {
  const result = evaluateLogistics(donation, route, { fecha_propuesta: '2026-10-21T19:30:00Z' }, now);
  assert.equal(result.espera_programada_min, 270);
  assert.equal(result.estado_viabilidad, 'rojo');
});
test('Coordenadas inválidas y tiempos negativos se rechazan', () => {
  assert.equal(validCoordinates(null, -70), false);
  assert.equal(validCoordinates(-15.84, -70.02), true);
  assert.equal(validCoordinates(100, 200), false);
  assert.throws(() => evaluateLogistics(donation, route, { preparacion_min: -1 }, now), /entre 0 y 1440/);
});
test('Un plazo declarado de una hora nunca permite un traslado estimado de tres horas', () => {
  const result=evaluateLogistics({...donation,fecha_limite_aprovechamiento_declarada:'2026-10-21T16:00:00Z'},{duracion_estimada_min:180},{preparacion_min:0,recojo_min:0,entrega_min:0,margen_seguridad_min:0},now);
  assert.equal(result.estado_viabilidad,'rojo');assert.equal(result.margen_tiempo_min,-120);
});
test('El escenario de tráfico suma demora manual sin presentarse como tráfico vivo',()=>{
  const result=evaluateLogistics(donation,route,{demora_trafico_min:45},now);
  assert.equal(result.tiempo_total_estimado_min,115);assert.equal(result.duracion_con_escenario_min,65);
  assert.equal(result.trafico_en_vivo,false);assert.match(result.advertencias.join(' '),/Escenario manual/);
});
test('Tras el recojo no se vuelve a contar preparación ni se rechaza una ventana de recojo ya cumplida',()=>{
  const result=evaluateLogistics({...donation,fecha_limite_recojo:'2026-10-21T14:00:00Z'},route,{etapa_custodia:'en_transito'},now);
  assert.equal(result.preparacion_min,0);assert.equal(result.recojo_min,0);assert.equal(result.tiempo_total_estimado_min,45);assert.equal(result.estado_viabilidad,'verde');
});
test('Una incidencia crítica o condición no conforme prevalece sobre margen suficiente',()=>{
  assert.equal(evaluateLogistics(donation,route,{incidencias_criticas:1},now).estado_viabilidad,'rojo');
  assert.equal(evaluateLogistics(donation,route,{condicion_declarada:'no_conforme'},now).estado_viabilidad,'rojo');
  assert.equal(evaluateLogistics(donation,route,{condicion_declarada:'requiere_revision'},now).estado_viabilidad,'amarillo');
});

test('La ida de la organización al donante cuenta antes del recojo y se elimina después del recojo',()=>{
  const initial=evaluateLogistics(donation,route,{viaje_recojo_min:25},now);
  assert.equal(initial.viaje_recojo_min,25);
  assert.equal(initial.tiempo_total_estimado_min,95);
  const moved=evaluateLogistics(donation,route,{viaje_recojo_min:25,etapa_custodia:'recogido'},now);
  assert.equal(moved.viaje_recojo_min,0);
  assert.equal(moved.tiempo_total_estimado_min,45);
});

test('La ida al donante también puede dejar el recojo fuera del plazo declarado',()=>{
  const result=evaluateLogistics({...donation,fecha_limite_recojo:'2026-10-21T15:35:00Z'},route,{viaje_recojo_min:25},now);
  assert.equal(result.estado_viabilidad,'rojo');
  assert.match(result.advertencias.join(' '),/fuera de la ventana/);
});
