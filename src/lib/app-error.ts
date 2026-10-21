export class AppError extends Error {
  readonly extras?: Record<string, unknown>

  constructor(public status: number, message: string, extras?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.extras = extras
  }
}
