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
