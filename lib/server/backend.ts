import { NextResponse } from 'next/server'

interface BackendOptions {
  path: string
  method?: string
  body?: unknown
  search?: string
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function getBackendConfig() {
  const baseUrl = getOptionalEnv('SCRAPIFY_BACKEND_BASE_URL')

  if (!baseUrl) {
    return null
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    prefix: process.env.SCRAPIFY_BACKEND_PREFIX?.trim() || '/api',
    token: getOptionalEnv('SCRAPIFY_BACKEND_TOKEN'),
  }
}

function joinPath(prefix: string, path: string) {
  const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedPrefix.replace(/\/$/, '')}${normalizedPath}`
}

function buildHeaders(token: string | null, body?: unknown) {
  const headers = new Headers()

  headers.set('Accept', 'application/json')

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return headers
}

async function parseResponsePayload(response: Response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()

  return text ? { message: text } : null
}

export async function proxyBackendRequest({ path, method = 'GET', body, search }: BackendOptions) {
  const config = getBackendConfig()

  if (!config) {
    return null
  }

  const url = new URL(`${config.baseUrl}${joinPath(config.prefix, path)}`)

  if (search) {
    url.search = search.startsWith('?') ? search : `?${search}`
  }

  try {
    const response = await fetch(url, {
      method,
      headers: buildHeaders(config.token, body),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })

    const payload = await parseResponsePayload(response)

    if (response.status === 204) {
      return new NextResponse(null, { status: response.status })
    }

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend proxy failed'
    return NextResponse.json({ message }, { status: 502 })
  }
}
