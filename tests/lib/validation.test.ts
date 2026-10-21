import { describe, it, expect } from 'vitest'
import { validateMssv, parseQrCard, parseBarcode } from '@/lib/validation'

describe('validateMssv', () => {
  it('accepts 8-digit code for year <= 2023', () => {
    const r = validateMssv('20230001')
    expect(r.valid).toBe(true)
    expect(r.mssv).toBe('20230001')
  })

  it('accepts 8-digit code for year 2022', () => {
    const r = validateMssv('20220001')
    expect(r.valid).toBe(true)
  })

  it('accepts 9-digit code for year >= 2024', () => {
    const r = validateMssv('202400001')
    expect(r.valid).toBe(true)
    expect(r.mssv).toBe('202400001')
  })

  it('rejects wrong length for year 2024 (8 digits instead of 9)', () => {
    expect(validateMssv('20240001').valid).toBe(false)
  })

  it('rejects wrong length for year 2023 (9 digits instead of 8)', () => {
    expect(validateMssv('202300001').valid).toBe(false)
  })

  it('rejects non-digit characters', () => {
    expect(validateMssv('abc12345').valid).toBe(false)
    expect(validateMssv('2023-001').valid).toBe(false)
  })
})

describe('parseQrCard', () => {
  it('extracts MSSV from a card QR URL', () => {
    const r = parseQrCard('https://ctsv.hust.edu.vn/#/card/20230001/details')
    expect(r.valid).toBe(true)
    expect(r.mssv).toBe('20230001')
  })

  it('extracts MSSV with no trailing path', () => {
    const r = parseQrCard('https://ctsv.hust.edu.vn/#/card/202400001')
    expect(r.valid).toBe(true)
    expect(r.mssv).toBe('202400001')
  })

  it('rejects wrong host', () => {
    const r = parseQrCard('https://example.com/#/card/20230001')
    expect(r.valid).toBe(false)
    expect(r.error).toBe('QR không hỗ trợ')
  })

  it('rejects invalid URL', () => {
    expect(parseQrCard('not a url').valid).toBe(false)
  })

  it('rejects missing card segment', () => {
    const r = parseQrCard('https://ctsv.hust.edu.vn/#/other/20230001')
    expect(r.valid).toBe(false)
  })
})

describe('parseBarcode', () => {
  it('accepts a raw MSSV barcode', () => {
    const r = parseBarcode('20230001')
    expect(r.valid).toBe(true)
    expect(r.mssv).toBe('20230001')
  })

  it('accepts 9-digit barcode for year >= 2024', () => {
    const r = parseBarcode('202400001')
    expect(r.valid).toBe(true)
    expect(r.mssv).toBe('202400001')
  })

  it('trims surrounding whitespace', () => {
    const r = parseBarcode('  20230001  ')
    expect(r.valid).toBe(true)
    expect(r.mssv).toBe('20230001')
  })

  it('rejects wrong length', () => {
    expect(parseBarcode('20240001').valid).toBe(false)
  })

  it('rejects non-digit characters', () => {
    expect(parseBarcode('abc12345').valid).toBe(false)
    expect(parseBarcode('2023-001').valid).toBe(false)
  })

  it('rejects empty input', () => {
    expect(parseBarcode('').valid).toBe(false)
    expect(parseBarcode('   ').valid).toBe(false)
  })
})
