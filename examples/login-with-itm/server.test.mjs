import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, sign, createHash, randomBytes } from 'node:crypto';
import { createApp } from './server.mjs';

async function listen(server) { await new Promise((r) => server.listen(0, '127.0.0.1', r)); return `http://localhost:${server.address().port}`; }
const getCookies = (res) => res.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ');
const request = (url, options = {}) => fetch(url, { ...options, redirect: 'manual' });

async function fixture(t) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };
  const codes = new Map(), tokens = new Map(), revoked = [];
  let issuer, tamperSignature = false, wrongSubject = false, delayExchange;
  const provider = createServer(async (req, res) => {
    const json = (status, value, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(value)); };
    if (req.url === '/.well-known/openid-configuration') return json(200, { issuer, authorization_endpoint: issuer + '/auth', token_endpoint: issuer + '/token', userinfo_endpoint: issuer + '/me', jwks_uri: issuer + '/jwks', revocation_endpoint: issuer + '/revoke', response_types_supported: ['code'], subject_types_supported: ['pairwise'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic'], authorization_response_iss_parameter_supported: true });
    if (req.url === '/jwks') return json(200, { keys: [jwk] });
    if (req.url === '/me') {
      const token = req.headers.authorization?.slice(7);
      if (!tokens.has(token)) return json(401, { error: 'invalid_token' }, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
      return json(200, { sub: wrongSubject ? 'other-user' : 'brand-user-1', name: 'Listener', email: 'listener@example.com' });
    }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const params = new URLSearchParams(raw);
    if (decodeURIComponent(Buffer.from(req.headers.authorization?.slice(6) ?? '', 'base64').toString()) !== 'test-client:test-secret') return json(401, { error: 'invalid_client' });
    if (req.url === '/revoke') { const token = params.get('token'); tokens.delete(token); revoked.push(token); return json(200, {}); }
    if (req.url === '/token') {
      const auth = codes.get(params.get('code')); codes.delete(params.get('code'));
      if (!auth || params.get('redirect_uri') !== auth.redirect_uri || createHash('sha256').update(params.get('code_verifier') ?? '').digest('base64url') !== auth.code_challenge) return json(400, { error: 'invalid_grant' });
      if (delayExchange) await delayExchange();
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ iss: issuer, aud: 'test-client', sub: 'brand-user-1', nonce: auth.nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      const unsigned = `${header}.${payload}`, signature = sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
      const token = randomBytes(32).toString('base64url'); tokens.set(token, true);
      return json(200, { access_token: token, token_type: 'Bearer', expires_in: 3600, id_token: unsigned + '.' + (tamperSignature ? signature.slice(0, -4) + 'AAAA' : signature) });
    }
    json(404, {});
  });
  issuer = await listen(provider);
  let time = Date.now();
  const errors = [];
  const app = createApp({ onError: (error) => errors.push(error), issuer, clientId: 'test-client', clientSecret: 'test-secret', now: () => time });
  const origin = await listen(app);
  t.after(async () => { for (const server of [app, provider]) { server.closeAllConnections(); await new Promise((r) => server.close(r)); } });
  const begin = async () => {
    const res = await request(origin + '/auth/login');
    assert.equal(res.status, 303);
    assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
    const auth = Object.fromEntries(new URL(res.headers.get('location')).searchParams);
    assert.equal(auth.code_challenge_method, 'S256');
    assert.equal(auth.response_type, 'code');
    const code = randomBytes(16).toString('hex'); codes.set(code, auth);
    return { auth, cookies: getCookies(res), callback: origin + '/auth/callback?' + new URLSearchParams({ code, state: auth.state, iss: issuer }), code };
  };
  return { errors, origin, begin, codes, tokens, revoked, signature: () => tamperSignature = true, mismatch: () => wrongSubject = true, advance: () => time += 3600_001, delay: (fn) => delayExchange = fn };
}

test('hosted login validates tokens, stores them server-side and revokes on logout', async (t) => {
  const f = await fixture(t), login = await f.begin();
  const callback = await request(login.callback, { headers: { cookie: login.cookies } });
  assert.equal(callback.headers.get('location'), '/', f.errors.map((e) => e.stack + '\n' + JSON.stringify(e.cause)).join('\n'));
  const cookie = getCookies(callback);
  assert.notEqual(cookie, login.cookies);
  const session = await (await request(f.origin + '/api/session', { headers: { cookie } })).json();
  assert.equal(session.profile.email, 'listener@example.com');
  assert.equal(session.access_token, undefined);
  const logout = await request(f.origin + '/api/logout', { method: 'POST', headers: { cookie, origin: f.origin } });
  assert.equal(logout.status, 200); assert.equal(f.revoked.length, 1);
  assert.equal((await (await request(f.origin + '/api/session', { headers: { cookie } })).json()).profile, null);
});

test('callback needs its cookie, matching state and a fresh transaction', async (t) => {
  const f = await fixture(t), login = await f.begin();
  assert.match((await request(login.callback)).headers.get('location'), /login_error/);
  const wrong = new URL(login.callback); wrong.searchParams.set('state', 'attacker');
  assert.match((await request(wrong, { headers: { cookie: login.cookies } })).headers.get('location'), /login_error/);
  assert.match((await request(login.callback, { headers: { cookie: login.cookies } })).headers.get('location'), /login_error/);
});

test('wrong nonce, signature and UserInfo subject each reject sign-in', async (t) => {
  for (const invalid of ['nonce', 'signature', 'subject']) {
    const f = await fixture(t), login = await f.begin();
    if (invalid === 'nonce') f.codes.get(login.code).nonce = 'attacker';
    if (invalid === 'signature') f.signature();
    if (invalid === 'subject') f.mismatch();
    assert.match((await request(login.callback, { headers: { cookie: login.cookies } })).headers.get('location'), /login_error/);
    assert.equal((await (await request(f.origin + '/api/session')).json()).profile, null);
  }
});

test('expiry and token revocation prevent authenticated responses', async (t) => {
  const f = await fixture(t), login = await f.begin();
  const callback = await request(login.callback, { headers: { cookie: login.cookies } });
  assert.equal(callback.headers.get('location'), '/');
  const cookie = getCookies(callback);
  f.tokens.clear();
  assert.equal((await (await request(f.origin + '/api/session', { headers: { cookie } })).json()).profile, null);
  const next = await f.begin();
  const nextCallback = await request(next.callback, { headers: { cookie: next.cookies } });
  f.advance();
  assert.equal((await (await request(f.origin + '/api/session', { headers: { cookie: getCookies(nextCallback) } })).json()).profile, null);
});

test('logout cancels an in-flight callback and rejects cross-origin requests', async (t) => {
  const f = await fixture(t), login = await f.begin();
  let release, entered; const started = new Promise((r) => entered = r);
  f.delay(() => { entered(); return new Promise((r) => release = r); });
  const callback = request(login.callback, { headers: { cookie: login.cookies } });
  await started;
  const rejected = await request(f.origin + '/api/logout', { method: 'POST', headers: { cookie: login.cookies, origin: 'https://evil.example' } });
  assert.equal(rejected.status, 403);
  await request(f.origin + '/api/logout', { method: 'POST', headers: { cookie: login.cookies, origin: f.origin } });
  release();
  assert.match((await callback).headers.get('location'), /login_error/);
  assert.equal(f.revoked.length, 1);
});

test('unconfigured demo reports unavailable and never returns credentials', async (t) => {
  const app = createApp({ issuer: '', clientId: '', clientSecret: '' }); const origin = await listen(app);
  t.after(() => { app.closeAllConnections(); app.close(); });
  assert.deepEqual(await (await request(origin + '/api/session')).json(), { configured: false, localIssuer: false, profile: null });
  assert.equal((await request(origin + '/auth/login')).status, 503);
});
