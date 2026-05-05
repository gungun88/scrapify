import '../src/env-loader'
import fs from 'node:fs/promises'
import path from 'node:path'
import { backendConfig } from '../src/config'
import { closeDbConnections, getDb, initDb } from '../src/db/client'
import {
  analyticsSnapshots,
  fieldConfigs as fieldConfigsTable,
  monitorItems as monitorItemsTable,
  proxyItems as proxyItemsTable,
  scheduleJobs as scheduleJobsTable,
  tasks as tasksTable,
} from '../src/db/schema'
import { normalizeTaskRecord } from '../src/services/data-store'
import type {
  AnalyticsSnapshot,
  DatabaseShape,
  FieldConfig,
  MonitorItem,
  ProxyItem,
  ScheduleJob,
} from '../src/types'

const ANALYTICS_SINGLETON_ID = 'global-analytics'

async function loadJsonFile(targetPath: string): Promise<Partial<DatabaseShape> | null> {
  try {
    const raw = await fs.readFile(targetPath, 'utf8')
    return JSON.parse(raw) as Partial<DatabaseShape>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function backupSourceFile(targetPath: string) {
  const backupPath = `${targetPath}.bak-${Date.now()}`
  try {
    await fs.copyFile(targetPath, backupPath)
    // eslint-disable-next-line no-console
    console.log(`[migrate] backed up ${path.basename(targetPath)} → ${path.basename(backupPath)}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

async function migrate() {
  await initDb()

  const candidates = [backendConfig.dataFile, backendConfig.seedDataFile]
  let sourcePath: string | null = null
  let raw: Partial<DatabaseShape> | null = null

  for (const candidate of candidates) {
    raw = await loadJsonFile(candidate)
    if (raw) {
      sourcePath = candidate
      break
    }
  }

  if (!raw || !sourcePath) {
    // eslint-disable-next-line no-console
    console.log('[migrate] no JSON source file found; nothing to migrate.')
    return
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate] loading from ${sourcePath}`)

  const db = getDb()
  const now = Date.now()

  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map((task) => normalizeTaskRecord(task, now))
    : []
  const fieldConfigs: FieldConfig[] = Array.isArray(raw.fieldConfigs) ? (raw.fieldConfigs as FieldConfig[]) : []
  const scheduleJobs: ScheduleJob[] = Array.isArray(raw.scheduleJobs) ? (raw.scheduleJobs as ScheduleJob[]) : []
  const monitorItems: MonitorItem[] = Array.isArray(raw.monitorItems) ? (raw.monitorItems as MonitorItem[]) : []
  const proxyItems: ProxyItem[] = Array.isArray(raw.proxyItems) ? (raw.proxyItems as ProxyItem[]) : []
  const analyticsSnapshot = (raw.analyticsSnapshot as AnalyticsSnapshot | undefined) ?? null

  await db.transaction(async (tx: any) => {
    await tx.delete(tasksTable)
    if (tasks.length > 0) {
      await tx.insert(tasksTable).values(
        tasks.map((task) => ({
          id: task.id,
          userId: null,
          url: task.url,
          status: task.status,
          payload: task,
          startedAtMs: task.startedAtMs,
          updatedAtMs: task.updatedAtMs,
          createdAt: new Date(Date.parse(task.createdAt) || now),
        })),
      )
    }

    await tx.delete(fieldConfigsTable)
    if (fieldConfigs.length > 0) {
      await tx.insert(fieldConfigsTable).values(
        fieldConfigs.map((field) => ({
          id: field.id,
          userId: null,
          label: field.label,
          path: field.path,
          type: field.type,
          enabled: field.enabled,
        })),
      )
    }

    await tx.delete(scheduleJobsTable)
    if (scheduleJobs.length > 0) {
      await tx.insert(scheduleJobsTable).values(
        scheduleJobs.map((job) => ({ id: job.id, userId: null, payload: job })),
      )
    }

    await tx.delete(monitorItemsTable)
    if (monitorItems.length > 0) {
      await tx.insert(monitorItemsTable).values(
        monitorItems.map((item) => ({ id: item.id, userId: null, payload: item })),
      )
    }

    await tx.delete(proxyItemsTable)
    if (proxyItems.length > 0) {
      await tx.insert(proxyItemsTable).values(
        proxyItems.map((item) => ({ id: item.id, userId: null, payload: item })),
      )
    }

    await tx.delete(analyticsSnapshots)
    if (analyticsSnapshot) {
      await tx.insert(analyticsSnapshots).values({
        id: ANALYTICS_SINGLETON_ID,
        userId: null,
        payload: analyticsSnapshot,
      })
    }
  })

  // 仅备份运行时文件，不动 seed
  if (sourcePath === backendConfig.dataFile) {
    await backupSourceFile(sourcePath)
  }

  // eslint-disable-next-line no-console
  console.log(
    `[migrate] inserted: tasks=${tasks.length} fieldConfigs=${fieldConfigs.length} scheduleJobs=${scheduleJobs.length} monitorItems=${monitorItems.length} proxyItems=${proxyItems.length} analyticsSnapshot=${analyticsSnapshot ? 1 : 0}`,
  )
}

migrate()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[migrate] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDbConnections()
  })
