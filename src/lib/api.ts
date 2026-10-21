export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`/api/v1${path.startsWith('/') ? path : '/' + path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) =>
    request(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: (path: string, body?: unknown) =>
    request(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: (path: string, body?: unknown) =>
    request(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
}

export async function fetchJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body: any = await readJson(res)
    throw new ApiError(res.status, body?.error ?? 'lỗi server', body?.detail)
  }
  return (await readJson(res)) as T
}
