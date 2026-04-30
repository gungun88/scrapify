import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

export function getDevPort() {
  const port = Number(process.env.PORT || '3000')

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT ?? '<undefined>'}`)
  }

  return port
}

export function cleanNextCache(port) {
  const nextDir = path.join(process.cwd(), '.next')

  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true })
    console.log(`Removed .next cache for dev startup on port ${port}`)
    return
  }

  console.log('.next cache not found')
}

export async function ensurePortIsFree(targetPort) {
  await new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once('error', (error) => {
      if (error && ['EADDRINUSE', 'EACCES'].includes(error.code)) {
        reject(
          new Error(
            `Port ${targetPort} is already in use. Stop the existing dev server before running npm run dev again.`
          )
        )
        return
      }

      reject(error)
    })

    server.once('listening', () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError)
          return
        }

        resolve()
      })
    })

    server.listen(targetPort, '127.0.0.1')
  })
}

export async function waitForPortToBeFree(targetPort, timeoutMs = 10_000) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await ensurePortIsFree(targetPort)
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw lastError ?? new Error(`Timed out waiting for port ${targetPort} to be free.`)
}

export function findListeningPids(targetPort) {
  if (process.platform !== 'win32') {
    throw new Error('This dev server helper currently supports Windows only.')
  }

  const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
  const pids = new Set()

  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/)

    if (columns.length < 5) {
      continue
    }

    const [protocol, localAddress, , state, pid] = columns

    if (protocol !== 'TCP' || state !== 'LISTENING') {
      continue
    }

    if (!localAddress.endsWith(`:${targetPort}`)) {
      continue
    }

    pids.add(pid)
  }

  return [...pids]
}

export function getProcessImageName(pid) {
  const output = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (!output || output.startsWith('INFO:')) {
    return null
  }

  return output.replace(/^"/, '').replace(/".*$/, '')
}

export function stopNodeProcessesOnPort(targetPort) {
  const pids = findListeningPids(targetPort)

  if (pids.length === 0) {
    console.log(`No listening process found on port ${targetPort}`)
    return false
  }

  for (const pid of pids) {
    const imageName = getProcessImageName(pid)

    if (!imageName) {
      throw new Error(`Could not identify the process on port ${targetPort} (PID ${pid}).`)
    }

    if (imageName.toLowerCase() !== 'node.exe') {
      throw new Error(
        `Port ${targetPort} is occupied by ${imageName} (PID ${pid}). Refusing to kill a non-Node process automatically.`
      )
    }

    console.log(`Stopping ${imageName} on port ${targetPort} (PID ${pid})`)
    execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'inherit' })
  }

  return true
}
