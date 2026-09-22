import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { listCanvases } from '../services/canvas.mjs'

let originalFetch
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

function credentials(overrides = {}) {
  return { apiBaseUrl: 'https://fake.example.com', username: `canvas-${Math.random()}`, password: 'p', apiKey: 'k', tenant: 't', ...overrides }
}

function stubToken() {
  return new Response(JSON.stringify({ id_token: 'id', access_token: 'acc', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('merges assigned_to_group=true and =false into one list, authenticating once', async () => {
  let tokenCalls = 0
  globalThis.fetch = async (url) => {
    const u = url.toString()
    if (u.includes('auth/token')) {
      tokenCalls++
      return stubToken()
    }
    const assignedToGroup = new URL(u).searchParams.get('assigned_to_group')
    const body = assignedToGroup === 'true'
      ? { content: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] }
      : { content: [{ id: 3, name: 'C' }] }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const canvases = await listCanvases(credentials())
  assert.equal(canvases.length, 3)
  assert.deepEqual(canvases.map((c) => c.id).sort(), [1, 2, 3])
  assert.equal(tokenCalls, 1)
})

test('extracts items from content, data, canvases or items, in that order', async () => {
  const shapes = [
    { content: [{ id: 1 }] },
    { data: [{ id: 1 }] },
    { canvases: [{ id: 1 }] },
    { items: [{ id: 1 }] },
  ]
  for (const shape of shapes) {
    globalThis.fetch = async (url) => {
      if (url.toString().includes('auth/token')) return stubToken()
      return new Response(JSON.stringify(shape), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const canvases = await listCanvases(credentials())
    // two pages (true/false), each returning one item under the given key -> 2 total
    assert.equal(canvases.length, 2, `failed for shape ${JSON.stringify(shape)}`)
  }
})

test('passes groupId as a query parameter, not a header', async () => {
  const seenQueries = []
  globalThis.fetch = async (url) => {
    const u = url.toString()
    if (u.includes('auth/token')) return stubToken()
    seenQueries.push(new URL(u).searchParams.get('group_id'))
    return new Response(JSON.stringify({ content: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await listCanvases(credentials(), { groupId: 42 })
  assert.deepEqual(seenQueries, ['42', '42'])
})
