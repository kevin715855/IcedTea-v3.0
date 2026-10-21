'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { api, fetchJson } from '@/lib/api'

export interface Account {
  id: string
  username: string
  role: 'admin' | 'staff'
  is_active: boolean
  valid_until: Date | null
}

interface SessionContextValue {
  account: Account | null
  loading: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/auth/me')
      if (res.ok) {
        setAccount((await fetchJson<{ account: Account }>(res)).account)
      } else {
        setAccount(null)
      }
    } catch {
      setAccount(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore logout errors; local state is cleared regardless
    }
    setAccount(null)
    router.replace('/login')
  }, [router])

  const value = useMemo<SessionContextValue>(() => ({ account, loading, signOut, refresh }), [
    account,
    loading,
    signOut,
    refresh,
  ])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return ctx
}
