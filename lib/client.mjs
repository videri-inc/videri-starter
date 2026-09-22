/**
 * One request function every service adapter calls through, instead of raw
 * fetch (CORE-10267). Modeled on the one genuinely clean client pattern found
 * across every reference build surveyed for this starter kit -
 * videri-vcreate's server/workspace.mjs upstream(): base URL, token
 * selection, a timeout, and a sanitized, consistent error on failure.
 *
 * Every other reference build hand-rolls this per call site, which is why
 * response handling is inconsistent everywhere else in this ecosystem. Don't
 * add another ad-hoc fetch call - add an adapter function in services/ that
 * calls request() below.
 */

import { getIdToken, getAccessToken, invalidateToken } from './auth.mjs'

const DEFAULT_TIMEOUT_MS = 15_000

export class VideriApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {string} body
   */
  constructor(message, status, body) {
    super(message)
    this.name = 'VideriApiError'
    this.status = status
    this.body = body
  }
}

/**
 * @typedef {object} RequestOptions
 * @property {'id'|'access'} [tokenType] - default 'id'; Canvas Status/Metrics need 'access'
 * @property {string} [tenant] - overrides credentials.tenant for this one call
 * @property {string} [method]
 * @property {Record<string,string>} [query]
 * @property {unknown} [body]
 * @property {Record<string,string>} [headers]
 */

/**
 * @param {import('./auth.mjs').VideriCredentials & {tenant: string}} credentials
 * @param {string} path - e.g. "/canvas-service/canvases"
 * @param {RequestOptions} [options]
 * @returns {Promise<unknown>}
 */
export async function request(credentials, path, options = {}) {
  const token = options.tokenType === 'access'
    ? await getAccessToken(credentials)
    : await getIdToken(credentials)

  const url = new URL(path, credentials.apiBaseUrl)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  let res
  try {
    res = await fetch(url, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant': options.tenant ?? credentials.tenant,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
  } catch (error) {
    throw new VideriApiError(`Request to ${path} failed: ${error.message}`, 0, '')
  } finally {
    clearTimeout(timeout)
  }

  if (res.status === 401) {
    // The cache thought this token was valid; the platform disagreed.
    // Invalidate so the next call re-authenticates rather than repeating
    // the same rejected token.
    invalidateToken(credentials)
  }

  const text = await res.text()
  if (!res.ok) {
    throw new VideriApiError(`${options.method ?? 'GET'} ${path} failed: ${res.status}`, res.status, text)
  }
  return text ? JSON.parse(text) : undefined
}
