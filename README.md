# videri-starter

The canonical starter kit for building on the Videri REST API. Every new build
starts here instead of from an empty folder.

**Status: internal preview.** `probe/videri-probe.mjs` (CORE-10294) and the
core client library in `lib/` (CORE-10267) are both here — auth, a typed
request wrapper, Canvas Service/CMS/Publisher adapters, config, and one
live render example. The menu-board recipe built on top of this lives in
[videri-recipes](https://github.com/videri-inc/videri-recipes), not here.

## Get set up

```sh
cp .env.example .env   # fill in your credentials, see AUTH.md in videri-context
```

`VIDERI_API_BASE_URL` selects the environment (defaults to production) —
change it to whichever one your key, token and tenant belong to.

## Run the probe

Run this first, before writing any application code. The probe
authenticates, lists your tenants and workspaces, lists canvases, and dumps
one device's settings — it settles more in ten minutes than reading
documentation does.

```sh
node --env-file=.env probe/videri-probe.mjs <canvasId>
```

Add `--write` to also flip that canvas's brightness and confirm the change
took effect. Refused unless your tenant is Videri or Videri Sales.

## Build something

The core client library is in `lib/` — plain JavaScript, zero npm
dependencies, JSDoc types. Every adapter goes through `lib/client.mjs`'s
shared request function, so writing new application code means calling an
existing adapter or adding a new one in `lib/services/`, never a raw
`fetch` call with hand-built headers.

```sh
node --env-file=.env examples/list-canvases.mjs
```

That's the "one live render" — authenticate, list every canvas, print
online/offline status. It's also the shortest path to confirming the whole
chain works before building anything bigger. From there:

```js
import { loadConfig } from './lib/config.mjs'
import { listCanvases } from './lib/services/canvas.mjs'
import { createAsset, createPlaylist, updatePlaylistAssets } from './lib/services/cms.mjs'
import { createEvents } from './lib/services/publisher.mjs'

const config = loadConfig()
```

See [AGENTS.md](AGENTS.md) "Part 2: core client library" for every
adapter's exact request/response contract.

**Not using Node?** Everything here ships in Node because that's what the
reference builds in this ecosystem use, but the protocol is language-neutral.
Read [AGENTS.md](AGENTS.md) for the full spec — request shapes, headers,
decode steps, expected output — and ask your coding agent to port it to
whatever language you're already using. `AGENTS.md` is the contract; the
`.mjs` files are working examples to verify a port against (run both
against the same tenant and environment and diff the output).

## Rules

- Every API call goes through `lib/client.mjs`'s `request()`. No ad-hoc
  `fetch` calls with hand-built headers.
- No customer names, tenant codes, device serials or asset URLs in the repo.
- Read `AGENTS.md` in `videri-context` before building on top of this.

## Related

- Context pack: https://github.com/videri-inc/videri-context
- Recipes: https://github.com/videri-inc/videri-recipes
