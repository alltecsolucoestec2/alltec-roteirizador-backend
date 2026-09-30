import {rjQuery, inRioDeJaneiro} from './rj.mjs';
import {addressMatch} from './address-match.mjs';
const ROOT = 'https://api.heigit.org';
let tail = Promise.resolve();
let next = 0;
const cache = new Map();
export function validPoint(p) { return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180; }
export function validateMatrix(body) {
  if (!Array.isArray(body?.points) || body.points.length < 2 || body.points.length > 100 || !body.points.every(validPoint)) throw new Error('Pontos inválidos.');
  for (const k of ['sources', 'destinations']) if (!Array.isArray(body[k]) || !body[k].length || body[k].some(i => !Number.isInteger(i) || i < 0 || i >= body.points.length)) throw new Error('Índices inválidos.');
  if (body.sources.length * body.destinations.length > 3500) throw new Error('Divida a matriz em lotes menores.');
}
async function request(path, init) {
  const key = process.env.ORS_API_KEY?.trim();
  if (!key) throw Object.assign(new Error('A busca real ainda não está configurada. A chave gratuita do openrouteservice deve ser configurada no servidor.'), {status: 503});
  const turn = tail.then(async () => {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, next - Date.now())));
    next = Date.now() + 1600;
    const response = await fetch(ROOT + path, {...init, headers: {'Authorization': key, 'Content-Type': 'application/json'}, signal: AbortSignal.timeout(30000)});
    if (!response.ok) {
      const messages = {401: 'Chave do serviço inválida.', 403: 'A chave não tem acesso ao serviço.', 429: 'Limite gratuito atingido. Aguarde antes de tentar novamente.'};
      throw Object.assign(new Error(messages[response.status] || 'O serviço não conseguiu localizar ou conectar esses endereços. Confira os pontos e tente novamente.'), {status: response.status === 429 ? 429 : 502});
    }
    return response.json();
  });
  tail = turn.catch(() => {});
  return turn;
}
export async function geocode(text) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const hit = cache.get(normalized.toLowerCase());
  if (hit && hit.expires > Date.now()) return hit.value;
  for (const [key, value] of cache) if (value.expires <= Date.now()) cache.delete(key);
  const data = await request('/pelias/v1/search?' + rjQuery(normalized));
  const value = (data.features || []).filter(inRioDeJaneiro).map(f => addressMatch(f, normalized)).filter(p => typeof p.label === 'string' && validPoint(p.point)).sort((a, b) => Number(b.selectable) - Number(a.selectable)).slice(0, 5);
  if (cache.size >= 1000) cache.delete(cache.keys().next().value);
  cache.set(normalized.toLowerCase(), {value, expires: Date.now() + 24 * 60 * 60 * 1000});
  return value;
}
export async function distanceMatrix(body) {
  validateMatrix(body);
  const data = await request('/openrouteservice/v2/matrix/driving-car', {method: 'POST', body: JSON.stringify({locations: body.points.map(p => [p.lng, p.lat]), sources: body.sources.map(String), destinations: body.destinations.map(String), metrics: ['distance'], units: 'm'})});
  if (!Array.isArray(data.distances) || data.distances.length !== body.sources.length || data.distances.some(row => !Array.isArray(row) || row.length !== body.destinations.length || row.some(v => v !== null && (!Number.isFinite(v) || v < 0)))) throw new Error('O serviço retornou uma matriz inválida.');
  return data.distances;
}
