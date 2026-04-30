import { cleanNextCache, ensurePortIsFree, getDevPort } from './dev-server-utils.mjs'

const port = getDevPort()

await ensurePortIsFree(port)
cleanNextCache(port)
