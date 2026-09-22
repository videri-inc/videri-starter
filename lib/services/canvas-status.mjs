/**
 * Canvas Status adapter - live device health (presence, ping/playback
 * quality, screen state) and per-device metrics, for fleet-status views.
 *
 * Not in the original CORE-10267 scope; added while building a fleet
 * dashboard on top of this starter kit.
 *
 * AGENTS.md Part 1 step 6 documents this as
 * `POST {API_BASE_URL}/canvas-service/status/fetch_all` /
 * `.../canvas-service/metrics/fetch_all` with body `{ids: [...]}`, and
 * flags the id_token-vs-access_token question as unverified. Both are
 * wrong in ways confirmed live against sandbox while building this:
 *
 * 1. Canvas Status is its OWN service (openapi/index.json: "canvas-status",
 *    server prefix /canvas-status), not a sub-path of canvas-service. The
 *    documented `/canvas-service/status/fetch_all` 404s; the real path is
 *    `/canvas-status/status/fetch_all`.
 * 2. The request body shape differs per endpoint, and neither matches
 *    `{ids: [...]}`:
 *    - /status/fetch_all wants `{players: [{device_id, device_jid}]}`
 *    - /metrics/fetch_all wants a bare array of device_id strings
 * 3. With the corrected path and body, `id_token` returns 200 and
 *    `access_token` returns 401 ("jwt signature verification failed:
 *    'vle_user_id' claim is required") - the opposite of what AGENTS.md's
 *    unverified note speculated. So this adapter defaults to id_token,
 *    matching every other service in this library, not the 'access'
 *    tokenType AGENTS.md suggested trying first.
 */

import { request } from '../client.mjs'

/**
 * @typedef {object} PlayerTarget
 * @property {string} deviceId
 * @property {string} deviceJid
 */

/**
 * @typedef {object} DeviceStatus
 * @property {string} device_id
 * @property {string} device_jid
 * @property {string} presence - e.g. "online" | "offline"
 * @property {string} ping_quality
 * @property {string} playback_quality
 * @property {string} showing_logo
 * @property {string} is_black_screen
 * @property {string} is_screen_on
 */

/**
 * Fetches aggregated status (presence, ping/playback quality, screen state)
 * for a batch of devices.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {PlayerTarget[]} players
 * @returns {Promise<DeviceStatus[]>}
 */
export async function fetchStatus(credentials, players) {
  const body = {
    players: players.map((p) => ({ device_id: p.deviceId, device_jid: p.deviceJid })),
  }
  const result = /** @type {any} */ (
    await request(credentials, '/canvas-status/status/fetch_all', { method: 'POST', body })
  )
  return Array.isArray(result) ? result : (result?.data ?? result?.items ?? [])
}

/**
 * Fetches per-device metrics (download/software-update/screen state) for a
 * batch of device IDs.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string[]} deviceIds
 * @returns {Promise<unknown[]>}
 */
export async function fetchMetrics(credentials, deviceIds) {
  const result = /** @type {any} */ (
    await request(credentials, '/canvas-status/metrics/fetch_all', { method: 'POST', body: deviceIds })
  )
  return Array.isArray(result) ? result : (result?.data ?? result?.items ?? [])
}
