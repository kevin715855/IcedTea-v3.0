const VN_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

const VN_TIME_ONLY: Intl.DateTimeFormatOptions = {
  ...VN_OPTIONS,
  day: undefined,
  month: undefined,
  year: undefined,
}

export function formatVnTime(value: string | Date): string {
  return new Date(value).toLocaleString('vi-VN', VN_OPTIONS)
}

export function formatVnTimeOnly(value: string | Date): string {
  return new Date(value).toLocaleString('vi-VN', VN_TIME_ONLY)
}

// datetime-local input value is local time; treat it as Asia/Ho_Chi_Minh.
export function toVnIso(dateTimeLocal: string): string {
  return `${dateTimeLocal}:00+07:00`
}

// Render a UTC instant as a browser-local datetime-local string.
export function toLocalDateTime(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
