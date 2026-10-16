import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ROUTES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/docs/input-format.md', ['docs/input-format.md', 'text/markdown; charset=utf-8']],
  ...['app', 'session', 'json', 'snapshot', 'access', 'policy', 'simulation', 'report'].map(name => [
    `/src/${name}.js`, [`src/${name}.js`, 'text/javascript; charset=utf-8'],
  ]),
  ...['before', 'after', 'required-read'].map(name => [
    `/examples/${name}.json`, [`examples/${name}.json`, 'application/json; charset=utf-8'],
  ]),
]);

const APPLICATION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

/** Create the local static server without opening a port or writing any data. */
export function createStaticServer({ root = PROJECT_ROOT } = {}) {
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', APPLICATION_CSP);
    response.setHeader('Referrer-Policy', 'no-referrer');

    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      response.statusCode = status;
      response.setHeader('Content-Type', type);
      response.setHeader('Content-Length', Buffer.byteLength(body));
      response.end(request.method === 'HEAD' ? undefined : body);
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      send(405, 'Méthode non autorisée.');
      return;
    }

    // Keep the raw route: decoding or URL normalization could turn a rejected
    // traversal-shaped request into an accepted route. Files come only from MAP.
    const route = (request.url ?? '').split('?', 1)[0];
    const asset = ROUTES.get(route);
    if (!asset) {
      send(404, 'Fichier introuvable.');
      return;
    }

    try {
      const bytes = await readFile(join(root, asset[0]));
      send(200, bytes, asset[1]);
    } catch (error) {
      const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
      send(missing ? 404 : 500, missing ? 'Fichier introuvable.' : 'Lecture du fichier impossible.');
    }
  });
}

function parsePort(args) {
  if (args.length === 0) return 5174;
  if (args.length !== 2 || args[0] !== '--port' || !/^[0-9]+$/.test(args[1])) {
    throw new Error('Usage : node scripts/serve.mjs [--port 5175]');
  }
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Le port doit être un entier entre 1 et 65535.');
  }
  return port;
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  try {
    const port = parsePort(process.argv.slice(2));
    const server = createStaticServer();
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') {
        const alternate = port === 5175 ? 5176 : 5175;
        console.error(`Le port ${port} est occupé. Essaie : node scripts/serve.mjs --port ${alternate}`);
      } else {
        console.error('Impossible de démarrer le serveur local.');
      }
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`AccessDiff : http://127.0.0.1:${port}/`);
      console.log('Traitement dans le navigateur. Ctrl+C pour arrêter le serveur.');
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
