import { createHmac } from 'node:crypto'
import { NextResponse } from 'next/server'

interface AuthUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

interface BackendOptions {
  path: string
  method?: string
  body?: unknown
  search?: string
  raw?: boolean
  user?: AuthUser
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
    hmacSecret: getOptionalEnv('SCRAPIFY_BACKEND_HMAC_SECRET'),
  }
}

function joinPath(prefix: string, path: string) {
  const normalizedPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedPrefix.replace(/\/$/, '')}${normalizedPath}`
}

// 与 backend/src/middleware/require-user.ts 的签名口径一致：sub|email|name|image
function signUserHeaders(secret: string, user: AuthUser) {
  const message = [user.id, user.email ?? '', user.name ?? '', user.image ?? ''].join('|')
  return createHmac('sha256', secret).update(message).digest('hex')
}

function buildHeaders(token: string | null, body: unknown, user: AuthUser | undefined, hmacSecret: string | null) {
  const headers = new Headers()

  headers.set('Accept', 'application/json')

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (user) {
    if (!hmacSecret) {
      throw new Error('SCRAPIFY_BACKEND_HMAC_SECRET is not configured; cannot forward authenticated request.')
    }
    headers.set('X-User-Sub', user.id)
    headers.set('X-User-Email', user.email ?? '')
    headers.set('X-User-Name', user.name ?? '')
    headers.set('X-User-Image', user.image ?? '')
    headers.set('X-User-Sig', signUserHeaders(hmacSecret, user))
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

export async function proxyBackendRequest({ path, method = 'GET', body, search, raw = false, user }: BackendOptions) {
  const config = getBackendConfig()

  if (!config) {
    return null
  }

  const url = new URL(`${config.baseUrl}${joinPath(config.prefix, path)}`)

  if (search) {
    url.search = search.startsWith('?') ? search : `?${search}`
  }

  let headers: Headers
  try {
    headers = buildHeaders(config.token, body, user, config.hmacSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend proxy auth failed'
    return NextResponse.json({ message }, { status: 500 })
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })

    if (raw) {
      const respHeaders = new Headers()
      const contentType = response.headers.get('content-type')
      const contentDisposition = response.headers.get('content-disposition')
      const contentLength = response.headers.get('content-length')
      const partial = response.headers.get('x-scrapify-export-partial')

      if (contentType) {
        respHeaders.set('Content-Type', contentType)
      }

      if (contentDisposition) {
        respHeaders.set('Content-Disposition', contentDisposition)
      }

      if (contentLength) {
        respHeaders.set('Content-Length', contentLength)
      }

      if (partial) {
        respHeaders.set('X-Scrapify-Export-Partial', partial)
      }

      return new NextResponse(response.body, {
        status: response.status,
        headers: respHeaders,
      })
    }

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

export function getBackendUnavailableResponse() {
  return NextResponse.json(
    {
      message: 'SCRAPIFY_BACKEND_BASE_URL is not configured. Start the backend service and set the frontend backend URL.',
    },
    { status: 503 },
  )
}
