'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { Exception, Result } from '@zxing/library'
import type { IScannerControls } from '@zxing/browser'
import { api } from '@/lib/api'
import { formatVnTime } from '@/lib/format'
import { parseBarcode, parseQrCard } from '@/lib/validation'
import { useSession } from '@/components/session-provider'

interface SessionData {
  id: string
  name: string
  starts_at: Date
  ends_at: Date
  closed_at: Date | null
}

type ScanResult =
  | { kind: 'success'; mssv: string; checkedInAt: string }
  | { kind: 'duplicate'; mssv: string; checkedInAt?: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'network' }
  | { kind: 'error'; message: string }

export default function ScanPage() {
  const { account, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!account) router.replace('/login')
  }, [account, loading, router])

  if (loading || !account) return null

  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)

  // Load open sessions. Staff sees only open sessions from the API; admin sees all,
  // so filter to currently open sessions on the client.
  useEffect(() => {
    api.get('/sessions')
      .then(async (res) => {
        if (!res.ok) return
        const json = await res.json()
        const list: SessionData[] = (json.sessions ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          starts_at: new Date(s.starts_at),
          ends_at: new Date(s.ends_at),
          closed_at: s.closed_at ? new Date(s.closed_at) : null,
        }))
        setSessions(list)
        const now = new Date()
        const open = list.find((s) => !s.closed_at && s.starts_at <= now && s.ends_at >= now)
        if (open) setSelectedSessionId(open.id)
      })
      .finally(() => setLoadingSessions(false))
  }, [])

  useEffect(() => {
    BrowserMultiFormatReader.listVideoInputDevices()
      .then(setDevices)
      .catch(() => setDevices([]))
  }, [])

  const defaultDevice = devices.find((d) => /back|rear|environment|sau/i.test(d.label ?? ''))

  const isOpen = (session: SessionData) => {
    const now = new Date()
    return !session.closed_at && session.starts_at <= now && session.ends_at >= now
  }

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop()
    const video = videoRef.current
    if (video?.srcObject) {
      ;(video.srcObject as MediaStream).getTracks().forEach((track) => track.stop())
      video.srcObject = null
    }
    readerRef.current = null
    controlsRef.current = null
    setScanning(false)
  }, [])

  const onScanResult = useCallback((resultObj: Result | undefined, error: Exception | undefined, controls: IScannerControls) => {
    if (resultObj) {
      controls.stop()
      const raw = resultObj.getText()
      setScanning(false)
      handleCode(raw)
      return
    }
    // NotFoundException is expected while scanning; keep going.
    if (error && !(error.name === 'NotFoundException')) {
      console.error(error)
    }
  }, [])

  const startScanner = useCallback(async () => {
    stopScanner()
    setCameraError(null)
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader
    try {
      const controls = await reader.decodeFromVideoDevice(deviceId ?? undefined, videoRef.current ?? undefined, onScanResult)
      controlsRef.current = controls
      setScanning(true)
    } catch (err: any) {
      setCameraError('Không mở được camera: ' + (err?.message ?? String(err)))
      setScanning(false)
    }
  }, [deviceId, onScanResult, stopScanner])

  useEffect(() => {
    if (videoRef.current && !cameraError) {
      startScanner()
    }
  }, [startScanner, cameraError])

  const handleCode = (raw: string) => {
    setResult(null)
    setScanError(null)

    const mssv = parseBarcode(raw).mssv ?? parseQrCard(raw).mssv
    if (!mssv) {
      setScanError('Mã không hợp lệ hoặc QR không được hỗ trợ')
      return
    }
    if (!selectedSessionId) {
      setScanError('Vui lòng chọn buổi đang mở trước khi quét')
      return
    }

    void postCheckin(selectedSessionId, mssv)
  }

  async function postCheckin(sessionId: string, mssv: string): Promise<void> {
    let res: Response
    try {
      res = await api.post('/checkins', { session_id: sessionId, student_code: mssv })
    } catch {
      setResult({ kind: 'network' })
      return
    }

    if (res.ok) {
      const json = await res.json().catch(() => ({}))
      setResult({ kind: 'success', mssv, checkedInAt: json.checkin?.checked_in_at })
      return
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: { checked_in_at?: string } }
    if (res.status === 409) {
      setResult({ kind: 'duplicate', mssv, checkedInAt: body.detail?.checked_in_at })
      return
    }
    if (res.status === 422) {
      setScanError(body.error ?? 'Mã không hợp lệ hoặc buổi không còn nhận check-in')
      return
    }
    if (res.status === 403) {
      setResult({ kind: 'forbidden', message: body.error ?? 'Tài khoản hết hạn hoặc bị khoá' })
      return
    }
    setResult({ kind: 'error', message: body.error ?? 'Lỗi server, vui lòng quét lại' })
  }

  const resumeScan = () => {
    setResult(null)
    setScanError(null)
    setCameraError(null)
    void startScanner()
  }

  const toggleTorch = async () => {
    const next = !torchOn
    try {
      await controlsRef.current?.switchTorch?.(next)
      setTorchOn(next)
    } catch {
      // torch not supported on this device
    }
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Quét điểm danh</h1>
          <p className="text-sm text-gray-500">Quét mã QR trên thẻ sinh viên hoặc mã vạch. Không nhập tay MSSV.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <label className="text-sm font-medium">Buổi</label>
          <select
            disabled={loadingSessions || !sessions.length}
            value={selectedSessionId ?? ''}
            onChange={(e) => setSelectedSessionId(e.target.value || null)}
            className="rounded-md border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">-- Chọn buổi --</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id} disabled={!isOpen(s)}>
                {s.name} {s.closed_at ? '(đã đóng)' : isOpen(s) ? '(đang mở)' : '(ngoài giờ)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {cameraError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {cameraError}
          {!scanning && (
            <button
              onClick={resumeScan}
              className="mt-2 inline-block text-sm underline text-blue-600"
            >
              Thử mở lại camera
            </button>
          )}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden relative aspect-video bg-gray-100 flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {!scanning && !cameraError && result === null && (
          <button onClick={resumeScan} className="absolute bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg hover:bg-blue-700">
            Bắt đầu quét
          </button>
        )}
        {scanning && !result && !cameraError && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <span className="bg-white/90 px-3 py-1 rounded-md text-sm font-medium shadow">Đang quét… hãy đưa thẻ vào khung hình</span>
            <button
              onClick={toggleTorch}
              className="text-xs underline text-gray-600 hover:text-gray-900"
            >
              {torchOn ? 'Tắt đèn flash' : 'Bật đèn flash'}
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className={`rounded-lg p-4 border ${resultKindClass(result.kind)}`}>
          <h2 className="font-semibold text-sm">{resultTitle(result)}</h2>
          <p className="text-sm">{resultMessage(result)}</p>
          {(result.kind === 'success' || result.kind === 'duplicate') && result.checkedInAt && (
            <p className="text-xs text-gray-500 mt-1">
              {result.kind === 'success' ? 'Giờ điểm danh:' : 'Lần đầu điểm danh:'} {formatVnTime(
                result.checkedInAt,
              )}
            </p>
          )}
          <button onClick={resumeScan} className="mt-3 inline-block text-sm underline text-blue-600">
            Quét tiếp
          </button>
        </div>
      )}

      {scanError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
          {scanError}
          <button onClick={() => { setScanError(null); void startScanner() }} className="ml-auto underline">
            Quét lại
          </button>
        </div>
      )}
    </div>
  )
}

