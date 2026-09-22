/**
 * Token exchange and caching (CORE-10267). Every reference build in this
 * ecosystem does the same thing: POST username+password+api_key, cache
 * id_token and access_token with an expiry margin, and re-authenticate on
 * 401 rather than use the refresh_token grant (none of them implement it).
 *
 * See ../AGENTS.md "Authentication" for the full protocol this implements.
 */

/**
 * @typedef {object} VideriCredentials
 * @property {string} apiBaseUrl - no trailing slash
 * @property {string} username
 * @property {string} password
 * @property {string} apiKey
 */

/**
 * @typedef {object} TokenSet
 * @property {string} idToken - use for every call except Canvas Status/Metrics
 * @property {string} accessToken - use for Canvas Status and Metrics only
 * @property {number} expiresAt - epoch ms
 */

const REAUTH_MARGIN_MS = 5 * 60 * 1000 // videri-context/GOTCHAS.md: five-minute margin against expires_in

/** @type {Map<string, Promise<TokenSet> | TokenSet>} keyed by apiBaseUrl+username, so one process can hold tokens for more than one account */
const tokenCache = new Map()

function cacheKey(credentials) {
  return `${credentials.apiBaseUrl}::${credentials.username}`
}

/**
 * @param {VideriCredentials} credentials
 * @returns {Promise<TokenSet>}
 */
async function requestToken(credentials) {
  const res = await fetch(`${credentials.apiBaseUrl}/rpm-service/v2/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
      api_key: credentials.apiKey,
    }),
  })
  if (res.status === 423) {
    // "Lock contention - user already authenticating" per the live RPM spec.
    // One short retry covers the common case of two near-simultaneous calls
    // racing to authenticate the same account.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return requestToken(credentials)
  }
  if (!res.ok) {
    throw new Error(`Videri auth failed: ${res.status} ${await res.text()}`)
  }
  const body = await res.json()
  return {
    idToken: body.id_token,
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  }
}

/**
 * Returns a cached, still-valid token set, or authenticates fresh. Safe to
 * call before every request - it only hits the network when the cache is
 * empty or within the re-auth margin of expiring.
 *
 * Reads and reserves the cache slot synchronously, before any await, so two
 * calls made concurrently (e.g. Promise.all-ing two adapter calls that both
 * need a token) see the same in-flight request instead of each starting
 * their own - without this, every concurrent pair of calls would
 * authenticate twice.
 *
 * @param {VideriCredentials} credentials
 * @returns {Promise<TokenSet>}
 */
export function getTokenSet(credentials) {
  const key = cacheKey(credentials)
  const cached = tokenCache.get(key)
  if (cached && !(cached instanceof Promise) && cached.expiresAt > Date.now() + REAUTH_MARGIN_MS) {
    return Promise.resolve(cached)
  }
  if (cached instanceof Promise) {
    return cached
  }
  const pending = requestToken(credentials).then((resolved) => {
    tokenCache.set(key, resolved)
    return resolved
  })
  tokenCache.set(key, pending)
  return pending
}

/**
 * Forces the next getTokenSet call for these credentials to re-authenticate.
 * Call this after any 401, since it means the cached token was rejected
 * even though the cache thought it was still valid.
 *
 * @param {VideriCredentials} credentials
 */
export function invalidateToken(credentials) {
  tokenCache.delete(cacheKey(credentials))
}

/**
 * @param {VideriCredentials} credentials
 * @returns {Promise<string>}
 */
export async function getIdToken(credentials) {
  return (await getTokenSet(credentials)).idToken
}

/**
 * Canvas Status and Metrics are the one documented exception to
 * "id_token everywhere" - see AGENTS.md.
 *
 * @param {VideriCredentials} credentials
 * @returns {Promise<string>}
 */
export async function getAccessToken(credentials) {
  return (await getTokenSet(credentials)).accessToken
}
