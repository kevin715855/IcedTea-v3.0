'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatVnTime, toLocalDateTime, toVnIso } from '@/lib/format'
import { useSession } from '@/components/session-provider'

interface SessionData {
  id: string
  name: string
  starts_at: Date
  ends_at: Date
  closed_at: Date | null
  created_at: Date
}

interface FormErrors {
  name?: string
  starts_at?: string
  ends_at?: string
  general?: string
}

export default function SessionsPage() {
  const { account, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!account) router.replace('/login')
    if (account && account.role !== 'admin') router.replace('/scan')
  }, [account, loading, router])

  if (loading || !account) return null

  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')

  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', starts_at: '', ends_at: '' })
  const [createErrors, setCreateErrors] = useState<FormErrors>({})

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; starts_at: string; ends_at: string }>({ name: '', starts_at: '', ends_at: '' })
  const [editErrors, setEditErrors] = useState<FormErrors>({})

  const fetchSessions = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await api.get('/sessions')
      if (!res.ok) return
      const json = await res.json().catch(() => ({}))
      setSessions(
        (json.sessions ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          starts_at: new Date(s.starts_at),
          ends_at: new Date(s.ends_at),
          closed_at: s.closed_at ? new Date(s.closed_at) : null,
          created_at: new Date(s.created_at),
        })),
      )
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const status = (s: SessionData) => {
    if (s.closed_at) return { label: 'Đã đóng', bg: 'bg-red-100', text: 'text-red-700' }
    const now = new Date()
    if (s.starts_at <= now && s.ends_at >= now) return { label: 'Đang mở', bg: 'bg-green-100', text: 'text-green-700' }
    if (now < s.starts_at) return { label: 'Sắp tới', bg: 'bg-gray-100', text: 'text-gray-700' }
    return { label: 'Đã hết giờ', bg: 'bg-gray-100', text: 'text-gray-700' }
  }

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateErrors({})
    setError('')
    if (!createForm.name || !createForm.starts_at || !createForm.ends_at) {
      setCreateErrors({ general: 'Vui lòng điền đầy đủ thông tin' })
      return
    }
    if (createForm.ends_at <= createForm.starts_at) {
      setCreateErrors({ ends_at: 'Thời gian kết thúc phải sau thời gian bắt đầu' })
      return
    }
    try {
      const res = await api.post('/sessions', {
        name: createForm.name,
        starts_at: toVnIso(createForm.starts_at),
        ends_at: toVnIso(createForm.ends_at),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Không thể tạo buổi')
        return
      }
      setCreating(false)
      setCreateForm({ name: '', starts_at: '', ends_at: '' })
      await fetchSessions()
    } catch {
      setError('Mất kết nối, vui lòng thử lại')
    }
  }

  const startEdit = (s: SessionData) => {
    setEditErrors({})
    setEditForm({
      name: s.name,
      starts_at: toLocalDateTime(s.starts_at),
      ends_at: toLocalDateTime(s.ends_at),
    })
    setEditingId(s.id)
  }

  const handleEdit = async (id: string) => {
    setEditErrors({})
    setError('')
    const body: Record<string, unknown> = {}
    if (editForm.name) body.name = editForm.name
    if (editForm.starts_at) body.starts_at = toVnIso(editForm.starts_at)
    if (editForm.ends_at) body.ends_at = toVnIso(editForm.ends_at)
    if (Object.keys(body).length === 0) return
    try {
      const res = await api.patch(`/sessions/${id}`, body)
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        setEditErrors({ general: b.error ?? 'Không thể cập nhật buổi' })
        return
      }
      setEditingId(null)
      await fetchSessions()
    } catch {
      setError('Mất kết nối, vui lòng thử lại')
    }
  }

  const handleClose = async (id: string) => {
    if (!window.confirm('Đóng buổi sẽ không mở lại và không nhận check-in tiếp. Xác nhận?')) return
    setError('')
    try {
      const res = await api.patch(`/sessions/${id}`, { closed_at: new Date().toISOString() })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        setError(b.error ?? 'Không thể đóng buổi')
        return
      }
      await fetchSessions()
    } catch {
      setError('Mất kết nối, vui lòng thử lại')
    }
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Quản lý buổi</h1>
          <p className="text-sm text-gray-500">Tạo, sửa hoặc đóng buổi điểm danh.</p>
        </div>
        <button
          onClick={() => setCreating(!creating)}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          {creating ? 'Hủy tạo buổi' : 'Tạo buổi mới'}
        </button>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {creating && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
          <form onSubmit={handleCreate}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Tên buổi</label>
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full rounded-md border-gray-300 px-3 py-2 text-sm"
                />
                {createErrors.name && <p className="text-xs text-red-600 mt-1">{createErrors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Bắt đầu</label>
                <input
                  type="datetime-local"
                  value={createForm.starts_at}
                  onChange={(e) => setCreateForm({ ...createForm, starts_at: e.target.value })}
                  className="w-full rounded-md border-gray-300 px-3 py-2 text-sm"
                />
                {createErrors.starts_at && <p className="text-xs text-red-600 mt-1">{createErrors.starts_at}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Kết thúc</label>
                <input
                  type="datetime-local"
                  value={createForm.ends_at}
                  onChange={(e) => setCreateForm({ ...createForm, ends_at: e.target.value })}
                  className="w-full rounded-md border-gray-300 px-3 py-2 text-sm"
                />
                {createErrors.ends_at && <p className="text-xs text-red-600 mt-1">{createErrors.ends_at}</p>}
              </div>
            </div>
            {createErrors.general && <p className="text-xs text-red-600">{createErrors.general}</p>}
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
              <th className="px-4 py-3 font-medium text-gray-600">Tên buổi</th>
              <th className="px-4 py-3 font-medium text-gray-600">Khung giờ</th>
              <th className="px-4 py-3 font-medium text-gray-600">Trạng thái</th>
              <th className="px-4 py-3 font-medium text-gray-600">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sessions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
                  {loadingList ? 'Đang tải…' : 'Chưa có buổi nào.'}
                </td>
              </tr>
            )}
            {sessions.map((s) => {
              const st = status(s)
              const closed = s.closed_at !== null
              const editing = editingId === s.id
              return (
                <tr key={s.id}>
                  <td className="px-4 py-3">{editing ? (
                    <input
                      defaultValue={s.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="rounded-md border-gray-300 px-2 py-1 text-sm w-full"
                    />
                  ) : (
                    s.name
                  )}</td>
                  <td className="px-4 py-3">{editing ? (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="datetime-local"
                        defaultValue={editForm.starts_at}
                        onChange={(e) => setEditForm({ ...editForm, starts_at: e.target.value })}
                        className="rounded-md border-gray-300 px-2 py-1 text-sm"
                      />
                      <input
                        type="datetime-local"
                        defaultValue={editForm.ends_at}
                        onChange={(e) => setEditForm({ ...editForm, ends_at: e.target.value })}
                        className="rounded-md border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="text-sm">{formatVnTime(s.starts_at)}</div>
                      <div className="text-sm text-gray-500">→ {formatVnTime(s.ends_at)}</div>
                    </>
                  )}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${st.bg} ${st.text}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {editing ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleEdit(s.id)}
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
                    ) : closed ? (
                      <button disabled className="text-xs text-gray-400">Đã đóng</button>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(s)}
                          className="text-xs text-blue-600 underline hover:text-blue-800 mr-3"
                        >
                          Sửa
                        </button>
                        <button onClick={() => void handleClose(s.id)} className="text-xs text-red-600 underline hover:text-red-800">
                          Đóng buổi
                        </button>
                      </>
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
