/**
 * CMS adapter (CORE-10267): asset upload records, playlists, and the
 * assetlist that orders a playlist's contents. Verified against the live
 * spec at api.go.videri.com/cms/api-json - see AGENTS.md "CMS" for the full
 * contract.
 *
 * Targets the v1 list endpoints (data/meta.totalItems). The v2 equivalents
 * use a different, flatter {total, page, limit} shape with no data/meta
 * wrapper - don't mix the two.
 */

import { request } from '../client.mjs'

/**
 * @typedef {object} CreateAssetInput
 * @property {string} file - base64-encoded content, or an S3 object key
 * @property {string} name - minimum 2 characters
 * @property {string} [orientation] - "landscape" | "portrait" | "square"
 * @property {string[]} [tagUuids]
 */

/**
 * @typedef {object} Asset
 * @property {string} uuid
 * @property {string} name
 * @property {'image'|'video'|'audio'|'apk'} type
 * @property {string} [orientation]
 * @property {number} duration - seconds (distinct from a playlist item's duration, which is milliseconds)
 * @property {object} meta
 */

/**
 * Creates an asset upload record. x-tenant and x-group are both required by
 * the live spec.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string} groupId
 * @param {CreateAssetInput} input
 * @returns {Promise<Asset>}
 */
export async function createAsset(credentials, groupId, input) {
  return /** @type {Promise<Asset>} */ (request(credentials, '/cms/api/v1/assets', {
    method: 'POST',
    body: input,
    headers: { 'x-group': groupId },
  }))
}

/**
 * @typedef {object} Playlist
 * @property {string} uuid
 * @property {string} name
 * @property {string} groupUuid
 * @property {number} duration
 * @property {number} itemsCount
 */

/**
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string} groupId
 * @param {{name: string, tagUuids?: string[], projectUuid?: string}} input
 * @returns {Promise<Playlist>}
 */
export async function createPlaylist(credentials, groupId, input) {
  return /** @type {Promise<Playlist>} */ (request(credentials, '/cms/api/v1/playlists', {
    method: 'POST',
    body: input,
    headers: { 'x-group': groupId },
  }))
}

/**
 * @typedef {object} PlaylistAssetEntry
 * @property {'asset'|'playlist'|'layout'} asset_type
 * @property {string} childUuid
 * @property {number} duration - milliseconds, confirmed by the live spec's own field description
 * @property {number} [itemsPerPass] - only applies when the child is another playlist
 */

/**
 * Sets a playlist's ordered contents. The path parameter is literally
 * `playlistId` per the live spec, even though the endpoint is colloquially
 * described as "{uuid}/assetlist".
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string} playlistId
 * @param {PlaylistAssetEntry[]} assets
 * @returns {Promise<unknown>}
 */
export async function updatePlaylistAssets(credentials, playlistId, assets) {
  return request(credentials, `/cms/api/v1/playlists/${playlistId}/assetlist`, {
    method: 'PATCH',
    body: { assets },
  })
}

/**
 * @typedef {object} PagedResult
 * @property {unknown[]} items
 * @property {number} totalItems
 * @property {number} currentPage
 * @property {number} totalPages
 */

/**
 * Lists assets, v1 shape (data/meta.totalItems).
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {{page?: number, limit?: number, groupId?: string}} [options]
 * @returns {Promise<PagedResult>}
 */
export async function listAssets(credentials, options = {}) {
  return listV1(credentials, '/cms/api/v1/assets', options)
}

/**
 * Lists playlists, v1 shape (data/meta.totalItems).
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {{page?: number, limit?: number, groupId?: string}} [options]
 * @returns {Promise<PagedResult>}
 */
export async function listPlaylists(credentials, options = {}) {
  return listV1(credentials, '/cms/api/v1/playlists', options)
}

/**
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string} path
 * @param {{page?: number, limit?: number, groupId?: string}} options
 * @returns {Promise<PagedResult>}
 */
async function listV1(credentials, path, options) {
  /** @type {Record<string,string>} */
  const query = {}
  if (options.page !== undefined) query.page = String(options.page)
  if (options.limit !== undefined) query.limit = String(options.limit)
  const headers = options.groupId ? { 'x-group': options.groupId } : undefined
  const body = /** @type {any} */ (await request(credentials, path, { query, headers }))
  return {
    items: body.data ?? [],
    totalItems: body.meta?.totalItems ?? body.data?.length ?? 0,
    currentPage: body.meta?.currentPage ?? 1,
    totalPages: body.meta?.totalPages ?? 1,
  }
}
