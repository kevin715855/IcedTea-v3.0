import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1, 'Tên đăng nhập không được để trống'),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
})

export function validateMssv(code: string): { valid: boolean; mssv?: string; error?: string } {
  if (!/^\d+$/.test(code)) {
    return { valid: false, error: 'Mã không hợp lệ' }
  }
  const year = Number(code.slice(0, 4))
  const expectedLength = year <= 2023 ? 8 : 9
  if (code.length !== expectedLength) {
    return { valid: false, error: 'Mã không hợp lệ' }
  }
  return { valid: true, mssv: code }
}

export function parseBarcode(raw: string): { valid: boolean; mssv?: string; error?: string } {
  const code = raw.trim()
  return validateMssv(code)
}

export function parseQrCard(raw: string): { valid: boolean; mssv?: string; error?: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { valid: false, error: 'QR không hỗ trợ' }
  }
  if (url.hostname !== 'ctsv.hust.edu.vn') {
    return { valid: false, error: 'QR không hỗ trợ' }
  }
  const parts = url.hash.replace(/^#*/, '').split('/')
  const cardIdx = parts.indexOf('card')
  if (cardIdx === -1 || cardIdx + 1 >= parts.length) {
    return { valid: false, error: 'QR không hỗ trợ' }
  }
  const mssv = parts[cardIdx + 1]
  return validateMssv(mssv)
}
