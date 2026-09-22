# AGENTS.md: videri-starter protocol

This file documents videri-starter's protocol — the probe and the core
client library — at a level precise enough that a coding agent can
implement either in any language without reading the `.mjs` source. Those
files are the Node reference implementation — use them to verify a port's
output, not as the source of truth for behavior; this document is the
contract.

Read `videri-context/AGENTS.md` first for the platform-wide rules (one
environment, never invent identifiers, count from totals, no secrets
anywhere visible). This file covers what this repo's own code does.

Status: v0. Covers `videri-probe` (CORE-10294) and the core client library —
auth, request wrapper, RPM (workspaces), Canvas Service, Canvas Status, CMS
and Publisher adapters, config (CORE-10267). Does not yet cover wall/layout
resolution, delivery evidence, canvas settings (Part 1 step 4's documented
endpoint doesn't work — no replacement found), or the menu-board recipe
(CORE-10268, lives in `videri-recipes`).

## Part 1: `videri-probe`

Run this first, before writing any application code — it turns "is my
access working" from a guess into ten minutes of console output. See
`README.md` "Run the probe".

### What the probe does, in order

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
GET {API_BASE_URL}/rpm-service/v2/users/me/access/groups
Authorization: Bearer <id_token>
x-tenant: <tenant_code>
```

`me` is literal — the RPM spec accepts either a user UUID or the string
`me` for the caller's own access. There is also a deprecated
`GET /v2/users/{userId}/access` that returns a different,
permissions-oriented shape — use `.../access/groups`, not that one.

Response shape (`UserGroupAccessResponseDto`):

```json
{ "groups": [ { "uuid": "...", "displayName": "...", "groupVector": "...", "parentUuid": null, "descendants": [ ... ] } ] }
```

- The nested workspace field is **`descendants`**, not `children` — the
  published OpenAPI schema names it `children` on some generated clients,
  so code generated from the spec reads the wrong key and silently sees a
  flat, one-level tree. Read `descendants`; fall back to `children` only
  defensively (`node.descendants ?? node.children ?? []`).
- Walk the tree recursively and print every workspace with its depth,
  `uuid` and `displayName`, so a builder can see the full tree in one pass.
- `x-tenant` takes **exactly one** tenant code, never the whole `tenants`
  array. For a multi-tenant account, call once per tenant.
- **This endpoint does not appear in the published `/rpm/api-json` spec**
  (verified live) — that spec only documents a separate `/v1/...` surface.
  This contradicts the platform-wide rule to read a service's spec before
  calling it; for this one endpoint, this document is the only source of
  truth. Don't conclude from an incomplete spec that the endpoint doesn't
  exist.

Reference implementation: `lib/services/rpm.mjs` (`listWorkspaces`).

### 3. List canvases

```
GET {API_BASE_URL}/canvas-service/canvases?assigned_to_group=true&size=1000
GET {API_BASE_URL}/canvas-service/canvases?assigned_to_group=false&size=1000
Authorization: Bearer <id_token>
x-tenant: <tenant_code>
```

- `assigned_to_group=true` and `=false` return **disjoint sets** — there is
  no "all" value. Call both and concatenate to get every canvas.
- The live spec wraps the array under `content` (`PageResponseCanvas`,
  standard Spring Page shape) — but a response body may put it under
  `content`, `data`, `canvases`, or `items` depending on the deploy; check
  all four keys in that order and use whichever is present rather than
  assuming one wrapper.
- For each canvas, print (accepting both snake_case and camelCase):
  `id`, `device_id`/`deviceId`, `xmpp_jid`/`xmppJid`, `name`,
  `presence_status`/`presenceStatus`. There is no brightness-level field on
  this endpoint — `current_brightness`/`currentBrightness` does not exist
  on the verified live schema; do not print it.
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
- **Verified live against sandbox: this 404s, on both online and offline
  canvases.** `sync_command` does not appear anywhere in the live
  `canvas-service` OpenAPI spec. The closest match,
  `GET/POST /canvas/v1/players/settings/{deviceId}`, is explicitly
  documented as device-facing — it requires device authentication, not an
  operator `id_token`, and returns 401/403 for a normal API caller. No
  working operator-facing replacement has been found as of this writing.
  Treat this step as broken on this deployment rather than debugging your
  own request — the failure is the documented endpoint, not your call.

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

### 6. Canvas Status and Metrics

Verified live against sandbox (previous revisions of this file had this
wrong in three ways — corrected below):

1. **Canvas Status is its own service, not a sub-path of Canvas Service.**
   `openapi/index.json` lists it separately as `canvas-status`, server
   prefix `/canvas-status`. `/canvas-service/status/fetch_all` 404s; the
   real path is `/canvas-status/status/fetch_all` (and
   `/canvas-status/metrics/fetch_all`).
2. **The request body differs per endpoint, and neither is `{ids: [...]}`:**
   - `/status/fetch_all` wants `{"players": [{"device_id": "...", "device_jid": "..."}]}`
   - `/metrics/fetch_all` wants a bare array of device ID strings: `["dev1", "dev2"]`
3. **`id_token` works, `access_token` does not** — the opposite of what an
   earlier revision of this file speculated. With the corrected path and
   body, `id_token` returns 200; `access_token` returns 401 ("jwt signature
   verification failed: 'vle_user_id' claim is required"). Use `id_token`,
   same as every other service in this document.

```
POST {API_BASE_URL}/canvas-status/status/fetch_all
Authorization: Bearer <id_token>
x-tenant: <tenant_code>
Content-Type: application/json

{ "players": [ { "device_id": "...", "device_jid": "..." } ] }
```

```
POST {API_BASE_URL}/canvas-status/metrics/fetch_all
Authorization: Bearer <id_token>
x-tenant: <tenant_code>
Content-Type: application/json

[ "device_id_1", "device_id_2" ]
```

Reference implementation: `lib/services/canvas-status.mjs`
(`fetchStatus`, `fetchMetrics`).

## Headers, summarized

Applies to both the probe and the client library.

| Header | Value | Notes |
|---|---|---|
| `Authorization` | `Bearer <id_token>` | `access_token` only for Canvas Status/Metrics (Part 1 step 6) |
| `x-tenant` | one tenant code | never the whole `tenants` array |
| `x-group` | workspace UUID | required by CMS/Publisher writes; the probe doesn't use it (it reads everything unscoped), the client library's `client.mjs` accepts it via `options.headers`. Canvas Service takes the workspace as the `group_id` **query parameter** instead of this header — passing `x-group` to Canvas Service silently does nothing. |
| `Content-Type` | `application/json` | on every request with a body |

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VIDERI_API_BASE_URL` | no | `https://api.go.videri.com` | no trailing slash; a key, a token and a tenant all belong to exactly one environment, so change this if you're building against a different one. That environment's docs/`llms.txt` live at a URL derived from this one — see `portalUrlFor` under Config, below |
| `VIDERI_USERNAME` | yes | — | |
| `VIDERI_PASSWORD` | yes | — | |
| `VIDERI_API_KEY` | yes | — | never printed |
| `VIDERI_TENANT` | yes | — | one tenant code; must appear in the decoded `tenants` claim or the probe should fail loudly rather than proceed |
| `VIDERI_GROUP` | no | — | workspace UUID for the `x-group` header (client library only; the probe doesn't scope by workspace). Omit to work across every accessible workspace. |

## Expected console output shape

A port should produce output structured the same way as the Node
reference, even if formatting differs — six numbered sections in this
order: Authenticate, Workspaces, Canvases, Canvas settings (if a canvas ID
was given), the optional write diff (if `--write`), Canvas Status/Metrics
probe. Run the Node reference (`node probe/videri-probe.mjs <canvasId>`)
against the same tenant and environment and diff the two outputs to verify a
port.

## Non-negotiable rules for the probe specifically

(In addition to `videri-context/AGENTS.md`'s platform-wide rules.)

1. Never print `VIDERI_API_KEY`, `VIDERI_PASSWORD`, or a full token value.
2. Refuse `--write` unless the tenant is Videri or Videri Sales.
3. Default to production (`https://api.go.videri.com`) if `VIDERI_API_BASE_URL`
   is unset.
4. Fail loudly (non-zero exit, clear message) on any unexpected response
   shape rather than guessing — this script's job is to surface exactly
   what the platform returns, not to paper over it.

## Part 2: core client library

The library any prompt like "build me a menu board" or "build me a fleet
dashboard" should be built on top of, instead of hand-rolling `fetch` calls.
Node reference: `lib/`. Every adapter goes through `lib/client.mjs`'s
`request()` — never call `fetch` directly in application code built from
this starter.

### Auth module (`lib/auth.mjs`)

Same token exchange as probe step 1, wrapped for reuse:

- `getTokenSet(credentials)` — returns `{idToken, accessToken, expiresAt}`,
  cached per `(apiBaseUrl, username)` pair with a 5-minute margin against
  `expires_in`, re-authenticating rather than using `refresh_token` (no
  reference build in this ecosystem implements the refresh grant).
- **Concurrency**: the cache slot must be read and reserved synchronously,
  before any `await`, or two calls made concurrently (e.g. two adapter
  calls run via `Promise.all`, both needing a token) will each see an empty
  cache and each authenticate — doubling load on the token endpoint for no
  reason. Cache the in-flight *promise*, not just the resolved token, so a
  second concurrent caller awaits the same request instead of starting its
  own.
- `getIdToken(credentials)` / `getAccessToken(credentials)` — convenience
  wrappers returning just the one token type. Use `getAccessToken` only for
  Canvas Status and Metrics (see Part 1, step 6).
- `invalidateToken(credentials)` — drops the cache entry. Call this after
  any 401, since a 401 means the platform rejected a token the cache
  believed was still valid; the next call should re-authenticate rather
  than retry the same rejected token.
- Handle `423` from the token endpoint ("lock contention — user already
  authenticating") with one short retry.

### Request wrapper (`lib/client.mjs`)

One function, `request(credentials, path, options)`, that every adapter
calls instead of raw `fetch`:

- Resolves the token via `getIdToken`/`getAccessToken` based on
  `options.tokenType` (default `'id'`).
- Builds the URL from `credentials.apiBaseUrl` + `path`, appending
  `options.query` as search params.
- Sends `Authorization: Bearer <token>`, `x-tenant: <credentials.tenant>`
  (or `options.tenant` to override for one call), `Content-Type:
  application/json`, plus any `options.headers` (used for `x-group`).
- Applies a request timeout (15s default) via `AbortController`.
- On a non-2xx response, throws a typed error carrying the HTTP status and
  response body — callers should be able to branch on `error.status`
  rather than parsing a message string.
- On a 401 specifically, also calls `invalidateToken` before throwing, so
  the *next* call re-authenticates automatically.

### RPM adapter (`lib/services/rpm.mjs`)

`listWorkspaces(credentials)` — `GET /rpm-service/v2/users/me/access/groups`,
flattened from the returned tree into a depth-annotated array (`{depth,
id, name, parentId}`). See Part 1 step 2 for the endpoint contract, the
`descendants`-not-`children` gotcha, and the note that this endpoint is
missing from the published `/rpm/api-json` spec.

### Canvas Status adapter (`lib/services/canvas-status.mjs`)

`fetchStatus(credentials, players)` / `fetchMetrics(credentials,
deviceIds)` — see Part 1 step 6 for the verified path, body shapes, and
token type. Not in the original CORE-10267 scope; added once a fleet
dashboard built on this starter kit needed live device health instead of
just static canvas listings.

### Canvas Service adapter (`lib/services/canvas.mjs`)

`listCanvases(credentials, {groupId?})` — see Part 1 step 3 for the
disjoint-set merge and response-wrapper handling, which apply identically
here. Scopes by the `group_id` **query parameter**, not the `x-group`
header every other write-capable service in this document uses — this is
the one service where passing `x-group` would silently do nothing.

Verified item fields (live spec, `canvas-service/v3/api-docs`): `id`,
`device_id`, `xmpp_jid`, `name`, `presence_status`, `content_status`,
`group_id`, `group_name`, `tags[]`, `timezone`, `last_online_time`. No
brightness-level field exists on this endpoint.

### CMS adapter (`lib/services/cms.mjs`)

- `createAsset(credentials, groupId, {file, name, orientation?, tagUuids?})`
  — `POST /cms/api/v1/assets`. Both `x-tenant` and `x-group` are required.
  **`file` is NOT inline base64**, despite the live spec's own field
  description implying it accepts one — every base64 payload tested (70
  bytes to ~10KB, PNG and JPEG, including a known-good 1x1 PNG) was
  rejected with `400 "<payload> has unsupported format"`. The real flow is
  two steps: pass `file` as a plain filename-like string (used only to
  derive the extension); the response's `meta.presigned_url` is then where
  you `PUT` the actual bytes, as a separate request to that URL (a
  different host — this is the one place a raw `fetch`, not
  `lib/client.mjs`'s `request()`, is correct, since a presigned S3 URL
  takes no Videri auth headers).
- `createPlaylist(credentials, groupId, {name, tagUuids?, projectUuid?})`
  — `POST /cms/api/v1/playlists`, returns `{uuid, ...}`.
- `updatePlaylistAssets(credentials, playlistId, assets)` — `PATCH
  /cms/api/v1/playlists/{playlistId}/assetlist` (the path parameter is
  literally `playlistId`, despite the endpoint being described
  colloquially as `{uuid}/assetlist`). Each entry in `assets`:
  `{asset_type: "asset"|"playlist"|"layout", childUuid, duration,
  itemsPerPass?}` — **`duration` is milliseconds**, confirmed by the live
  spec's own field description. This is a different unit from an asset's
  own top-level `duration` field (seconds) — don't conflate the two.
- `listAssets(credentials, {page?, limit?, groupId?})` /
  `listPlaylists(...)` — target the **v1** list endpoints, which wrap
  results as `{data: [...], meta: {totalItems, currentPage, totalPages}}`.
  The **v2** equivalents (`/api/v2/assets/pagination` etc.) use a
  different, flatter `{total, page, limit}` shape with no `data`/`meta`
  wrapper — don't mix v1 and v2 pagination assumptions in the same client.
- `listProjects(credentials, {page?, limit?, groupId?, search?})` — `GET
  /cms/api/v1/projects`, same v1 `{data, meta}` shape as assets/playlists.
  Each item carries `assetCount`/`playlistCount` already aggregated by the
  API — no client-side counting needed for project-level metrics.
- `getProject(credentials, uuid)` / `getAsset(credentials, uuid)` /
  `getPlaylist(credentials, playlistId)` — single-item fetches, for
  drill-down views. **`getPlaylist`'s `group` field is shaped differently
  than `listPlaylists`' item shape**: the list endpoint returns a plain
  string (`"Hamza Workspaces"`), the single-item endpoint returns
  `{uuid, displayName}`. Not documented anywhere else; check the type
  before rendering. Assets and projects don't have this inconsistency.

### Publisher adapter (`lib/services/publisher.mjs`)

- `createEvents(credentials, groupId, events)` — `POST
  /publisher/api/v1/events/batch`, body `{events: [...]}`. Prefer this over
  the single-event `POST /publisher/api/v1/events` (which exists, and has
  the identical request shape) even for one event — some reference builds
  saw the single-event endpoint return 403 where batch succeeded with
  identical credentials.
- Each event object: `canvasesIds[]` **or** `wallId`/`wallsIds` **or**
  `eventGroupUuids[]` (mutually exclusive, per the spec's own error-message
  text — `eventGroupUuids` is real and documented in the spec's examples
  and prose but missing from its formal JSON Schema, a genuine spec gap;
  include it anyway), plus `assets[]`/`playlists[]`/`layouts[]` (each
  needs `durationMs` and `itemOrder`), `startTime` (required, ISO 8601),
  `endTime`, `isUtc` (there is no separate `timezone` field), `frequency`
  (`{type, weekdays[], daysOfMonth[], hourParts[]}`), `priority`, `isSlot`
  (required).
- `getCanvasEvents(credentials, canvasId, {beginDate, endDate})` — `GET
  /publisher/api/v1/canvases/{canvasId}/events`. **`beginDate` and
  `endDate` are required query parameters** — this is not a bare "every
  event" call.
- Response can be a bare array or nested under `events`/`data` — unwrap
  defensively, same principle as Canvas Service's `content`/`data`/etc.

### Config (`lib/config.mjs`)

- `loadConfig(env?)` — reads `VIDERI_API_BASE_URL` (defaults to
  production), `VIDERI_USERNAME`, `VIDERI_PASSWORD`, `VIDERI_API_KEY`,
  `VIDERI_TENANT` (all required), `VIDERI_GROUP` (optional). Throws naming
  every missing variable, so a misconfigured environment fails at startup
  with a clear message rather than as a confusing 401 deep in a request.
  The returned config also carries `portalUrl`, derived from
  `apiBaseUrl` — see below.
- `isLiveConfigured(env?)` — `true` when every required variable is
  present. Every reference build in this ecosystem independently
  reinvented some version of this "do we have real credentials" gate; use
  this one instead of writing another.
- `portalUrlFor(apiBaseUrl)` — derives the developer portal URL (where
  that environment's `/llms.txt`, `/openapi/index.json` and knowledge base
  live) from an API base URL. A key, a token and a tenant all belong to
  exactly one environment, and so does its documentation — every stack
  follows `api.<stack>` → `developer.<stack>`, e.g.
  `api.sandbox.videri.com` → `developer.sandbox.videri.com`, with one
  exception: production's portal doesn't carry the stack's own label
  (`api.go.videri.com` → `developer.videri.com`, not
  `developer.go.videri.com`, which has no DNS record). A port should
  implement this same derivation rather than hardcoding one portal host —
  if you're an agent following a prompt that named one `VIDERI_API_BASE_URL`,
  don't assume its docs live at `developer.videri.com` unless that base URL
  is production's.

### What's not in the client library yet

Not implemented, out of scope for CORE-10267/this revision: wall/layout
resolution (only needed for multi-screen recipes), delivery-evidence and
proof-of-play polling, a persistent or distributed token cache (the
in-memory cache is sufficient for a script or short-lived process; a
long-running server's caching strategy is that app's own concern), and a
working operator-facing replacement for canvas settings (Part 1 step 4 —
the documented endpoint 404s and no alternative has been found). The
menu-board recipe (CORE-10268, `videri-recipes`) is expected to need at
least wall/layout resolution and delivery evidence — build those there,
informed by what the recipe actually needs, rather than speculatively
here.
