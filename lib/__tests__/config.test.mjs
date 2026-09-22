import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig, isLiveConfigured, portalUrlFor } from '../config.mjs'

test('throws naming every missing required variable', () => {
  assert.throws(() => loadConfig({}), /VIDERI_USERNAME.*VIDERI_PASSWORD.*VIDERI_API_KEY.*VIDERI_TENANT/)
})

test('defaults VIDERI_API_BASE_URL to production', () => {
  const config = loadConfig({ VIDERI_USERNAME: 'u', VIDERI_PASSWORD: 'p', VIDERI_API_KEY: 'k', VIDERI_TENANT: 't' })
  assert.equal(config.apiBaseUrl, 'https://api.go.videri.com')
})

test('derives portalUrl from apiBaseUrl, production is the one exception', () => {
  const config = loadConfig({ VIDERI_USERNAME: 'u', VIDERI_PASSWORD: 'p', VIDERI_API_KEY: 'k', VIDERI_TENANT: 't' })
  assert.equal(config.portalUrl, 'https://developer.videri.com')
})

test('portalUrlFor maps api.<stack> to developer.<stack> for non-production stacks', () => {
  assert.equal(portalUrlFor('https://api.sandbox.videri.com'), 'https://developer.sandbox.videri.com')
  assert.equal(portalUrlFor('https://api.dev.videri.com'), 'https://developer.dev.videri.com')
})

test('portalUrlFor maps api.go.videri.com to developer.videri.com (production has no stack label)', () => {
  assert.equal(portalUrlFor('https://api.go.videri.com'), 'https://developer.videri.com')
})

test('strips a trailing slash from a supplied base URL', () => {
  const config = loadConfig({
    VIDERI_API_BASE_URL: 'https://example.com/',
    VIDERI_USERNAME: 'u',
    VIDERI_PASSWORD: 'p',
    VIDERI_API_KEY: 'k',
    VIDERI_TENANT: 't',
  })
  assert.equal(config.apiBaseUrl, 'https://example.com')
})

test('isLiveConfigured is false when required vars are missing, true when present', () => {
  assert.equal(isLiveConfigured({}), false)
  assert.equal(
    isLiveConfigured({ VIDERI_USERNAME: 'u', VIDERI_PASSWORD: 'p', VIDERI_API_KEY: 'k', VIDERI_TENANT: 't' }),
    true,
  )
})
