'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/components/session-provider'

export default function HomePage() {
  const { account, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    router.replace(account ? '/scan' : '/login')
  }, [account, loading, router])

  return null
}
