# videri-starter

The canonical starter kit for building on the Videri REST API. Every new build
starts here instead of from an empty folder.

**Status: internal preview.** `probe/videri-probe.mjs` (CORE-10294) is the
first thing to land — a one-file, dependency-free discovery script, meant to
run before any framework code. The rest of the kit (auth module, API client,
config, one live render) is CORE-10267, not yet started.

## Run the probe

The probe authenticates, lists your tenants and workspaces, lists canvases,
and dumps one device's settings. It settles more in ten minutes than reading
documentation does — run it first, before anything else in this repo.

```sh
cp .env.example .env   # fill in your credentials, see AUTH.md in videri-context
node --env-file=.env probe/videri-probe.mjs <canvasId>
```

Add `--write` to also flip that canvas's brightness and confirm the change
took effect. Refused unless your tenant is Videri or Videri Sales.

**Not using Node?** The probe ships in Node because that's what the
reference builds in this ecosystem use, but the protocol it implements is
language-neutral. Read [AGENTS.md](AGENTS.md) for the full spec — request
shapes, headers, decode steps, expected output — and ask your coding agent
to port it to whatever language you're already using. `AGENTS.md` is the
contract; `probe/videri-probe.mjs` is a working example to verify a port
against (run both against the same sandbox tenant and diff the output).

## What the kit will contain

- **Auth**: API key + username + password to token (`POST
  /rpm-service/v2/auth/token`), token caching, refresh before the one-hour
  expiry, refresh token kept server-side.
- **API client**: base URL from config; `Authorization`, `x-tenant` and
  optional `x-group` on every call; one pagination adapter per service behind a
  common interface (Canvas Service `content` / `totalElements`, CMS `data` /
  `meta.totalItems`, V2 assets page + limit); tolerant field access for
  snake_case and camelCase.
- **Config**: environment variables only (`VIDERI_API_BASE_URL`,
  `VIDERI_TENANT`, optional `VIDERI_GROUP`, credentials), an `.env.example`,
  no secrets committed.
- **Errors and logging**: status code surfaced with a short body; one place
  handles `401` (refresh) and `403` (tenant or permission).
- **One live render**: a canvas list with online / offline status, the same
  call the developer portal's authentication article uses.
- **README**: how to run in under ten minutes, the agent prompt from the
  portal's Start here page, and what to change first.

## How to use it (once it exists)

1. Get access and an API key: see `AUTH.md` in
   https://github.com/videri-inc/videri-context.
2. Clone, copy `.env.example` to `.env`, fill it in, run one command.
3. Point your coding agent at
   `https://developer.sandbox.videri.com/llms.txt` and this repository.

## Rules

- Every API call goes through the client. No ad-hoc requests with hand-built
  headers.
- No customer names, tenant codes, device serials or asset URLs in the repo.
- Read `AGENTS.md` in `videri-context` before building on top of this.

## Related

- Context pack: https://github.com/videri-inc/videri-context
- Recipes: https://github.com/videri-inc/videri-recipes
- Developer portal (sandbox): https://developer.sandbox.videri.com/start
