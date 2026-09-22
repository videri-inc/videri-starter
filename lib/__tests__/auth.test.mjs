import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getTokenSet } from '../auth.mjs'

let originalFetch
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

function credentials(overrides = {}) {
  return { apiBaseUrl: 'https://fake.example.com', username: 'u', password: 'p', apiKey: 'k', ...overrides }
}

test('authenticates exactly once for two concurrent getTokenSet calls', async () => {
  let tokenCalls = 0
  globalThis.fetch = async () => {
    tokenCalls++
    return new Response(JSON.stringify({ id_token: 'id', access_token: 'acc', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const creds = credentials({ username: `race-${Math.random()}` }) // unique key so other tests' cache entries don't interfere
  const [a, b] = await Promise.all([getTokenSet(creds), getTokenSet(creds)])
  assert.equal(tokenCalls, 1)
  assert.equal(a.idToken, b.idToken)
})

test('reuses a cached, unexpired token on a second call', async () => {
  let tokenCalls = 0
  globalThis.fetch = async () => {
    tokenCalls++
    return new Response(JSON.stringify({ id_token: 'id', access_token: 'acc', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const creds = credentials({ username: `reuse-${Math.random()}` })
  await getTokenSet(creds)
  await getTokenSet(creds)
  assert.equal(tokenCalls, 1)
})

test('retries once on 423 lock contention', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    if (calls === 1) return new Response('locked', { status: 423 })
    return new Response(JSON.stringify({ id_token: 'id', access_token: 'acc', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const creds = credentials({ username: `lock-${Math.random()}` })
  const result = await getTokenSet(creds)
  assert.equal(calls, 2)
  assert.equal(result.idToken, 'id')
})
