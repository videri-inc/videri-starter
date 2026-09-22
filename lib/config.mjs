/**
 * Config loading (CORE-10267). Every reference build in this ecosystem
 * independently reinvented a "do we have real credentials, or are we in
 * demo mode" gate - this is that pattern, extracted once instead of
 * rewritten per app.
 */

/**
 * @typedef {import('./auth.mjs').VideriCredentials & {tenant: string, groupId?: string}} VideriConfig
 */

/**
 * Production's portal host doesn't carry the stack's own label: the app
 * stack is go.videri.com (hence api.go.videri.com) but the portal deploys to
 * developer.videri.com, not developer.go.videri.com (which has no DNS
 * record). Every other stack follows developer.<stack>, e.g.
 * api.sandbox.videri.com -> developer.sandbox.videri.com.
 */
const PORTAL_HOST_EXCEPTIONS = {
  'go.videri.com': 'developer.videri.com',
}

/**
 * Derives this environment's developer portal URL (where its /llms.txt,
 * /openapi/index.json and knowledge base live) from `VIDERI_API_BASE_URL`.
 * A key, a token and a tenant all belong to exactly one environment, and so
 * does its documentation - this is how a script or agent finds the right
 * one without it being hardcoded.
 *
 * @param {string} apiBaseUrl
 * @returns {string}
 */
export function portalUrlFor(apiBaseUrl) {
  const { hostname } = new URL(apiBaseUrl)
  const stack = hostname.replace(/^api\./, '')
  return `https://${PORTAL_HOST_EXCEPTIONS[stack] ?? `developer.${stack}`}`
}

/**
 * Reads Videri credentials and tenant from environment variables. Throws
 * with a clear message naming exactly which variable is missing, rather
 * than failing later with a confusing 401.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {VideriConfig}
 */
export function loadConfig(env = process.env) {
  const apiBaseUrl = (env.VIDERI_API_BASE_URL ?? 'https://api.go.videri.com').replace(/\/+$/, '')
  const missing = ['VIDERI_USERNAME', 'VIDERI_PASSWORD', 'VIDERI_API_KEY', 'VIDERI_TENANT'].filter((name) => !env[name])
  if (missing.length > 0) {
    throw new Error(`Missing required env var${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`)
  }
  return {
    apiBaseUrl,
    portalUrl: portalUrlFor(apiBaseUrl),
    username: /** @type {string} */ (env.VIDERI_USERNAME),
    password: /** @type {string} */ (env.VIDERI_PASSWORD),
    apiKey: /** @type {string} */ (env.VIDERI_API_KEY),
    tenant: /** @type {string} */ (env.VIDERI_TENANT),
    groupId: env.VIDERI_GROUP,
  }
}

/**
 * True when every credential needed for a real call is present. Use this to
 * gate write operations or to fall back to fixture/demo data, rather than
 * letting a missing credential surface as an obscure network error deep in
 * a call stack.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isLiveConfigured(env = process.env) {
  try {
    loadConfig(env)
    return true
  } catch {
    return false
  }
}
