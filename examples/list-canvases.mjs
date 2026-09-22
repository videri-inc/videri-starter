#!/usr/bin/env node
/**
 * The starter kit's "one live render" (CORE-10267): authenticate, list every
 * canvas the account can see, print online/offline status. The smallest
 * possible proof that the client library actually works end to end - the
 * same call the developer portal's authentication article uses as its
 * known-good first call.
 *
 * Usage:
 *   node --env-file=.env examples/list-canvases.mjs
 */

import { loadConfig } from '../lib/config.mjs'
import { listCanvases } from '../lib/services/canvas.mjs'

const config = loadConfig()
const canvases = await listCanvases(config, config.groupId ? { groupId: Number(config.groupId) } : {})

console.log(`${canvases.length} canvases for tenant ${config.tenant}:\n`)
for (const canvas of canvases) {
  const online = canvas.presence_status === 'online' ? 'online' : `offline (${canvas.presence_status})`
  console.log(`- ${canvas.name} (id=${canvas.id}): ${online}`)
}
