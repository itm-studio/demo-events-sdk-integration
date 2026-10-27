import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as oidc from 'openid-client';

const FILES = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const fail = (status, message) => Object.assign(new Error(message), { status });
const id = () => randomBytes(32).toString('base64url');
const loopback = (url) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

export function createApp({ issuer = process.env.ITM_AUTH_ISSUER, clientId = process.env.ITM_CLIENT_ID, clientSecret = process.env.ITM_CLIENT_SECRET, siteOrigin = process.env.SITE_ORIGIN, now = Date.now, onError = () => {} } = {}) {
  const configured = Boolean(issuer && clientId && clientSecret);
  if (issuer && new URL(issuer).protocol !== 'https:' && !(new URL(issuer).protocol === 'http:' && loopback(new URL(issuer)))) throw Error('Issuer must use HTTPS');
  if (siteOrigin && (new URL(siteOrigin).origin !== siteOrigin || (new URL(siteOrigin).protocol !== 'https:' && !(new URL(siteOrigin).protocol === 'http:' && loopback(new URL(siteOrigin)))))) throw Error('SITE_ORIGIN must be an HTTPS origin or localhost');
  const localIssuer = Boolean(issuer && loopback(new URL(issuer)));
  const sessions = new Map(), transactions = new Map();
  let configuration;
  const config = async () => {
    if (!configured) throw fail(503, 'Hosted sign-in is not configured yet.');
    configuration ??= oidc.discovery(new URL(issuer), clientId, { client_secret: clientSecret }, oidc.ClientSecretBasic(clientSecret), {
      timeout: 10,
      execute: [oidc.enableNonRepudiationChecks, ...(new URL(issuer).protocol === 'http:' ? [oidc.allowInsecureRequests] : [])],
    }).catch((error) => { configuration = undefined; throw error; });
    return configuration;
  };
  const timer = setInterval(() => {
    for (const map of [sessions, transactions]) for (const [key, value] of map) if (value.expires <= now()) map.delete(key);
  }, 60_000).unref();
  const server = createServer(async (req, res) => {
    const origin = siteOrigin ?? `http://localhost:${server.address().port}`;
    const secure = origin.startsWith('https:') ? '; Secure' : '';
    const cookie = (name, value, age) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure}`;
    const cookies = Object.fromEntries((req.headers.cookie ?? '').split(';').map((s) => s.trim().split('=')));
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    const redirect = (url) => { res.writeHead(303, { Location: url }); res.end(); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const url = new URL(req.url, origin), path = url.pathname;
    try {
      if (req.headers.host !== new URL(origin).host) throw fail(403, 'Invalid request host.');
      if (req.method === 'GET' && FILES[path]) {
        const [name, type] = FILES[path];
        res.setHeader('Content-Type', `${type}; charset=utf-8`);
        return res.end(await readFile(new URL(`./public/${name}`, import.meta.url)));
      }
      if (req.method === 'GET' && path === '/auth/login') {
        const c = await config();
        transactions.delete(cookies.itm_login_tx);
        const transactionId = id();
        const verifier = oidc.randomPKCECodeVerifier(), state = oidc.randomState(), nonce = oidc.randomNonce();
        const authorizationUrl = oidc.buildAuthorizationUrl(c, {
          redirect_uri: origin + '/auth/callback', scope: 'openid profile email phone', state, nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
        });
        transactions.set(transactionId, { verifier, state, nonce, expires: now() + 600_000, consumed: false });
        res.setHeader('Set-Cookie', cookie('itm_login_tx', transactionId, 600));
        return redirect(authorizationUrl.href);
      }
      if (req.method === 'GET' && path === '/auth/callback') {
        const transactionId = cookies.itm_login_tx, tx = transactions.get(transactionId);
        if (!tx || tx.expires <= now() || tx.consumed) throw fail(400, 'Sign-in expired. Start again.');
        tx.consumed = true;
        res.setHeader('Set-Cookie', cookie('itm_login_tx', '', 0));
        let issuedToken;
        try {
          const c = await config();
          const tokens = await oidc.authorizationCodeGrant(c, url, { pkceCodeVerifier: tx.verifier, expectedState: tx.state, expectedNonce: tx.nonce, idTokenExpected: true });
          issuedToken = tokens.access_token;
          const claims = tokens.claims();
          if (!claims?.sub || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw fail(400, 'Invalid sign-in response.');
          await oidc.fetchUserInfo(c, tokens.access_token, claims.sub);
          if (transactions.get(transactionId) !== tx || tx.expires <= now()) {
            throw fail(400, 'Sign-in cancelled.');
          }
          const lifetime = Math.floor(Math.min(tokens.expires_in, claims.exp - now() / 1000, 3600));
          if (lifetime <= 0) throw fail(400, 'Sign-in expired.');
          const previous = sessions.get(cookies.itm_preview);
          sessions.delete(cookies.itm_preview);
          if (previous) void oidc.tokenRevocation(c, previous.accessToken).catch(() => {});
          const sessionId = id();
          sessions.set(sessionId, { accessToken: tokens.access_token, sub: claims.sub, expires: now() + lifetime * 1000 });
          res.setHeader('Set-Cookie', [cookie('itm_login_tx', '', 0), cookie('itm_preview', sessionId, lifetime)]);
          issuedToken = undefined;
          return redirect('/');
        } catch (error) {
          if (issuedToken) await oidc.tokenRevocation(await config(), issuedToken).catch(() => {});
          throw error;
        } finally { transactions.delete(transactionId); }
      }
      if (req.method === 'GET' && path === '/api/session') {
        const session = sessions.get(cookies.itm_preview);
        if (!session || session.expires <= now()) { sessions.delete(cookies.itm_preview); return json(200, { configured, localIssuer, profile: null }); }
        try {
          const profile = await oidc.fetchUserInfo(await config(), session.accessToken, session.sub);
          if (sessions.get(cookies.itm_preview) !== session) return json(200, { configured, localIssuer, profile: null });
          return json(200, { configured, localIssuer, profile: { name: profile.name ?? null, email: profile.email ?? null, phoneNumber: profile.phone_number ?? null } });
        } catch (error) {
          // A provider outage must not return stale authenticated data.
          if (error.cause?.status === 401 || error.code === 'OAUTH_WWW_AUTHENTICATE_CHALLENGE') {
            sessions.delete(cookies.itm_preview);
            res.setHeader('Set-Cookie', cookie('itm_preview', '', 0));
            return json(200, { configured, localIssuer, profile: null });
          }
          throw error;
        }
      }
      if (req.method === 'POST' && path === '/api/logout') {
        if (req.headers.origin !== origin) throw fail(403, 'Invalid request origin.');
        const session = sessions.get(cookies.itm_preview);
        sessions.delete(cookies.itm_preview);
        transactions.delete(cookies.itm_login_tx);
        res.setHeader('Set-Cookie', [cookie('itm_preview', '', 0), cookie('itm_login_tx', '', 0)]);
        if (session) await oidc.tokenRevocation(await config(), session.accessToken).catch(() => {});
        return json(200, { ok: true });
      }
      throw fail(404, 'Page not found.');
    } catch (error) {
      onError(error);
      // Never send provider errors, authorization codes, tokens or secrets to the browser/logs.
      if (path === '/auth/callback') return redirect('/?login_error=1');
      json(error.status ?? 502, { error: error.status ? error.message : 'ITM could not complete sign-in. Please try again.' });
    }
  });
  server.on('close', () => clearInterval(timer));
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4317);
  createApp().listen(port, '127.0.0.1', () => console.log(`ITMTV preview: http://localhost:${port}`));
}
