import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCsrfFetch } from '../src/services/csrf-fetch.ts';

const json = (status, body) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json' } });
const tokenResponse = token => json(200, { success: true, data: { token } });

test('uses handshake token when API cookie is not readable on website origin', async () => {
  const calls = [];
  const api = createCsrfFetch({ baseUrl: 'https://api.example.test/api', readCookie: () => null,
    fetch: async (url, init) => {
      calls.push(url);
      assert.equal(init.credentials, 'include');
      if (url.endsWith('/csrf')) { assert.equal(init.cache, 'no-store'); return tokenResponse('issued'); }
      assert.equal(init.headers.get('x-csrf-token'), 'issued');
      assert.equal(init.body, 'login-body');
      return json(401, { message: 'Invalid email or password' });
    } });
  assert.equal((await api('/auth/login', { method: 'POST', body: 'login-body' })).status, 401);
  assert.equal(calls.length, 2);
});

test('concurrent first mutations share one handshake', async () => {
  let handshakes = 0, mutations = 0;
  const api = createCsrfFetch({ baseUrl: 'https://example.test/api', readCookie: () => null,
    fetch: async (url, init) => {
      if (url.endsWith('/csrf')) { handshakes++; await new Promise(resolve => setImmediate(resolve)); return tokenResponse('shared'); }
      mutations++;
      assert.equal(init.headers.get('x-csrf-token'), 'shared');
      return json(200, { success: true });
    } });
  await Promise.all([api('/one', { method: 'POST' }), api('/two', { method: 'POST' })]);
  assert.equal(handshakes, 1);
  assert.equal(mutations, 2);
});

test('stale cookie rejection refreshes once and preserves request headers and body', async () => {
  let cookie = 'stale', handshakes = 0, attempts = 0;
  const body = new FormData(); body.append('photo', 'fixture');
  const api = createCsrfFetch({ baseUrl: 'https://example.test/api', readCookie: () => cookie,
    fetch: async (url, init) => {
      if (url.endsWith('/csrf')) { handshakes++; cookie = 'fresh'; return tokenResponse('fresh'); }
      assert.equal(init.body, body);
      assert.equal(init.headers.get('x-request-id'), 'fixture');
      assert.equal(init.headers.has('content-type'), false);
      attempts++;
      assert.equal(init.headers.get('x-csrf-token'), attempts === 1 ? 'stale' : 'fresh');
      return attempts === 1 ? json(403, { message: 'Invalid CSRF token' }) : json(200, { success: true });
    } });
  assert.equal((await api('/upload', { method: 'POST', body, headers: new Headers({ 'x-request-id': 'fixture' }) })).status, 200);
  assert.equal(attempts, 2); assert.equal(handshakes, 1);
});

test('does not retry role failures, credential failures, server errors or successful writes', async () => {
  for (const [status, message] of [[403, 'Forbidden'], [401, 'Invalid email or password'], [500, 'Failure'], [200, 'OK']]) {
    let calls = 0;
    const api = createCsrfFetch({ baseUrl: 'https://example.test/api', readCookie: () => 'token',
      fetch: async () => { calls++; return json(status, { message }); } });
    assert.equal((await api('/write', { method: 'POST' })).status, status);
    assert.equal(calls, 1);
  }
});

test('persistent CSRF rejection is returned after one retry', async () => {
  let writes = 0, handshakes = 0;
  const api = createCsrfFetch({ baseUrl: 'https://example.test/api', readCookie: () => 'old',
    fetch: async url => {
      if (url.endsWith('/csrf')) { handshakes++; return tokenResponse('new'); }
      writes++; return json(403, { message: 'Invalid CSRF token' });
    } });
  assert.equal((await api('/write', { method: 'POST' })).status, 403);
  assert.equal(writes, 2); assert.equal(handshakes, 1);
});

test('GET does not acquire a token and malformed handshake stops the mutation', async () => {
  const paths = [];
  const api = createCsrfFetch({ baseUrl: 'https://example.test/api', readCookie: () => null,
    fetch: async url => { paths.push(url); return json(200, { success: true }); } });
  assert.equal((await api('/inventory')).status, 200);
  await assert.rejects(api('/write', { method: 'POST' }), /Invalid CSRF token response/);
  assert.equal(paths.length, 2);
  assert(paths[1].endsWith('/csrf'));
});
