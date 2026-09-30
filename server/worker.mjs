import {rjQuery, inRioDeJaneiro} from './rj.mjs';
import {addressMatch} from './address-match.mjs';
const ORS = 'https://api.heigit.org';
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}});
const validPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

async function body(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('Requisição inválida.'), {status: 400});
  let size = 0;
  const chunks = [];
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 64000) {await reader.cancel(); throw Object.assign(new Error('Requisição muito grande.'), {status: 413});}
    chunks.push(value);
  }
  try { return JSON.parse(await new Blob(chunks).text()); } catch { throw Object.assign(new Error('Requisição inválida.'), {status: 400}); }
}
async function ors(path, init, env) {
  const key = env.ORS_API_KEY?.trim();
  if (!key) throw new Error('A busca real ainda não está configurada no servidor.');
  const response = await fetch(ORS + path, { ...init, headers: {authorization: key, 'content-type': 'application/json'}, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(response.status === 429 ? 'Limite gratuito atingido. Aguarde antes de tentar novamente.' : response.status === 401 ? 'Chave do serviço inválida.' : 'O serviço não conseguiu atender a solicitação.');
  return response.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/') && (request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.has('origin') && request.headers.get('origin') !== url.origin)) return json(403, {error: 'Origem não permitida.'});
      if (url.pathname === '/api/config' && request.method === 'GET') return json(200, {configured: !!env.ORS_API_KEY?.trim(), provider: 'openrouteservice', localSetup: false});
      if (url.pathname === '/api/geocode' && request.method === 'POST') {
        const data = await body(request); const text = typeof data.text === 'string' ? data.text.trim() : '';
        if (text.length < 5 || text.length > 500) return json(400, {error: 'Informe rua, número e cidade (até 500 caracteres).'});
        const result = await ors('/pelias/v1/search?' + rjQuery(text), {}, env);
        const places = (result.features || []).filter(inRioDeJaneiro).map(f => addressMatch(f, text)).filter(p => typeof p.label === 'string' && validPoint(p.point)).sort((a, b) => Number(b.selectable) - Number(a.selectable)).slice(0, 5);
        return json(200, {places});
      }
      if (url.pathname === '/api/matrix' && request.method === 'POST') {
        const data = await body(request);
        if (!Array.isArray(data.points) || data.points.length < 2 || data.points.length > 100 || !data.points.every(validPoint)) return json(400, {error: 'Pontos inválidos.'});
        for (const field of ['sources', 'destinations']) {
          if (!Array.isArray(data[field]) || !data[field].length || data[field].some(i => !Number.isInteger(i) || i < 0 || i >= data.points.length)) return json(400, {error: 'Índices inválidos.'});
        }
        if (data.sources.length * data.destinations.length > 3500) return json(400, {error: 'Divida a matriz em lotes menores.'});
        const result = await ors('/openrouteservice/v2/matrix/driving-car', {method: 'POST', body: JSON.stringify({locations: data.points.map(p => [p.lng, p.lat]), sources: data.sources.map(String), destinations: data.destinations.map(String), metrics: ['distance'], units: 'm'})}, env);
        if (!Array.isArray(result.distances) || result.distances.length !== data.sources.length || result.distances.some(row => !Array.isArray(row) || row.length !== data.destinations.length || row.some(v => v !== null && (!Number.isFinite(v) || v < 0)))) throw new Error('O serviço retornou uma matriz inválida.');
        return json(200, {distances: result.distances});
      }
      if (url.pathname.startsWith('/api/')) return json(404, {error: 'Serviço não encontrado.'});
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not found', {status: 404});
    } catch (error) { return json(error.status || 502, {error: error.name === 'TimeoutError' ? 'O serviço demorou a responder. Tente novamente.' : error.message || 'Não foi possível atender a solicitação.'}); }
  }
};
