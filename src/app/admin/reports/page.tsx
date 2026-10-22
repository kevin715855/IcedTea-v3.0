'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatVnTime } from '@/lib/format'
import { useSession } from '@/components/session-provider'

interface SessionData {
  id: string
  name: string
  starts_at: Date
  ends_at: Date
  closed_at: Date | null
}

interface StaffReport {
  staff_id: string
  username: string | null
  checkin_count: number
  first_checkin: Date | null
  last_checkin: Date | null
  shortest_interval_minutes: number | null
}

interface SessionReport {
  session: {
    id: string
    name: string
    starts_at: Date
    ends_at: Date
    closed_at: Date | null
  }
  total_checkins: number
  staff: StaffReport[]
}

export default function ReportsPage() {
  const { account, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!account) router.replace('/login')
    if (account && account.role !== 'admin') router.replace('/scan')
  }, [account, loading, router])

  if (loading || !account) return null

  const [sessions, setSessions] = useState<SessionData[]>([])
  const [report, setReport] = useState<SessionReport | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState('')

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
        })),
      )
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const loadReport = useCallback(async (id: string) => {
    setReport(null)
    setError('')
    setLoadingReport(true)
    try {
      const res = await api.get(`/sessions/${id}/report`)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Không thể tải báo cáo')
        return
      }
      setReport(await res.json())
    } catch {
      setError('Mất kết nối, vui lòng thử lại')
    } finally {
      setLoadingReport(false)
    }
  }, [])

  const handleSessionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value
    setSelectedId(id)
    if (id) loadReport(id)
  }

  const handleCsv = () => {
    if (!selectedId) return
    window.location.href = `/api/v1/sessions/${selectedId}/report?format=csv`
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Báo cáo buổi</h1>
          <p className="text-sm text-gray-500">
            Xem tổng hợp check-in và số liệu theo nhân viên của một buổi. Dữ liệu chỉ tính
            lượt check-in chưa bị huỷ.
          </p>
        </div>
        <button
          onClick={handleCsv}
          disabled={!selectedId || loadingReport}
          className={`px-4 py-2 rounded-md text-sm ${!selectedId || loadingReport ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          Xuất CSV
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Chọn buổi</label>
            <select
              value={selectedId}
              onChange={handleSessionChange}
              disabled={loadingList}
              className="mt-1 w-full sm:w-80 rounded-md border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">-- Chọn một buổi --</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatVnTime(s.starts_at)} → {formatVnTime(s.ends_at)})
                  {s.closed_at ? ' · đã đóng' : ''}
                </option>
              ))}
            </select>
            {loadingList && <span className="ml-2 text-xs text-gray-500">Đang tải…</span>}
          </div>
        </div>
      </div>

      {report && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold">{report.session.name}</h2>
            <p className="text-xs text-gray-500">
              {formatVnTime(report.session.starts_at)} → {formatVnTime(report.session.ends_at)}
              {report.session.closed_at ? ` · đóng lúc ${formatVnTime(report.session.closed_at)}` : ''}
            </p>
          </div>
          <div className="px-4 py-3 text-sm">
            <span className="font-semibold">Tổng lượt check-in: </span>
            <span className="ml-1">{report.total_checkins}</span>
          </div>
          <table className="w-full text-left text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">Mã nhân viên</th>
                <th className="px-4 py-3 font-medium text-gray-600">Tên đăng nhập</th>
                <th className="px-4 py-3 font-medium text-gray-600">Số lượt</th>
                <th className="px-4 py-3 font-medium text-gray-600">Giờ đầu</th>
                <th className="px-4 py-3 font-medium text-gray-600">Giờ cuối</th>
                <th className="px-4 py-3 font-medium text-gray-600">Khoảng cách ngắn nhất (phút)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {report.staff.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                    Chưa có lượt check-in nào trong buổi này.
                  </td>
                </tr>
              )}
              {report.staff.map((s) => (
                <tr key={s.staff_id}>
                  <td className="px-4 py-3">{s.staff_id}</td>
                  <td className="px-4 py-3">{s.username ?? '—'}</td>
                  <td className="px-4 py-3">{s.checkin_count}</td>
                  <td className="px-4 py-3">{s.first_checkin ? formatVnTime(s.first_checkin) : '—'}</td>
                  <td className="px-4 py-3">{s.last_checkin ? formatVnTime(s.last_checkin) : '—'}</td>
                  <td className="px-4 py-3">
                    {s.shortest_interval_minutes === null ? '—' : String(s.shortest_interval_minutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loadingReport && (
            <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-200">Đang tải…</div>
          )}
        </div>
      )}

      {!report && !error && !loadingReport && selectedId === '' && (
        <p className="text-sm text-gray-500">Chọn một buổi ở trên để xem báo cáo.</p>
      )}
    </div>
  )
}