function resultKindClass(kind: ScanResult['kind']): string {
  switch (kind) {
    case 'success': return 'bg-green-50 border-green-200 text-green-800'
    case 'duplicate': return 'bg-amber-50 border-amber-200 text-amber-800'
    case 'forbidden': return 'bg-red-50 border-red-200 text-red-800'
    default: return 'bg-red-50 border-red-200 text-red-800'
  }
}

function resultTitle(result: ScanResult): string {
  switch (result.kind) {
    case 'success': return 'Điểm danh thành công'
    case 'duplicate': return 'MSSV đã điểm danh rồi'
    case 'invalid': return 'Mã không hợp lệ'
    case 'forbidden': return 'Tài khoản không thể điểm danh'
    case 'network': return 'Mất mạng hoặc lỗi kết nối'
    default: return 'Lỗi'
  }
}

function resultMessage(result: ScanResult): string {
  switch (result.kind) {
    case 'success': return `MSSV ${result.mssv} đã được ghi nhận.`
    case 'duplicate': return `MSSV ${result.mssv} đã điểm danh vào buổi này.`
    case 'invalid': return result.message
    case 'forbidden': return `${result.message} — liên hệ Admin.`
    case 'network': return 'Vui lòng kiểm tra kết nối và quét lại khi đã có mạng.'
    default: return result.message
  }
}
