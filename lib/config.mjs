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
