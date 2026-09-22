/**
 * Publisher adapter (CORE-10267): scheduling native content on canvases.
 * Verified against the live spec at api.go.videri.com/publisher/api-json -
 * see AGENTS.md "Publisher" for the full contract, including the
 * eventGroupUuids spec gap noted below.
 */

import { request } from '../client.mjs'

/**
 * @typedef {object} EventContentItem
 * @property {string} uuid
 * @property {number} durationMs
 * @property {number} itemOrder
 */

/**
 * @typedef {object} CreateEventInput
 * @property {number[]} [canvasesIds] - required unless wallId/wallsIds/eventGroupUuids is given; each event needs exactly one of these four targeting fields
 * @property {number} [wallId]
 * @property {string[]} [wallsIds]
 * @property {string[]} [eventGroupUuids] - documented in the live spec's own examples and error prose, but missing from its formal schema - included here because it's real, documented behavior
 * @property {EventContentItem[]} [assets]
 * @property {EventContentItem[]} [playlists]
 * @property {EventContentItem[]} [layouts]
 * @property {string} startTime - ISO 8601
 * @property {string} [endTime] - ISO 8601
 * @property {boolean} [isUtc] - there is no separate timezone field; this is the only time-zone-related flag
 * @property {{type: string, weekdays?: string[], daysOfMonth?: string[], hourParts?: string[]}} [frequency]
 * @property {number} [priority]
 * @property {boolean} isSlot
 */

/**
 * Creates events via the batch endpoint. Prefer this over the single-event
 * POST even for one event - some reference builds saw the single-event
 * endpoint 403 where batch succeeded with identical credentials
 * (videri-context/GOTCHAS.md).
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string} groupId
 * @param {CreateEventInput[]} events
 * @returns {Promise<unknown[]>}
 */
export async function createEvents(credentials, groupId, events) {
  const result = /** @type {any} */ (await request(credentials, '/publisher/api/v1/events/batch', {
    method: 'POST',
    body: { events },
    headers: { 'x-group': groupId },
  }))
  return Array.isArray(result) ? result : (result.events ?? result.data ?? [])
}

/**
 * Reads a canvas's scheduled events in a date range. beginDate and endDate
 * are required by the live spec - this is not an unbounded "all events"
 * call.
 *
 * @param {import('../auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {number} canvasId
 * @param {{beginDate: string, endDate: string}} range - ISO 8601 dates
 * @returns {Promise<unknown[]>}
 */
export async function getCanvasEvents(credentials, canvasId, range) {
  const result = /** @type {any} */ (await request(
    credentials,
    `/publisher/api/v1/canvases/${canvasId}/events`,
    { query: { beginDate: range.beginDate, endDate: range.endDate } },
  ))
  return Array.isArray(result) ? result : (result.events ?? result.data ?? [])
}
