# AGENTS.md: videri-probe protocol

This file documents the `videri-probe` protocol at a level precise enough
that a coding agent can implement it in any language without reading
`probe/videri-probe.mjs`. That file is the Node reference implementation —
use it to verify a port's output, not as the source of truth for behavior;
this document is the contract.

Read `videri-context/AGENTS.md` first for the platform-wide rules (one
environment, never invent identifiers, count from totals, no secrets
anywhere visible). This file only covers what the probe itself does.

Status: v0, covers `videri-probe` (CORE-10294) only. Grows to cover the full
starter kit's client/auth/config layer in a later pass.

## What the probe does, in order

### 1. Authenticate

```
POST {API_BASE_URL}/rpm-service/v2/auth/token
Content-Type: application/json

{ "username": "...", "password": "...", "api_key": "..." }
```

Response, `200 OK`:

```json
{
  "access_token": "...",
  "id_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

- Use `id_token` as the Bearer token for every call in this document except
  Canvas Status and Metrics (step 6).
- `id_token` and `access_token` are JWTs. Decode the payload (base64url
  decode the middle segment, parse as JSON) without verifying the
  signature — this probe only reads its own token back for console output,
  it never trusts an externally supplied token.
- The `tenants` claim in the decoded payload is a **JSON-encoded string**,
  not a JSON array: `"[\"VIDERISALES\",\"TRADESHOW\"]"`. Parse it a second
  time to get `["VIDERISALES", "TRADESHOW"]`. Fail loudly if `tenants` is
  not a string — that means the shape changed.
- `expires_in` is seconds (typically 3600). This probe is a one-shot script,
  so it does not need to cache or refresh; a client library layered on top
  should cache with a margin (5 minutes suggested by `videri-context`) and
  re-authenticate on 401 rather than use `refresh_token`.
- Never print `api_key`, `password`, or a full token. Redact to a short
  prefix plus a length, e.g. `eyJh...(842 chars)`.

### 2. List workspaces (per tenant)

```
GET {API_BASE_URL}/rpm/v1/users/me/groups_access
Authorization: Bearer <id_token>
x-tenant: <tenant_code>
```

Response shape:

```json
{ "groupAccess": [ { "id": "...", "name": "...", "descendants": [ ... ] } ] }
```

- The nested workspace field is **`descendants`**, not `children` — the
  published OpenAPI schema names it `children`, so code generated from the
  spec reads the wrong key and silently sees a flat, one-level tree. Read
  `descendants`; fall back to `children` only defensively
  (`node.descendants ?? node.children ?? []`).
- Walk the tree recursively and print every workspace with its depth and
  id, so a builder can see the full tree in one pass.
- `x-tenant` takes **exactly one** tenant code, never the whole `tenants`
  array. For a multi-tenant account, call once per tenant.

### 3. List canvases

```
GET {API_BASE_URL}/canvas-service/canvases?assigned_to_group=true&size=1000
GET {API_BASE_URL}/canvas-service/canvases?assigned_to_group=false&size=1000
Authorization: Bearer <id_token>
x-tenant: <tenant_code>
```

- `assigned_to_group=true` and `=false` return **disjoint sets** — there is
  no "all" value. Call both and concatenate to get every canvas.
- Response body may put the array under `content`, `data`, `canvases`, or
  `items` depending on the deploy — check all four keys in that order and
  use whichever is present. Do not assume one wrapper.
- For each canvas, print (accepting both snake_case and camelCase):
  `id`, `device_id`/`deviceId`, `xmpp_jid`/`xmppJid`, `name`,
  `current_brightness`/`currentBrightness`.
- Print the total count at the end. Count from the merged array's length
  here (this is a one-shot discovery script over a bounded demo estate);
  a real client should count from a service's own total field
  (`totalElements`, `meta.totalItems`, etc.) once it implements paging, not
  from array length, since a single page is not the whole set.

### 4. Dump one canvas's settings

Takes a canvas ID as a CLI argument.

```
POST {API_BASE_URL}/canvas-service/canvases/{canvasId}/sync_command
Authorization: Bearer <id_token>
x-tenant: <tenant_code>
Content-Type: application/json

