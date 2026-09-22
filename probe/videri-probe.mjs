#!/usr/bin/env node
/**
 * videri-probe (CORE-10294): a single file, zero-dependency script that
 * authenticates against the Videri API, discovers tenants and workspaces,
 * lists canvases, dumps one device's settings, and optionally sends one
 * write command.
 *
 * Run before any framework code. It compresses the discovery every new
 * builder repeats by hand into a ten-minute, end-to-end check, and it
 * settles the id_token vs access_token question for Canvas Status and
 * Metrics live rather than by reading conflicting notes.
 *
 * This file is the Node reference implementation of the protocol documented
 * in ../AGENTS.md. If you are working in another language, point your coding
 * agent at AGENTS.md's probe spec and this file, and ask it to port it — the
 * spec is the contract, this file is a working example to verify against.
 *
 * Usage:
 *   VIDERI_USERNAME=... VIDERI_PASSWORD=... VIDERI_API_KEY=... VIDERI_TENANT=... \
 *     node probe/videri-probe.mjs <canvasId>
 *
 *   Add --write to also flip one device's brightness and diff the result.
 *   Refuses --write unless VIDERI_TENANT is Videri or Videri Sales (the two
 *   internal builder tenants) - see AUTH.md "Getting access".
 *
 * Env vars (see .env.example):
 *   VIDERI_API_BASE_URL  default https://api.go.videri.com
 *   VIDERI_USERNAME      required
 *   VIDERI_PASSWORD      required
 *   VIDERI_API_KEY       required, never printed
 *   VIDERI_TENANT        required, one tenant code (not the array from the token)
 */

const INTERNAL_BUILDER_TENANTS = new Set(['VIDERI', 'VIDERISALES'])

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

function redact(value) {
  return value ? `${value.slice(0, 4)}...(${value.length} chars)` : '(none)'
}

/** Decodes a JWT's payload without verifying the signature - this script never trusts the token, only reads it back for its own console output. */
function decodeJwtPayload(token) {
  const [, payload] = token.split('.')
  const json = Buffer.from(payload, 'base64url').toString('utf8')
  return JSON.parse(json)
}

/**
 * The `tenants` claim is a JSON string inside the JWT, not a JSON array -
 * decode the payload, then JSON.parse the `tenants` value a second time.
 * (videri-context/GOTCHAS.md: "The `tenants` claim is a JSON string inside the JWT")
 */
function decodeTenantsClaim(idToken) {
  const payload = decodeJwtPayload(idToken)
  if (typeof payload.tenants !== 'string') {
    throw new Error(`Expected the tenants claim to be a JSON-encoded string, got ${typeof payload.tenants}`)
  }
  return JSON.parse(payload.tenants)
}

