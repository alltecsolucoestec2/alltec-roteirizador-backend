import {createServer} from 'node:http';
import {readFile, writeFile, rename} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {geocode, distanceMatrix} from './provider.mjs';
const production = process.argv.includes('--production');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5173);
const vite = production ? null : await (await import('vite')).createServer({server: {middlewareMode: true}, appType: 'spa'});
const root = resolve('dist/client');
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.json':'application/json'};
async function bodyOf(req) {
  let data = '';
  for await (const chunk of req) {data += chunk; if (Buffer.byteLength(data) > 64000) throw Object.assign(new Error('Requisição muito grande.'), {status: 413});}
  try {return JSON.parse(data);} catch {throw Object.assign(new Error('Requisição inválida.'), {status: 400});}
}
const server = createServer(async (req, res) => {
  const send = (status, body) => {res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}); res.end(JSON.stringify(body));};
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      const localSetup = loopback && ['127.0.0.1', 'localhost', '::1'].includes(host);
      if (localSetup && ![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(req.headers.host)) return send(403, {error: 'Host não permitido.'});
      if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403, {error: 'Origem não permitida.'});
      if (url.pathname === '/api/config' && req.method === 'GET') return send(200, {configured: !!process.env.ORS_API_KEY?.trim(), provider: 'openrouteservice', localSetup});
      if (url.pathname === '/api/setup' && req.method === 'POST') {
        if (!localSetup || !req.headers.origin || new URL(req.headers.origin).host !== req.headers.host || !req.headers['content-type']?.startsWith('application/json')) return send(403, {error: 'Configure a chave somente no computador local.'});
        const {key} = await bodyOf(req);
        if (typeof key !== 'string' || !/^[A-Za-z0-9_\-.=]{20,1000}$/.test(key.trim())) return send(400, {error: 'Cole a chave completa, usando o ícone de copiar do painel.'});
        let env = '';
        try {env = await readFile('.env', 'utf8');} catch {}
        const line = 'ORS_API_KEY=' + key.trim();
        env = /^ORS_API_KEY=.*$/m.test(env) ? env.replace(/^ORS_API_KEY=.*$/m, () => line) : env + '\n' + line + '\n';
        await writeFile('.env.setup.tmp', env, {mode: 0o600}); await rename('.env.setup.tmp', '.env');
        process.env.ORS_API_KEY = key.trim();
        return send(200, {configured: true});
      }
      if (url.pathname === '/api/geocode' && req.method === 'POST') {
        const {text} = await bodyOf(req);
        if (typeof text !== 'string' || text.trim().length < 5 || text.length > 500) return send(400, {error: 'Informe rua, número e cidade (até 500 caracteres).'});
        return send(200, {places: await geocode(text)});
      }
      if (url.pathname === '/api/matrix' && req.method === 'POST') return send(200, {distances: await distanceMatrix(await bodyOf(req))});
      return send(404, {error: 'Serviço não encontrado.'});
    }
    if (vite) return vite.middlewares(req, res);
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) return send(403, {error: 'Acesso negado.'});
    const filename = url.pathname === '/' ? resolve(root, 'index.html') : path;
    try {
      const data = await readFile(filename);
      res.writeHead(200, {'Content-Type': types[extname(filename)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'}); res.end(data);
    } catch {send(404, {error: 'Página não encontrada.'});}
  } catch (e) {send(e.status || 502, {error: e.name === 'TimeoutError' ? 'O serviço demorou a responder. Tente novamente.' : e.message || 'Não foi possível atender a solicitação.'});}
});
server.listen(port, host, () => console.log(`Alltec Roteirizador: http://${host}:${port} (${production ? 'produção' : 'desenvolvimento'})`));
