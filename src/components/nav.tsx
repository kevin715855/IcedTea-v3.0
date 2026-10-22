'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from './session-provider'

function activeClass(pathname: string | null, href: string): string {
  return pathname === href ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'
}

export function Nav() {
  const { account, loading, signOut } = useSession()
  const pathname = usePathname()

  if (loading) {
    return (
      <nav className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 z-20">
        <span className="text-sm text-gray-500">Đang tải…</span>
      </nav>
    )
  }

  const isAdmin = account?.role === 'admin'

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 z-20 flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-2">
      {!account ? (
        <Link href="/login" className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 text-white">
          Đăng nhập
        </Link>
      ) : (
        <>
          <Link
            href="/scan"
            className={`px-3 py-2 rounded-md text-sm font-medium ${activeClass(pathname, '/scan')}`}
          >
            Quét điểm danh
          </Link>
          <Link
            href="/checkins"
            className={`px-3 py-2 rounded-md text-sm font-medium ${activeClass(pathname, '/checkins')}`}
          >
            Lịch sử điểm danh
          </Link>
          {isAdmin && (
            <>
              <Link
                href="/admin/sessions"
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeClass(pathname, '/admin/sessions')}`}
              >
                Quản lý buổi
              </Link>
              <Link
                href="/admin/users"
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeClass(pathname, '/admin/users')}`}
              >
                Tài khoản Staff
              </Link>
              <Link
                href="/admin/reports"
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeClass(pathname, '/admin/reports')}`}
              >
                Báo cáo
              </Link>
            </>
          )}
          <span className="ml-auto text-xs text-gray-500">{account?.username} ({account?.role})</span>
          <button
            onClick={() => void signOut()}
            className="px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Đăng xuất
          </button>
        </>
      )}
    </nav>
  )
}
