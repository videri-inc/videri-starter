import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createEvents, getCanvasEvents } from '../services/publisher.mjs'

let originalFetch
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

function credentials(overrides = {}) {
  return { apiBaseUrl: 'https://fake.example.com', username: `pub-${Math.random()}`, password: 'p', apiKey: 'k', tenant: 't', ...overrides }
}

function stubToken() {
  return new Response(JSON.stringify({ id_token: 'id', access_token: 'acc', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('createEvents POSTs to the batch endpoint wrapping events, sends x-group', async () => {
  let seenUrl, seenHeaders, seenBody
  globalThis.fetch = async (url, opts) => {
    if (url.toString().includes('auth/token')) return stubToken()
    seenUrl = url.toString()
    seenHeaders = opts.headers
    seenBody = JSON.parse(opts.body)
    return new Response(JSON.stringify([{ uuid: 'e1' }]), { status: 201, headers: { 'content-type': 'application/json' } })
  }
  const events = [{ canvasesIds: [5], startTime: '2026-01-01T00:00:00Z', isSlot: false }]
  const result = await createEvents(credentials(), 'group-1', events)
  assert.match(seenUrl, /\/publisher\/api\/v1\/events\/batch$/)
  assert.equal(seenHeaders['x-group'], 'group-1')
  assert.deepEqual(seenBody.events, events)
  assert.equal(result.length, 1)
})

test('getCanvasEvents requires beginDate and endDate as query params', async () => {
  let seenUrl
  globalThis.fetch = async (url) => {
    if (url.toString().includes('auth/token')) return stubToken()
    seenUrl = url.toString()
    return new Response(JSON.stringify([{ uuid: 'e1', canvasId: 5 }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const events = await getCanvasEvents(credentials(), 5, { beginDate: '2026-01-01', endDate: '2026-01-31' })
  assert.match(seenUrl, /\/publisher\/api\/v1\/canvases\/5\/events\?/)
  const params = new URL(seenUrl).searchParams
  assert.equal(params.get('beginDate'), '2026-01-01')
  assert.equal(params.get('endDate'), '2026-01-31')
  assert.equal(events[0].canvasId, 5)
})

test('unwraps a response nested under events or data if not a bare array', async () => {
  globalThis.fetch = async (url) => {
    if (url.toString().includes('auth/token')) return stubToken()
    return new Response(JSON.stringify({ events: [{ uuid: 'e1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const events = await getCanvasEvents(credentials(), 5, { beginDate: '2026-01-01', endDate: '2026-01-31' })
  assert.equal(events.length, 1)
})
