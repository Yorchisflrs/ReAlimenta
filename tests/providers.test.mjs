import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { geocode } from '../server/logistics.js';

test('Búsqueda de direcciones: un fallo del proveedor o una respuesta inválida no inventan ubicaciones', async () => {
  let mode = 'fail';
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'fail') { res.writeHead(503); res.end('{}'); }
    else if (mode === 'invalid') res.end(JSON.stringify({ error: 'no es una lista' }));
    else res.end(JSON.stringify([{ display_name: 'Jr. Lima, Puno', lat: '-15.84', lon: '-70.02' }, { display_name: 'Sin coordenadas', lat: 'x', lon: 'y' }]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const prior = process.env.GEOCODING_URL;
  process.env.GEOCODING_URL = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(geocode('ab'), e => e.code === 'DIRECCION_INVALIDA');
    await assert.rejects(geocode('Jr. Lima falla'), e => e.status === 502 && e.code === 'PROVEEDOR_NO_DISPONIBLE');
    mode = 'invalid';
    await assert.rejects(geocode('Jr. Lima invalida'), e => e.code === 'RESPUESTA_INVALIDA');
    mode = 'ok';
    const found = await geocode('Jr. Lima correcta');
    assert.deepEqual(found.map(item => [item.latitud, item.longitud]), [[-15.84, -70.02]]);
  } finally {
    if (prior === undefined) delete process.env.GEOCODING_URL; else process.env.GEOCODING_URL = prior;
    await new Promise(resolve => server.close(resolve));
  }
});
