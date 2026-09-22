import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createPlaylist, updatePlaylistAssets, listAssets } from '../services/cms.mjs'

let originalFetch
beforeEach(() => {
  originalFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

function credentials(overrides = {}) {
  return { apiBaseUrl: 'https://fake.example.com', username: `cms-${Math.random()}`, password: 'p', apiKey: 'k', tenant: 't', ...overrides }
}

function stubToken() {
  return new Response(JSON.stringify({ id_token: 'id', access_token: 'acc', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('createPlaylist sends x-group and returns the created playlist', async () => {
  let seenHeaders, seenBody
  globalThis.fetch = async (url, opts) => {
    if (url.toString().includes('auth/token')) return stubToken()
    seenHeaders = opts.headers
    seenBody = JSON.parse(opts.body)
    return new Response(JSON.stringify({ uuid: 'p1', name: 'My playlist' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }
  const result = await createPlaylist(credentials(), 'group-1', { name: 'My playlist' })
  assert.equal(result.uuid, 'p1')
  assert.equal(seenHeaders['x-group'], 'group-1')
  assert.equal(seenBody.name, 'My playlist')
})

test('updatePlaylistAssets PATCHes {uuid}/assetlist with the assets array', async () => {
  let seenUrl, seenMethod, seenBody
  globalThis.fetch = async (url, opts) => {
    if (url.toString().includes('auth/token')) return stubToken()
    seenUrl = url.toString()
    seenMethod = opts.method
    seenBody = JSON.parse(opts.body)
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await updatePlaylistAssets(credentials(), 'playlist-uuid-1', [
    { asset_type: 'asset', childUuid: 'asset-1', duration: 5000 },
  ])
  assert.match(seenUrl, /\/cms\/api\/v1\/playlists\/playlist-uuid-1\/assetlist$/)
  assert.equal(seenMethod, 'PATCH')
  assert.equal(seenBody.assets[0].duration, 5000)
})

test('listAssets extracts data/meta.totalItems (v1 shape)', async () => {
  globalThis.fetch = async (url) => {
    if (url.toString().includes('auth/token')) return stubToken()
    return new Response(JSON.stringify({
      data: [{ uuid: 'a1' }, { uuid: 'a2' }],
      meta: { totalItems: 26, currentPage: 1, totalPages: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const result = await listAssets(credentials())
  assert.equal(result.items.length, 2)
  assert.equal(result.totalItems, 26)
  assert.equal(result.totalPages, 2)
})
