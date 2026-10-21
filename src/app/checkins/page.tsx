'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatVnTime } from '@/lib/format'
import { useSession } from '@/components/session-provider'

interface SessionData {
  id: string
  name: string
}

interface CheckinItem {
  id: string
  session_id: string
  session_name: string | null
  student_code: string
  scanned_by: string
  scanned_by_username: string | null
  checked_in_at: Date
  cancelled_at: Date | null
  cancel_reason: string | null
}

interface CheckinListResponse {
  checkins: CheckinItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export default function CheckinsPage() {
  const { account, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!account) router.replace('/login')
  }, [account, loading, router])

  if (loading || !account) return null

  const isAdmin = account.role === 'admin'

  const [sessions, setSessions] = useState<SessionData[]>([])
  const [checkins, setCheckins] = useState<CheckinItem[]>([])
  const [meta, setMeta] = useState<{ total: number; page: number; page_size: number; total_pages: number } | null>(null)
  const [loadingList, setLoadingList] = useState(true)

  const [filterSession, setFilterSession] = useState('')
  const [filterStudent, setFilterStudent] = useState('')
  const [page, setPage] = useState(1)

  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState('')

  const fetchSessions = useCallback(async () => {
    const res = await api.get('/sessions')
    if (!res.ok) return
    const json = await res.json().catch(() => ({}))
    setSessions((json.sessions ?? []).map((s: any) => ({ id: s.id, name: s.name })))
  }, [])

  const fetchCheckins = useCallback(async () => {
    setLoadingList(true)
    try {
      const url = new URL('http://localhost/api/v1/checkins')
      if (filterSession) url.searchParams.set('session_id', filterSession)
      if (filterStudent) url.searchParams.set('student_code', filterStudent)
      url.searchParams.set('page', String(page))
      url.searchParams.set('page_size', '50')

      const res = await api.get(url.pathname + url.search)
      if (!res.ok) return
      const json = (await res.json()) as CheckinListResponse
      setCheckins(json.checkins)
      setMeta(json)
    } finally {
      setLoadingList(false)
    }
  }, [filterSession, filterStudent])

  useEffect(() => {
    setPage(1)
    fetchCheckins()
  }, [filterSession, filterStudent, fetchCheckins])

  useEffect(() => {
    fetchSessions()
    fetchCheckins()
  }, [fetchSessions, fetchCheckins])

  const handleCancel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!cancelId) return
    setCancelError('')
    try {
      const res = await api.delete(`/checkins/${cancelId}`, { cancel_reason: cancelReason.trim() })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setCancelError(body.error ?? 'Không thể huỷ check-in')
        return
      }
      setCancelId(null)
      setCancelReason('')
      await fetchCheckins()
    } catch {
      setCancelError('Mất kết nối, vui lòng thử lại')
    }
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Lịch sử điểm danh</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'Admin xem tất cả check-in.' : 'Bạn chỉ xem check-in do chính mình tạo.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <label className="text-sm font-medium">Buổi</label>
          <select
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value)}
            className="rounded-md border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">-- Tất cả buồi --</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="text-sm font-medium">Mã sinh viên</label>
          <input
            value={filterStudent}
            onChange={(e) => setFilterStudent(e.target.value)}
            placeholder="MSSV"
            className="rounded-md border-gray-300 px-3 py-2 text-sm w-40"
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Mã sinh viên</th>
              <th className="px-4 py-3 font-medium text-gray-600">Buổi</th>
              <th className="px-4 py-3 font-medium text-gray-600">Giờ điểm danh</th>
              <th className="px-4 py-3 font-medium text-gray-600">Trạng thái</th>
              {isAdmin && <th className="px-4 py-3 font-medium text-gray-600">Người quét</th>}
              {isAdmin && <th className="px-4 py-3 font-medium text-gray-600">Hành động</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {checkins.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-gray-500 text-sm">
                  {loadingList ? 'Đang tải…' : 'Không có check-in nào.'}
                </td>
              </tr>
            )}
            {checkins.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">{c.student_code}</td>
                <td className="px-4 py-3">{c.session_name ?? c.session_id}</td>
                <td className="px-4 py-3 text-gray-700">{formatVnTime(c.checked_in_at)}</td>
                <td className="px-4 py-3">
                  {c.cancelled_at ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                      Đã huỷ
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                      Đã điểm danh
                    </span>
                  )}
                </td>
                {isAdmin && <td className="px-4 py-3">{c.scanned_by_username ?? c.scanned_by}</td>}
                {isAdmin && (
                  <td className="px-4 py-3">
                    {!c.cancelled_at && (
                      <button
                        onClick={() => {
                          setCancelId(c.id)
                          setCancelReason('')
                          setCancelError('')
                        }}
                        className="text-xs text-red-600 underline hover:text-red-800"
                      >
                        Huỷ
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {meta && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
            <span>
              {meta.total} lượt{' '}
              {meta.page > 1 ? `trang ${meta.page} của ${meta.total_pages}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={meta.page <= 1 || loadingList}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:pointer-events-none"
              >
                Trang trước
              </button>
              <button
                disabled={meta.page >= meta.total_pages || loadingList}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:pointer-events-none"
              >
                Trang sau
              </button>
            </div>
          </div>
        )}
      </div>

      {cancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setCancelId(null)} />
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md relative">
            <button
              onClick={() => setCancelId(null)}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
            <h2 className="text-lg font-semibold mb-4">Huỷ check-in</h2>
            <p className="text-sm text-gray-600 mb-4">Nhập lý do huỷ (bắt buộc):</p>
            <form onSubmit={handleCancel}>
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Lý do huỷ"
                className="w-full rounded-md border-gray-300 px-3 py-2 text-sm mb-4"
              />
              {cancelError && <p className="text-sm text-red-600 mb-3">{cancelError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setCancelId(null)} className="px-4 py-2 rounded-md border border-gray-300 text-sm">
                  Bỏ qua
                </button>
                <button type="submit" disabled={!cancelReason.trim()} className="px-4 py-2 rounded-md bg-red-600 text-white disabled:opacity-70 text-sm">
                  Xác nhận huỷ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
