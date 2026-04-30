import { spawn } from 'node:child_process'
import path from 'node:path'
import {
  cleanNextCache,
  getDevPort,
  stopNodeProcessesOnPort,
  waitForPortToBeFree,
} from './dev-server-utils.mjs'

const port = getDevPort()

stopNodeProcessesOnPort(port)
await waitForPortToBeFree(port)
cleanNextCache(port)

const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
