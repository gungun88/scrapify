import fs from 'node:fs/promises'
import path from 'node:path'
import { backendConfig } from '../config'
import { createSeedDatabase } from '../data/seed'
import type { DatabaseShape } from '../types'

let state: DatabaseShape | null = null

async function ensureParentDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

export async function loadDatabase() {
  if (state) {
    return state
  }

  try {
    const raw = await fs.readFile(backendConfig.dataFile, 'utf8')
    state = JSON.parse(raw) as DatabaseShape
    return state
  } catch {
    const seed = createSeedDatabase()
    state = seed
    await saveDatabase()
    return seed
  }
}

export async function saveDatabase() {
  if (!state) {
    return
  }

  await ensureParentDir(backendConfig.dataFile)
  await fs.writeFile(backendConfig.dataFile, JSON.stringify(state, null, 2), 'utf8')
}

export async function getDatabase() {
  return loadDatabase()
}
