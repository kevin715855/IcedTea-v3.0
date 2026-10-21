import type { Metadata } from 'next'
import { SessionProvider } from '@/components/session-provider'
import { Nav } from '@/components/nav'

export const metadata: Metadata = {
  title: 'IceTea — Điểm danh QR/Barcode',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>
          <Nav />
          <main className="max-w-5xl mx-auto pt-20 pb-8 px-4">{children}</main>
        </SessionProvider>
      </body>
    </html>
  )
}
