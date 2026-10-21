'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [next, setNext] = useState('/scan')

  const router = useRouter()

  // Read ?next= on the client to avoid useSearchParams SSR/Suspense requirements.
  useEffect(() => {
    setNext(new URLSearchParams(window.location.search).get('next') || '/scan')
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSending(true)

    const res = await api.post('/auth/login', { username, password })

    if (res.status === 401 || res.status === 403) {
      setError('Tên đăng nhập hoặc mật khẩu không đúng')
      setSending(false)
      return
    }
    if (!res.ok) {
      setError('Lỗi server, vui lòng thử lại sau')
      setSending(false)
      return
    }

    // Same-origin fetch stores the Set-Cookie session cookie automatically.
    await res.json()
    router.replace(next)
    setSending(false)
  }

  return (
    <div className="mt-12">
      <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow border border-gray-200">
        <h1 className="text-lg font-semibold mb-4">Đăng nhập</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Tên đăng nhập</label>
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Mật khẩu</label>
            <input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={sending} className="w-full py-2 rounded-md bg-blue-600 text-white disabled:opacity-70">
            {sending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        <p className="mt-4 text-xs text-gray-500">
          Mọi chức năng đều yêu cầu đăng nhập. Tài khoản Staff do Admin tạo.
        </p>
      </div>
    </div>
  )
}
