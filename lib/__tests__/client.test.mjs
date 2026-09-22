import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { request, VideriApiError } from '../client.mjs'

let originalFetch
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

function credentials(overrides = {}) {
  return { apiBaseUrl: 'https://fake.example.com', username: 'u', password: 'p', apiKey: 'k', tenant: 't', ...overrides }
}

function stubToken() {
  return new Response(JSON.stringify({ id_token: 'id', access_token: 'acc', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('sends Authorization, x-tenant and Content-Type headers', async () => {
  let seenHeaders
  globalThis.fetch = async (url, opts) => {
    if (url.toString().includes('auth/token')) return stubToken()
    seenHeaders = opts.headers
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const creds = credentials({ username: `headers-${Math.random()}` })
  await request(creds, '/some/path')
  assert.equal(seenHeaders.Authorization, 'Bearer id')
  assert.equal(seenHeaders['x-tenant'], 't')
  assert.equal(seenHeaders['Content-Type'], 'application/json')
})

test('uses the access token when tokenType is "access"', async () => {
  let seenAuth
  globalThis.fetch = async (url, opts) => {
    if (url.toString().includes('auth/token')) return stubToken()
    seenAuth = opts.headers.Authorization
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const creds = credentials({ username: `access-${Math.random()}` })
  await request(creds, '/status/fetch_all', { tokenType: 'access' })
  assert.equal(seenAuth, 'Bearer acc')
})

test('throws VideriApiError with the status on a non-2xx response', async () => {
  globalThis.fetch = async (url) => {
    if (url.toString().includes('auth/token')) return stubToken()
    return new Response('nope', { status: 403 })
  }
  const creds = credentials({ username: `403-${Math.random()}` })
  await assert.rejects(
    () => request(creds, '/some/path'),
    (err) => err instanceof VideriApiError && err.status === 403,
  )
})

test('query params are appended to the URL', async () => {
  let seenUrl
  globalThis.fetch = async (url) => {
    if (url.toString().includes('auth/token')) return stubToken()
    seenUrl = url.toString()
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const creds = credentials({ username: `query-${Math.random()}` })
  await request(creds, '/canvas-service/canvases', { query: { assigned_to_group: 'true', size: '1000' } })
  assert.match(seenUrl, /assigned_to_group=true/)
  assert.match(seenUrl, /size=1000/)
})
