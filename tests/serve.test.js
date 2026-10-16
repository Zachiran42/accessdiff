import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { once } from 'node:events';
import { createStaticServer } from '../scripts/serve.mjs';

const publicFiles = [
  ['index.html', 'text/html'], ['styles.css', 'text/css'],
  ['docs/input-format.md', 'text/markdown'],
  ...['app', 'session', 'json', 'snapshot', 'access', 'policy', 'simulation', 'report'].map(name => [`src/${name}.js`, 'text/javascript']),
  ...['before', 'after', 'required-read'].map(name => [`examples/${name}.json`, 'application/json']),
];

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'accessdiff-static-test-'));
  for (const subdirectory of ['src', 'examples', 'devpost', 'docs', 'tests']) await mkdir(join(directory, subdirectory));
  for (const [file] of publicFiles) await writeFile(join(directory, file), `fixture:${file}:é`, 'utf8');
  for (const privateFile of ['.env', 'devpost/learner-profile.md', 'devpost/spec.md', 'docs/private.md', 'README.md', 'tests/private.txt']) {
    await writeFile(join(directory, privateFile), 'private-fixture-value', 'utf8');
  }
  const server = createStaticServer({ root: directory });
  assert.equal(server.listening, false, 'the exported factory must not open a port');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  assert.equal(server.address().address, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  return server.address().port;
}

function get(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, response => {
      const parts = [];
      response.on('data', part => parts.push(part));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(parts).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('only allowlisted public files are served, with correct MIME and restrictive headers', async t => {
  const port = await fixture(t);
  for (const [file, mime] of publicFiles) {
    const response = await get(port, `/${file}`);
    assert.equal(response.status, 200, file);
    assert.equal(response.body, `fixture:${file}:é`);
    assert.equal(response.headers['content-type'], `${mime}; charset=utf-8`);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(response.headers['content-security-policy'], /connect-src 'self'/);
    assert.match(response.headers['content-security-policy'], /script-src 'self'/);
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.doesNotMatch(response.headers['content-security-policy'], /unsafe-inline|https?:/);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  assert.equal((await get(port, '/')).body, 'fixture:index.html:é');
});

test('HEAD returns the GET headers without a response body', async t => {
  const port = await fixture(t);
  const head = await get(port, '/index.html', 'HEAD');
  const normal = await get(port, '/index.html');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-type'], normal.headers['content-type']);
  assert.equal(Number(head.headers['content-length']), Buffer.byteLength(normal.body));
});

test('planning, profiles, dotfiles, directories and traversal requests are unavailable', async t => {
  const port = await fixture(t);
  for (const path of [
    '/.env', '/.git/config', '/devpost/learner-profile.md', '/devpost/spec.md', '/README.md',
    '/tests/private.txt', '/tests/', '/src/', '/examples/', '/docs/', '/docs/private.md', '/package.json', '/api/upload',
    '/../index.html', '/src/../index.html', '/%2e%2e/index.html', '/src%2fapp.js',
    '/%2eenv', '/src\\..\\index.html', '//index.html', '/index.html/extra', '/unknown',
  ]) {
    const response = await get(port, path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.body, /private-fixture-value|fixture:/);
  }
});

test('server rejects write and other unsupported methods without accepting uploaded data', async t => {
  const port = await fixture(t);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await get(port, '/index.html', method);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.allow, 'GET, HEAD');
    assert.doesNotMatch(response.body, /fixture:/);
  }
});

test('missing allowlisted file returns a generic failure with no filesystem path', async t => {
  const port = await fixture(t);
  const server = createStaticServer({ root: join(tmpdir(), 'accessdiff-absent-fixture-directory') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await get(server.address().port, '/index.html');
  assert.equal(response.status, 404);
  assert.equal(response.body, 'Fichier introuvable.');
  assert.doesNotMatch(response.body, /accessdiff-absent|ENOENT/);
  assert.ok(port > 0);
});