async function authenticate(baseUrl, username, password, apiKey) {
  const res = await fetch(`${baseUrl}/rpm-service/v2/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, api_key: apiKey }),
  })
  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

function authHeaders(tenant, token) {
  return {
    Authorization: `Bearer ${token}`,
    'x-tenant': tenant,
    'Content-Type': 'application/json',
  }
}

/** Walks the workspace tree under `descendants` (not `children` - the published schema names it wrong; see GOTCHAS.md). */
function flattenWorkspaces(nodes, depth = 0, out = []) {
  for (const node of nodes ?? []) {
    out.push({ depth, id: node.id ?? node.groupId, name: node.name ?? node.groupName })
    flattenWorkspaces(node.descendants ?? node.children ?? [], depth + 1, out)
  }
  return out
}

async function listWorkspaces(baseUrl, tenant, idToken) {
  const res = await fetch(`${baseUrl}/rpm/v1/users/me/groups_access`, {
    headers: authHeaders(tenant, idToken),
  })
  if (!res.ok) {
    throw new Error(`Workspace listing failed: ${res.status} ${await res.text()}`)
  }
  const body = await res.json()
  return flattenWorkspaces(body.groupAccess ?? [])
}

/** assigned_to_group=true and =false are disjoint sets with no "all" value - call both and merge. */
async function listCanvases(baseUrl, tenant, idToken) {
  const fetchPage = async (assignedToGroup) => {
    const qs = new URLSearchParams({ assigned_to_group: String(assignedToGroup), size: '1000' })
    const res = await fetch(`${baseUrl}/canvas-service/canvases?${qs}`, {
      headers: authHeaders(tenant, idToken),
    })
    if (!res.ok) {
      throw new Error(`Canvas listing failed (assigned_to_group=${assignedToGroup}): ${res.status} ${await res.text()}`)
    }
    const body = await res.json()
    return body.content ?? body.data ?? body.canvases ?? body.items ?? []
  }
  const [assigned, unassigned] = await Promise.all([fetchPage(true), fetchPage(false)])
  return [...assigned, ...unassigned]
}

async function getCanvasSettings(baseUrl, tenant, idToken, canvasId) {
  const res = await fetch(`${baseUrl}/canvas-service/canvases/${canvasId}/sync_command`, {
    method: 'POST',
    headers: authHeaders(tenant, idToken),
    body: JSON.stringify({ command: 'ops_get_settings' }),
  })
  if (!res.ok) {
    throw new Error(`ops_get_settings failed: ${res.status} ${await res.text()}`)
  }
  const settings = await res.json()
  const { available_timezones, ...rest } = settings
  return rest
}

async function sendBrightnessCommand(baseUrl, tenant, idToken, canvasId, brightness255) {
  const res = await fetch(`${baseUrl}/canvas-service/canvases/${canvasId}/sync_command`, {
    method: 'POST',
    headers: authHeaders(tenant, idToken),
    body: JSON.stringify({ command: `demo_command set_brightness:=${brightness255}` }),
  })
  if (!res.ok) {
    throw new Error(`set_brightness failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

/**
 * Canvas Status and Metrics are the one documented exception to "id_token
 * everywhere": one build reports they need access_token instead. Probe both
 * token types against both endpoints and print which succeeds, so this
 * question is settled live rather than trusted from a single report.
 */
async function probeStatusAndMetrics(baseUrl, tenant, idToken, accessToken, canvasIds) {
  const endpoints = [
    { name: 'Canvas Status /status/fetch_all', path: '/canvas-service/status/fetch_all' },
    { name: 'Metrics /metrics/fetch_all', path: '/canvas-service/metrics/fetch_all' },
  ]
  const results = []
  for (const endpoint of endpoints) {
    for (const [tokenName, token] of [['id_token', idToken], ['access_token', accessToken]]) {
      const res = await fetch(`${baseUrl}${endpoint.path}`, {
        method: 'POST',
        headers: authHeaders(tenant, token),
        body: JSON.stringify({ ids: canvasIds.slice(0, 5) }),
      })
      results.push({ endpoint: endpoint.name, token: tokenName, status: res.status, ok: res.ok })
    }
  }
  return results
}

async function main() {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const canvasId = args.find((arg) => !arg.startsWith('--'))

  const baseUrl = (process.env.VIDERI_API_BASE_URL ?? 'https://api.go.videri.com').replace(/\/+$/, '')
  const username = requireEnv('VIDERI_USERNAME')
  const password = requireEnv('VIDERI_PASSWORD')
  const apiKey = requireEnv('VIDERI_API_KEY')
  const tenant = requireEnv('VIDERI_TENANT')

  console.log(`\n== 1. Authenticate (${baseUrl}) ==`)
  const tokenResponse = await authenticate(baseUrl, username, password, apiKey)
  console.log('id_token:     ', redact(tokenResponse.id_token))
  console.log('access_token: ', redact(tokenResponse.access_token))
  console.log('expires_in:   ', tokenResponse.expires_in, 'seconds')
  const tenants = decodeTenantsClaim(tokenResponse.id_token)
  console.log('tenants claim:', tenants)
  if (!tenants.includes(tenant)) {
    console.error(`VIDERI_TENANT=${tenant} is not in this account's tenants claim: ${JSON.stringify(tenants)}`)
    process.exit(1)
  }

  console.log(`\n== 2. Workspaces for tenant ${tenant} ==`)
  const workspaces = await listWorkspaces(baseUrl, tenant, tokenResponse.id_token)
  for (const ws of workspaces) {
    console.log(`${'  '.repeat(ws.depth)}- ${ws.name} (${ws.id})`)
  }

  console.log(`\n== 3. Canvases ==`)
  const canvases = await listCanvases(baseUrl, tenant, tokenResponse.id_token)
  for (const canvas of canvases) {
    const id = canvas.id
    const deviceId = canvas.device_id ?? canvas.deviceId
    const xmppJid = canvas.xmpp_jid ?? canvas.xmppJid
    const name = canvas.name
    const brightness = canvas.current_brightness ?? canvas.currentBrightness
    console.log(`- id=${id} device_id=${deviceId} xmpp_jid=${xmppJid} name=${JSON.stringify(name)} current_brightness=${brightness}`)
  }
  console.log(`${canvases.length} canvases total`)

  if (canvasId) {
    console.log(`\n== 4. Settings for canvas ${canvasId} ==`)
    const settings = await getCanvasSettings(baseUrl, tenant, tokenResponse.id_token, canvasId)
    console.log(JSON.stringify(settings, null, 2))

    if (write) {
      console.log(`\n== 5. --write: flip brightness on canvas ${canvasId} ==`)
      if (!INTERNAL_BUILDER_TENANTS.has(tenant.toUpperCase())) {
        console.error(`Refusing --write: VIDERI_TENANT=${tenant} is not an internal builder tenant (Videri or Videri Sales).`)
        process.exit(1)
      }
      const before = settings.brightness ?? settings.current_brightness
      const target = before >= 128 ? 64 : 200
      console.log(`Current brightness: ${before}. Setting to ${target}...`)
      await sendBrightnessCommand(baseUrl, tenant, tokenResponse.id_token, canvasId, target)
      const after = await getCanvasSettings(baseUrl, tenant, tokenResponse.id_token, canvasId)
      console.log(`brightness before=${before} after=${after.brightness ?? after.current_brightness}`)
    }
  } else {
    console.log('\n(pass a canvas ID as the first argument to probe its settings, e.g. `node probe/videri-probe.mjs 12345`)')
  }

  console.log('\n== 6. Canvas Status / Metrics: id_token vs access_token ==')
  const canvasIds = canvases.map((c) => c.id).filter(Boolean)
  const statusResults = await probeStatusAndMetrics(baseUrl, tenant, tokenResponse.id_token, tokenResponse.access_token, canvasIds)
  for (const result of statusResults) {
    console.log(`${result.endpoint} + ${result.token}: ${result.status} ${result.ok ? 'OK' : 'FAIL'}`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
