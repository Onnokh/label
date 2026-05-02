export type ApiKeyRecord = {
  readonly id: string
  readonly name?: string | null
  readonly start?: string | null
  readonly prefix?: string | null
  readonly createdAt?: string | Date
  readonly updatedAt?: string | Date
  readonly expiresAt?: string | Date | null
  readonly lastRequest?: string | Date | null
  readonly enabled?: boolean | null
}

type ListApiKeysResponse = {
  readonly apiKeys?: ApiKeyRecord[]
}

type CreateApiKeyResponse = {
  readonly key?: string
  readonly apiKey?: ApiKeyRecord
  readonly ApiKey?: ApiKeyRecord
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4001"

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json() as Promise<T>
}

export const listApiKeys = async (): Promise<readonly ApiKeyRecord[]> => {
  const payload = await authFetch<ListApiKeysResponse>("/api/auth/api-key/list", {
    method: "GET",
  })

  return payload.apiKeys ?? []
}

export const createApiKey = async (name: string) => {
  const trimmedName = name.trim()
  const payload = await authFetch<CreateApiKeyResponse>("/api/auth/api-key/create", {
    method: "POST",
    body: JSON.stringify(trimmedName ? { name: trimmedName } : {}),
  })

  const key = payload.key
  if (!key) {
    throw new Error("API key creation did not return a key.")
  }

  return {
    key,
    apiKey: payload.apiKey ?? payload.ApiKey ?? null,
  } as const
}

export const deleteApiKey = async (keyId: string) => {
  await authFetch<{ readonly success?: boolean }>("/api/auth/api-key/delete", {
    method: "POST",
    body: JSON.stringify({ keyId }),
  })
}
