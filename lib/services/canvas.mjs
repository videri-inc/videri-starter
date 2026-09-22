/**
 * Canvas Service adapter (CORE-10267). Verified directly against the live
 * spec at api.go.videri.com/canvas-service/v3/api-docs - see AGENTS.md
 * "Canvas Service" for the full contract, including what's verified vs.
 * still documentation-only.
 */

import { request } from '../client.mjs'

/**
 * @typedef {object} Canvas
 * @property {number} id
 * @property {string} device_id
 * @property {string} xmpp_jid
 * @property {string} name
 * @property {string} presence_status
 * @property {string} content_status
 * @property {number} group_id
 * @property {string} group_name
 * @property {string[]} tags
 * @property {string} timezone
 * @property {string} last_online_time
 */
// Note: there is no brightness-level field on this endpoint - verified
// against the live schema. Don't add current_brightness here.

/**
 * Lists every canvas the account can see. assigned_to_group=true and =false
 * return disjoint sets with no "all" value (videri-context/GOTCHAS.md) - this
 * calls both and merges, so callers never have to think about the split.
 *
 * Canvas Service scopes by the `group_id` query parameter, not the x-group
 * header every other write-capable service uses - pass `groupId` here, don't
 * try to pass a tenant object with a group already applied via headers.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {{groupId?: number}} [options]
 * @returns {Promise<Canvas[]>}
 */
export async function listCanvases(credentials, options = {}) {
  const fetchPage = async (assignedToGroup) => {
    /** @type {Record<string,string>} */
    const query = { assigned_to_group: String(assignedToGroup), size: '1000' }
    if (options.groupId !== undefined) query.group_id = String(options.groupId)
    const body = await request(credentials, '/canvas-service/canvases', { query })
    return extractItems(body)
  }
  const [assigned, unassigned] = await Promise.all([fetchPage(true), fetchPage(false)])
  return [...assigned, ...unassigned]
}

/**
 * Pulls the item array out of whatever key the response actually used.
 * The live spec wraps items under `content` (a standard Spring Page shape,
 * with `totalElements` as the real total) - but check `data`/`canvases`/
 * `items` too rather than assuming one wrapper, since other services in
 * this ecosystem use different keys for the same pattern.
 *
 * @param {any} body
 * @returns {Canvas[]}
 */
function extractItems(body) {
  return body.content ?? body.data ?? body.canvases ?? body.items ?? []
}