{ "command": "ops_get_settings" }
```

- Print the full response, with the `available_timezones` field removed
  (it is large and not useful for this discovery pass).

### 5. Optional write: flip brightness (`--write` flag)

```
POST {API_BASE_URL}/canvas-service/canvases/{canvasId}/sync_command
Authorization: Bearer <id_token>
x-tenant: <tenant_code>
Content-Type: application/json

{ "command": "demo_command set_brightness:={0-255}" }
```

- Brightness is **0-255 on the device**, not a 0-100 percentage. Convert at
  the edge if a UI shows a percentage: `round(pct / 100 * 255)`.
- Refuse to run this step unless `VIDERI_TENANT` (case-insensitive) is
  `VIDERI` or `VIDERISALES` — the two internal builder tenants
  (`videri-context/AUTH.md`, "Getting access"). This is a safety rail: this
  script must never flip a customer's device.
- After sending the command, call step 4 again and print
  `brightness before=<X> after=<Y>` so the effect is visible, not assumed
  from a 200 response.

### 6. Canvas Status and Metrics: `id_token` vs `access_token`

Every other call in this document uses `id_token`. Canvas Status and
Metrics are the one documented exception — one internal build reports both
endpoints need `access_token` instead, returning 401/403 to `id_token`
where every other service accepts it. This has not been independently
reproduced by a curator as of this file's writing.

Probe both endpoints with both token types and print the result, so this
question is settled live against the environment you're actually running
against, not trusted from a document:

```
POST {API_BASE_URL}/canvas-service/status/fetch_all
POST {API_BASE_URL}/canvas-service/metrics/fetch_all
Authorization: Bearer <id_token OR access_token>
x-tenant: <tenant_code>
Content-Type: application/json

{ "ids": [<up to 5 canvas ids from step 3>] }
```

Print one line per (endpoint, token type) combination: the endpoint name,
which token was used, the HTTP status, and OK/FAIL. Four lines total.

## Headers, summarized

| Header | Value | Notes |
|---|---|---|
| `Authorization` | `Bearer <id_token>` | `access_token` only for step 6, per above |
| `x-tenant` | one tenant code | never the whole `tenants` array |
| `x-group` | workspace UUID | not used by this probe; required by some write endpoints outside this script's scope. Canvas Service takes the workspace as the `group_id` **query parameter** instead of this header — not exercised by this probe, since it queries all accessible canvases rather than one workspace, but any client built on top of this probe must not assume `x-group` covers Canvas Service too. |
| `Content-Type` | `application/json` | on every request with a body |

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VIDERI_API_BASE_URL` | no | `https://api.go.videri.com` | no trailing slash; a key, a token and a tenant all belong to exactly one environment, so change this if you're building against a different one |
| `VIDERI_USERNAME` | yes | — | |
| `VIDERI_PASSWORD` | yes | — | |
| `VIDERI_API_KEY` | yes | — | never printed |
| `VIDERI_TENANT` | yes | — | one tenant code; must appear in the decoded `tenants` claim or the probe should fail loudly rather than proceed |

## Expected console output shape

A port should produce output structured the same way as the Node
reference, even if formatting differs — six numbered sections in this
order: Authenticate, Workspaces, Canvases, Canvas settings (if a canvas ID
was given), the optional write diff (if `--write`), Canvas Status/Metrics
probe. Run the Node reference (`node probe/videri-probe.mjs <canvasId>`)
against the same tenant and environment and diff the two outputs to verify a
port.

## Non-negotiable rules for this probe specifically

(In addition to `videri-context/AGENTS.md`'s platform-wide rules.)

1. Never print `VIDERI_API_KEY`, `VIDERI_PASSWORD`, or a full token value.
2. Refuse `--write` unless the tenant is Videri or Videri Sales.
3. Default to production (`https://api.go.videri.com`) if `VIDERI_API_BASE_URL`
   is unset.
4. Fail loudly (non-zero exit, clear message) on any unexpected response
   shape rather than guessing — this script's job is to surface exactly
   what the platform returns, not to paper over it.
