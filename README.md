# videri-starter

The canonical starter kit for building on the Videri REST API. Every new build
starts here instead of from an empty folder.

**Status: internal preview, no code yet.** The kit is a strip-down of the
strongest existing internal build, nominated in harvest session 1
(CORE-10259); the stack is decided there so that this is a strip-down rather
than a port. Code lands under CORE-10267.

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
