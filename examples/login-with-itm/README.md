# Login with ITM: server website example

A small Node server that adds **Log in with ITM** to a website. Visitors sign in on ITM's hosted sign-in page with a code sent to their phone or email, then come back to your site signed in. The site uses a confidential client: the client secret and the access token stay on the server, and the browser only gets an HttpOnly session cookie.

The sample brand is ITMTV. This example is separate from the events template in the repo root and has its own dependencies.

## What happens when someone signs in

1. The visitor clicks **Log in with ITM**. `GET /auth/login` creates a PKCE verifier, `state` and `nonce`, keeps them for 10 minutes, and redirects to ITM's hosted sign-in page.
2. On ITM's page the visitor enters a phone number or email, then the code ITM sends. ITM shows your brand's name, logo and what your brand receives. It also offers an optional, unticked marketing checkbox and records that choice itself.
3. ITM redirects back to `GET /auth/callback` with a one-time code. The server exchanges it using PKCE and `client_secret_basic`, validates the ID token (signature, issuer, audience, nonce and expiry), and reads the profile from UserInfo, checking that its `sub` matches the ID token.
4. The server keeps the access token in memory and sets an HttpOnly session cookie. `GET /api/session` returns only the visitor's name, email and phone number to the page.
5. **Sign out** (`POST /api/logout`) clears the session and revokes the access token.

The `sub` claim is the visitor's customer UID for your brand. It stays the same across all of your brand's apps, and it is the same ID the Partner API returns from `getPartnerAudience`. Signing in adds the visitor to your brand's contacts. It does not subscribe them to marketing unless they tick the checkbox.

## Set up

### 1. Create a Server website app in Backstage

In Backstage, go to **Manage › Advanced settings › Login with ITM › Create app**:

- App type: **Server website**
- Redirect URI: `http://localhost:4317/auth/callback`

Copy the **client ID** and the **client secret**. Backstage shows the secret only once; if you lose it, use **Rotate client secret** in the app's **View setup**.

### 2. Install and configure

Requires Node.js 22.18+.

```bash
cd examples/login-with-itm
npm install
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `ITM_AUTH_ISSUER` | Yes | ITM's issuer, `https://auth.itm-api.com`. It's already set in `.env.example`. |
| `ITM_CLIENT_ID` | Yes | The app's client ID. It starts with `itm_app_` and is not a secret. |
| `ITM_CLIENT_SECRET` | Yes | The app's client secret. Server only: never send it to the browser or commit it. |
| `SITE_ORIGIN` | No | The origin this site runs on. Defaults to `http://localhost:4317`. `${SITE_ORIGIN}/auth/callback` must exactly match a redirect URI registered on the app. |
| `PORT` | No | Defaults to `4317`. |

### 3. Run

```bash
npm run dev
```

Open [http://localhost:4317](http://localhost:4317) and click **Log in with ITM**.

Without credentials, the page still loads. **Explore the sign-in preview** opens a pretend flow (code `123456`) that never contacts ITM, sends no codes and changes no accounts, contacts or marketing subscriptions.

## Files

```
examples/login-with-itm/
├── server.mjs         # HTTP server: sign-in, callback, session and sign-out routes
├── server.test.mjs    # Tests against a local fixture issuer
├── public/
│   ├── index.html     # The ITMTV sample page
│   ├── app.js         # Reads /api/session, starts sign-in, signs out
│   └── style.css
└── .env.example
```

## Tests

```bash
npm test
node --check server.mjs
node --check public/app.js
```

The tests run the real `openid-client` library against a local fixture issuer that signs RSA tokens. They cover PKCE, confidential client authentication, state, cookie and replay checks, an invalid nonce, signature or UserInfo subject, expiry, revocation, sign-out races, and running without configuration. They don't exercise ITM's real code delivery or contact and marketing processing.

## Security notes

Keep these if you adapt the example:

- Authorization code flow with PKCE (S256), a random `state` and `nonce`, and one-use transactions that expire after 10 minutes.
- ID token signature, issuer, audience, nonce and expiry validation, plus UserInfo subject binding, all through `openid-client`.
- HttpOnly, `SameSite=Lax` cookies, marked `Secure` on HTTPS. Access tokens are never returned to the browser.
- Sessions end at the earliest of token expiry, ID token expiry and one hour. There are no refresh tokens.
- Sign-out cancels a pending callback, clears the local session and revokes the token. Existing sessions recheck UserInfo, so a revoked token can't serve a stale profile.
- The host and the sign-out `Origin` header are checked. Redirects and the issuer come from configuration, never from request headers.
- Provider errors, authorization codes, tokens and secrets are never sent to the browser.

## Before you use this on a real site

- Sessions live in memory and reset when the server restarts. Use a persistent session store, and limit how fast new sessions can be created.
- The server listens on `127.0.0.1` only. Run it behind your own HTTPS host, set `SITE_ORIGIN` to that origin, and register `${SITE_ORIGIN}/auth/callback` on the app in Backstage.
- Send visitors to ITM's sign-in page with a top-level redirect or a pop-up window. ITM's pages can't be shown inside an iframe.
