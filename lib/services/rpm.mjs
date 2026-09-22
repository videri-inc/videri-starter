/**
 * RPM (Resource Permission Manager) adapter - workspace listing.
 *
 * Not in the original CORE-10267 scope; added while building a fleet
 * dashboard on top of this starter kit (see AGENTS.md Part 1 step 2, which
 * documents this exact call as part of the probe but never promoted it to
 * lib/services/).
 *
 * IMPORTANT: this hits /rpm-service/v2/users/me/access/groups, which is
 * NOT documented in the live OpenAPI spec published at
 * api.<env>.videri.com/rpm/api-json (that spec only covers a separate /v1
 * surface - /v1/groups/user/access, etc). AGENTS.md and the probe are the
 * only source of truth for this v2 endpoint; it was verified live against
 * sandbox before this adapter was written (200 OK, real workspace tree
 * returned). Do not assume the /rpm/api-json spec is complete.
 */

import { request } from '../client.mjs'

/**
 * @typedef {object} Workspace
 * @property {number} depth
 * @property {string} id - workspace UUID
 * @property {string} name
 * @property {string|null} parentId
 */

/**
 * Walks the workspace tree under `descendants` - the published OpenAPI
 * schema (where it exists at all) names this field `children` on some
 * generated clients; the live response actually uses `descendants`. Fall
 * back to `children` defensively only.
 *
 * @param {any[]} nodes
 * @param {number} depth
 * @param {string|null} parentId
 * @param {Workspace[]} out
 * @returns {Workspace[]}
 */
function flattenWorkspaces(nodes, depth = 0, parentId = null, out = []) {
  for (const node of nodes ?? []) {
    out.push({ depth, id: node.uuid, name: node.displayName, parentId })
    flattenWorkspaces(node.descendants ?? node.children ?? [], depth + 1, node.uuid, out)
  }
  return out
}

/**
 * Lists every workspace (group) the current user can access, flattened
 * from the tree the API returns into a depth-annotated array.
 *
 * `me` is literal - the RPM spec accepts either a user UUID or the string
 * `me` for the caller's own access.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @returns {Promise<Workspace[]>}
 */
export async function listWorkspaces(credentials) {
  const body = /** @type {any} */ (await request(credentials, '/rpm-service/v2/users/me/access/groups'))
  return flattenWorkspaces(body.groups ?? [])
}
