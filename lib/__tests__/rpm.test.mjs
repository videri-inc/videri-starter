import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { listWorkspaces } from '../services/rpm.mjs'

let originalFetch
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

function credentials(overrides = {}) {
  return { apiBaseUrl: 'https://fake.example.com', username: `rpm-${Math.random()}`, password: 'p', apiKey: 'k', tenant: 't', ...overrides }
}

function stubToken() {
  return new Response(JSON.stringify({ id_token: 'id', access_token: 'acc', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('flattens the workspace tree from descendants, with depth and parentId', async () => {
  globalThis.fetch = async (url) => {
    const u = url.toString()
    if (u.includes('auth/token')) return stubToken()
    assert.ok(u.includes('/rpm-service/v2/users/me/access/groups'))
    const body = {
      groups: [
        {
          uuid: 'root',
          displayName: 'ROOT',
          descendants: [
            { uuid: 'child-1', displayName: 'Child 1', descendants: [] },
            { uuid: 'child-2', displayName: 'Child 2', descendants: [{ uuid: 'grandchild', displayName: 'Grandchild', descendants: [] }] },
          ],
        },
      ],
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const workspaces = await listWorkspaces(credentials())
  assert.deepEqual(workspaces.map((w) => [w.id, w.depth, w.parentId]), [
    ['root', 0, null],
    ['child-1', 1, 'root'],
    ['child-2', 1, 'root'],
    ['grandchild', 2, 'child-2'],
  ])
})

test('falls back to children if descendants is absent', async () => {
  globalThis.fetch = async (url) => {
    if (url.toString().includes('auth/token')) return stubToken()
    const body = { groups: [{ uuid: 'root', displayName: 'ROOT', children: [{ uuid: 'kid', displayName: 'Kid' }] }] }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const workspaces = await listWorkspaces(credentials())
  assert.deepEqual(workspaces.map((w) => w.id), ['root', 'kid'])
})
