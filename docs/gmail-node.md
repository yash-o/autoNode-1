# Gmail node — OAuth setup

The Gmail node sends mail as a real Google account through the Gmail API
(`users.messages.send`). It uses OAuth 2.0 with a refresh token, not an API key.

## How it works

1. **Connect** — `/credentials/new` → type **Gmail** → *Connect Google Account*.
   `/api/credentials/gmail/authorize` signs a state token bound to your user id
   and redirects to Google with the `gmail.send` scope.
2. **Callback** — Google returns to
   `/api/credentials/gmail/callback`. The route verifies the signed state, checks
   you are still the same logged-in user, exchanges the code for a refresh token,
   reads the account address, and stores
   `{ refreshToken, email, scope }` **encrypted** in the `Credential` row.
3. **Send** — the executor decrypts the credential, mints a short-lived access
   token from the refresh token, builds a MIME message, and POSTs it to Gmail.
   Access tokens are never persisted.

The node never requests read access, so AutoNode cannot see your inbox.

## 1. Google Cloud configuration

1. Create (or reuse) a project at <https://console.cloud.google.com>.
2. **APIs & Services → Library → Gmail API → Enable**.
3. **APIs & Services → OAuth consent screen**
   - Add the scope `https://www.googleapis.com/auth/gmail.send`.
   - While the app is in *Testing*, add every Google account you want to connect
     under **Test users**. `gmail.send` is a sensitive scope, so publishing to
     production requires Google verification.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**.
   - **Authorised redirect URI**: `<NEXT_PUBLIC_APP_URL>/api/credentials/gmail/callback`
     (exactly, no trailing slash). For local dev with the ngrok URL already in
     `.env`, that is:
     `https://sindy-chocker-unsimultaneously.ngrok-free.dev/api/credentials/gmail/callback`
   - If you also use Google sign-in, either add this redirect URI to that same
     client or create a second client just for Gmail.

## 2. Environment variables

The Gmail flow reuses the existing Google client by default, so **no env change
is required** if `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set.

To use a dedicated OAuth client instead:

```bash
GMAIL_CLIENT_ID="..."
GMAIL_CLIENT_SECRET="..."
```

`GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` take precedence when present.

The redirect URI is derived from `NEXT_PUBLIC_APP_URL`. **It must match the URI
registered in Google Cloud exactly** — if you browse the app on `localhost:3000`
but `NEXT_PUBLIC_APP_URL` points at ngrok, Google will send you back to ngrok.

## 3. Use the node

1. **Credentials → New credential → Type: Gmail → Connect Google Account.**
   Approve the consent screen. You are returned to `/credentials` with a new
   `Gmail (you@gmail.com)` credential.
2. In the editor, add an **Email (Gmail)** node and connect a trigger to it.
3. Open its settings:
   - **Variable Name** — result is available as `{{myEmail.messageId}}`,
     `{{myEmail.threadId}}`, `{{myEmail.to}}`, `{{myEmail.subject}}`.
   - **Gmail Account** — pick a connected credential.
   - **Sender Name** — optional display name; the address is always the connected
     account.
   - **To / Subject / Body (HTML)** — support `{{variables}}` and
     `{{json someObject}}`.
4. Run the workflow. The node status goes loading → success/error; failures are
   recorded on the execution.

## Reconnecting

If a user revokes access at <https://myaccount.google.com/permissions>, or the
refresh token is invalidated, the node fails with a non-retriable error telling
you to reconnect. Open the credential and click **Connect Google Account** again;
a new credential is created, and you should re-select it in the node.

## Error codes returned to `/credentials/new?gmailError=…`

| Code | Meaning |
|---|---|
| `not_configured` | No OAuth client id/secret in the environment. |
| `access_denied` | User cancelled the Google consent screen. |
| `invalid_state` | Signed state expired (>10 min) or was tampered with. |
| `missing_refresh_token` | Google did not issue a refresh token; retry the flow. |
| `missing_scope` | `gmail.send` was not granted on the consent screen. |
| `exchange_failed` | Token endpoint rejected the code (wrong redirect URI, expired code, client mismatch). |

## Security notes

- The refresh token is encrypted with `ENCRYPTION_KEY` (`cryptr`), the same as
  other credentials, and never leaves the server.
- OAuth `state` is HMAC-signed with `BETTER_AUTH_SECRET` (falling back to
  `ENCRYPTION_KEY`) and expires after 10 minutes. The callback also re-checks the
  session user id so a leaked state cannot attach an account to someone else.
- `To`, `Subject`, and `Sender Name` are stripped of CR/LF before being placed in
  MIME headers, preventing header injection (e.g. smuggled `Bcc`).
- The credential is still created outside the tRPC `premiumProcedure`. If
  credentials should be a paid feature, add the subscription check to the
  callback route.
