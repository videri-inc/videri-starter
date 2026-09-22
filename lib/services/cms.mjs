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
 * @typedef {object} AssetBlob
 * @property {string} name - "thumbnail" | "landscape-hd" | "original" | etc.
 * @property {string} url - stable, public cdn.<env>.videri.com URL, safe as an <img src>
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [type]
 */

/**
 * @typedef {object} Asset
 * @property {string} uuid
 * @property {string} name
 * @property {'image'|'video'|'audio'|'apk'} type
 * @property {string} [orientation]
 * @property {number} duration - seconds (distinct from a playlist item's duration, which is milliseconds)
 * @property {object} meta - upload/ingestion metadata (bucket, format, checksums). Its
 *   `presigned_url` points at the original upload and expires in 15 minutes - not for
 *   display. For a renderable image, use `blobs`, not this field.
 * @property {AssetBlob[]} blobs - the renderable images. Prefer the "thumbnail"-named
 *   entry for list/grid views.
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
 * @typedef {object} Project
 * @property {string} uuid
 * @property {string} name
 * @property {string} groupUuid
 * @property {string} groupName
 * @property {number} assetCount
 * @property {number} playlistCount
 * @property {boolean} shared
 * @property {string} createdAt
 * @property {string} lastUpdated
 */

/**
 * Lists projects, v1 shape (data/meta.totalItems). Not in the original
 * CORE-10267 scope (AGENTS.md documents assets/playlists but not
 * projects) - added while building a fleet dashboard that needed
 * project-level metrics. `GET /cms/api/v1/projects` verified live against
 * sandbox: same {data, meta} wrapper as assets/playlists, with
 * assetCount/playlistCount already aggregated per project by the API.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {{page?: number, limit?: number, groupId?: string, search?: string}} [options]
 * @returns {Promise<PagedResult>}
 */
export async function listProjects(credentials, options = {}) {
  /** @type {Record<string,string>} */
  const query = {}
  if (options.page !== undefined) query.page = String(options.page)
  if (options.limit !== undefined) query.limit = String(options.limit)
  if (options.search) query.search = options.search
  const headers = options.groupId ? { 'x-group': options.groupId } : undefined
  const body = /** @type {any} */ (await request(credentials, '/cms/api/v1/projects', { query, headers }))
  return {
    items: body.data ?? [],
    totalItems: body.meta?.totalItems ?? body.data?.length ?? 0,
    currentPage: body.meta?.currentPage ?? 1,
    totalPages: body.meta?.totalPages ?? 1,
  }
}

/**
 * Fetches one project by UUID. Added alongside listProjects for
 * dashboard drill-down.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string} uuid
 * @returns {Promise<Project>}
 */
export async function getProject(credentials, uuid) {
  return /** @type {Promise<Project>} */ (request(credentials, `/cms/api/v1/projects/${uuid}`))
}

/**
 * Fetches one asset by UUID. Added for dashboard drill-down - the live
 * spec's GET /api/v1/assets/{uuid} returns the same shape listAssets'
 * items use, including the presigned S3 URLs under meta.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string} uuid
 * @returns {Promise<Asset>}
 */
export async function getAsset(credentials, uuid) {
  return /** @type {Promise<Asset>} */ (request(credentials, `/cms/api/v1/assets/${uuid}`))
}

/**
 * Fetches one playlist by UUID (path param is `playlistId` per the live
 * spec). Added for dashboard drill-down.
 *
 * `group` is shaped differently here than in `listPlaylists`' items: the
 * list endpoint returns a plain string (`"Hamza Workspaces"`), this one
 * returns `{uuid, displayName}`. Not documented anywhere, found by
 * comparing live responses side by side after it broke a UI render.
 * Assets and projects don't have this inconsistency - only playlists.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string} playlistId
 * @returns {Promise<Playlist & {group: string | {uuid: string, displayName: string}}>}
 */
export async function getPlaylist(credentials, playlistId) {
  return /** @type {Promise<Playlist>} */ (request(credentials, `/cms/api/v1/playlists/${playlistId}`))
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
