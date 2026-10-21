import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { calculateRoute } from '../server/logistics.js';

test('Fallo externo y NoRoute no generan distancia ni duración ficticia', async () => {
  let mode = 'fail';
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'fail') { res.writeHead(503); res.end('{}'); }
    else if (mode === 'noroute') res.end(JSON.stringify({ code: 'NoRoute', routes: [] }));
    else res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: -1, duration: -1, geometry: { type: 'LineString', coordinates: [[1,1],[2,2]] } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const prior = process.env.OSRM_URL;
  process.env.OSRM_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ROUTING_PROVIDER = 'osrm';
  const a = { latitud: 1, longitud: 1 }, b = { latitud: 2, longitud: 2 };
  try {
    await assert.rejects(calculateRoute(a, b), e => e.status === 502 && e.code === 'PROVEEDOR_NO_DISPONIBLE');
    mode = 'noroute';
    await assert.rejects(calculateRoute(a, b), e => e.code === 'SIN_RUTA');
    mode = 'invalid';
    await assert.rejects(calculateRoute(a, b), e => e.code === 'RESPUESTA_INVALIDA');
  } finally {
    if (prior === undefined) delete process.env.OSRM_URL; else process.env.OSRM_URL = prior;
    await new Promise(resolve => server.close(resolve));
  }
});
