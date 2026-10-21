'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatVnTime, toLocalDateTime, toVnIso } from '@/lib/format'
import { useSession } from '@/components/session-provider'

interface UserData {
  id: string
  username: string
  role: string
  is_active: boolean
  valid_from: Date | null
  valid_until: Date | null
  created_at: Date
}

export default function UsersPage() {
  const { account, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!account) router.replace('/login')
    if (account && account.role !== 'admin') router.replace('/scan')
  }, [account, loading, router])

  if (loading || !account) return null

  const [users, setUsers] = useState<UserData[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [createUsername, setCreateUsername] = useState('')
  const [createValidUntil, setCreateValidUntil] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValidUntil, setEditValidUntil] = useState('')
  const [editActive, setEditActive] = useState(true)

  const fetchUsers = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await api.get('/users')
      if (!res.ok) return
      const json = await res.json().catch(() => ({}))
      setUsers(
        (json.users ?? []).map((u: any) => ({
          id: u.id,
          username: u.username,
          role: u.role,
          is_active: u.is_active,
          valid_from: u.valid_from ? new Date(u.valid_from) : null,
          valid_until: u.valid_until ? new Date(u.valid_until) : null,
          created_at: new Date(u.created_at),
        })),
      )
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!createUsername) return
    try {
      const res = await api.post('/users', {
        username: createUsername,
        valid_until: createValidUntil ? toVnIso(createValidUntil) : null,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Không thể tạo tài khoản')
        return
      }
      const json = await res.json().catch(() => ({}))
      setCreatedPassword(json.password ?? null)
      setCreateUsername('')
      setCreateValidUntil('')
      await fetchUsers()
    } catch {
      setError('Mất kết nối, vui lòng thử lại')
    }
  }

  const startEdit = (u: UserData) => {
    setEditingId(u.id)
    setEditValidUntil(u.valid_until ? toLocalDateTime(u.valid_until) : '')
    setEditActive(u.is_active)
  }

  const handleEdit = async (id: string) => {
    setError('')
    try {
      const res = await api.patch(`/users/${id}`, {
        valid_until: editValidUntil ? toVnIso(editValidUntil) : null,
        is_active: editActive,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Không thể cập nhật tài khoản')
        return
      }
      setEditingId(null)
      await fetchUsers()
    } catch {
      setError('Mất kết nối, vui lòng thử lại')
    }
  }

  const selfId = account.id

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Tài khoản Staff</h1>
          <p className="text-sm text-gray-500">Tạo, gia hạn hoặc khoá tài khoản Staff.</p>
        </div>
        <button
          onClick={() => setCreating(!creating)}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          {creating ? 'Hủy tạo tài khoản' : 'Tạo tài khoản Staff'}
        </button>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {createdPassword && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-800 mb-2">Mật khẩu mới (hiển thị một lần)</h2>
          <p className="text-sm text-amber-700 break-all mb-3">{createdPassword}</p>
          <p className="text-xs text-amber-600">
            Mật khẩu do hệ thống sinh ngẫu nhiên. Hãy cung cấp cho Staff ngay khi tạo; sau này chỉ Admin có thể gia hạn hoặc khoá tài khoản.
          </p>
          <button onClick={() => setCreatedPassword(null)} className="mt-3 inline-block text-xs underline text-amber-600">
            Đã lưu
          </button>
        </div>
      )}

      {creating && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
          <form onSubmit={handleCreate}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tên đăng nhập</label>
                <input
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  className="w-full rounded-md border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Hạn sử dụng (trống = không giới hạn)</label>
                <input
                  type="datetime-local"
                  value={createValidUntil}
                  onChange={(e) => setCreateValidUntil(e.target.value)}
                  className="w-full rounded-md border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700">
                Tạo
              </button>
              <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-md border border-gray-300 text-sm">
                Bỏ qua
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Tên đăng nhập</th>
              <th className="px-4 py-3 font-medium text-gray-600">Vai trò</th>
              <th className="px-4 py-3 font-medium text-gray-600">Trạng thái</th>
              <th className="px-4 py-3 font-medium text-gray-600">Hạn sử dụng</th>
              <th className="px-4 py-3 font-medium text-gray-600">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                  {loadingList ? 'Đang tải…' : 'Chưa có tài khoản Staff nào.'}
                </td>
              </tr>
            )}
            {users.map((u) => {
              const editing = editingId === u.id
              const isSelf = u.id === selfId
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">{u.username}</td>
                  <td className="px-4 py-3">{u.role === 'admin' ? 'Admin' : 'Staff'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active ? 'Đang hoạt động' : 'Đã khoá'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{u.valid_until ? formatVnTime(u.valid_until) : 'Không giới hạn'}</td>
                  <td className="px-4 py-3">
                    {editing ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-600">Hạn sử dụng</label>
                          <input
                            type="datetime-local"
                            value={editValidUntil}
                            onChange={(e) => setEditValidUntil(e.target.value)}
                            className="rounded-md border-gray-300 px-2 py-1 text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-600">Hoạt động</label>
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => setEditActive(e.target.checked)}
                            disabled={isSelf && !editActive}
                          />
                          {isSelf && !editActive && <span className="text-xs text-red-600">không khoá mình</span>}
                        </div>
                        <button
                          onClick={() => void handleEdit(u.id)}
                          className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
                        >
                          Lưu
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 rounded-md border border-gray-300 text-xs"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(u)}
                        className="text-xs text-blue-600 underline hover:text-blue-800"
                      >
                        Sửa
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {loadingList && <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-200">Đang tải…</div>}
      </div>
    </div>
  )
}
