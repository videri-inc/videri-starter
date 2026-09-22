import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { fetchStatus, fetchMetrics } from '../services/canvas-status.mjs'

let originalFetch
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

function credentials(overrides = {}) {
  return { apiBaseUrl: 'https://fake.example.com', username: `status-${Math.random()}`, password: 'p', apiKey: 'k', tenant: 't', ...overrides }
}

function stubToken() {
  return new Response(JSON.stringify({ id_token: 'id', access_token: 'acc', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('fetchStatus posts to /canvas-status/status/fetch_all (its own service path, not canvas-service) with {players}', async () => {
  let seenUrl, seenBody
  globalThis.fetch = async (url, options) => {
    const u = url.toString()
    if (u.includes('auth/token')) return stubToken()
    seenUrl = u
    seenBody = JSON.parse(options.body)
    return new Response(JSON.stringify([{ device_id: 'd1', presence: 'online' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const result = await fetchStatus(credentials(), [{ deviceId: 'd1', deviceJid: 'd1@jid' }])
  assert.ok(seenUrl.includes('/canvas-status/status/fetch_all'))
  assert.deepEqual(seenBody, { players: [{ device_id: 'd1', device_jid: 'd1@jid' }] })
  assert.equal(result[0].presence, 'online')
})

test('fetchStatus defaults to id_token, not access_token (verified live: access_token 401s on this endpoint)', async () => {
  let seenAuth
  globalThis.fetch = async (url, options) => {
    if (url.toString().includes('auth/token')) return stubToken()
    seenAuth = options.headers.Authorization
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await fetchStatus(credentials(), [])
  assert.equal(seenAuth, 'Bearer id')
})

test('fetchMetrics posts a bare array of device IDs to /canvas-status/metrics/fetch_all', async () => {
  let seenUrl, seenBody
  globalThis.fetch = async (url, options) => {
    const u = url.toString()
    if (u.includes('auth/token')) return stubToken()
    seenUrl = u
    seenBody = JSON.parse(options.body)
    return new Response(JSON.stringify([{ device_id: 'd1' }]), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await fetchMetrics(credentials(), ['d1', 'd2'])
  assert.ok(seenUrl.includes('/canvas-status/metrics/fetch_all'))
  assert.deepEqual(seenBody, ['d1', 'd2'])
})
