export function nowIso(now: number) {
  return new Date(now).toISOString()
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function roundTo(value: number, fractionDigits: number) {
  const scale = 10 ** fractionDigits
  return Math.round(value * scale) / scale
}

export function trimHistory(history: number[], maxLength: number) {
  if (history.length <= maxLength) {
    return history
  }

  return history.slice(history.length - maxLength)
}

function hashString(input: string) {
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function deterministicUnit(seed: string, step: number) {
  return hashString(`${seed}:${step}`) / 0x100000000
}

export function deterministicInt(seed: string, step: number, min: number, max: number) {
  if (max <= min) {
    return min
  }

  return min + Math.floor(deterministicUnit(seed, step) * (max - min + 1))
}

export function parseTrafficGb(traffic: string) {
  const match = traffic.match(/(\d+(?:\.\d+)?)\s*GB/i)

  if (!match) {
    return 0
  }

  return Number(match[1]) || 0
}

export function formatTrafficGb(gigabytes: number) {
  const normalized = Math.max(0, roundTo(gigabytes, 1))

  if (normalized === 0) {
    return '0 GB'
  }

  return `${normalized.toFixed(1)} GB`
}

function extractBalancedJsonObject(source: string, startIndex: number) {
  let depth = 0
  let inString = false
  let escaped = false
  let started = false

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index]

    if (!started) {
      if (character === '{') {
        started = true
        depth = 1
      }

      continue
    }

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }

      continue
    }

    if (character === '"') {
      inString = true
      continue
    }

    if (character === '{') {
      depth += 1
      continue
    }

    if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return source.slice(startIndex, index + 1)
      }
    }
  }

  return null
}

export function extractNextDataPayload(html: string) {
  const scriptMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (scriptMatch?.[1]) {
    try {
      return JSON.parse(scriptMatch[1]) as unknown
    } catch {}
  }

  const assignmentIndex = html.search(/__NEXT_DATA__\s*=\s*\{/i)
  if (assignmentIndex === -1) {
    return null
  }

  const objectStart = html.indexOf('{', assignmentIndex)
  if (objectStart === -1) {
    return null
  }

  const jsonSource = extractBalancedJsonObject(html, objectStart)
  if (!jsonSource) {
    return null
  }

  try {
    return JSON.parse(jsonSource) as unknown
  } catch {
    return null
  }
}
