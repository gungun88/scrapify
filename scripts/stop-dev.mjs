import { getDevPort, stopNodeProcessesOnPort, waitForPortToBeFree } from './dev-server-utils.mjs'

const port = getDevPort()

stopNodeProcessesOnPort(port)
await waitForPortToBeFree(port)
