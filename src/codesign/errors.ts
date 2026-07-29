export const ERROR_CODES = [
  'INVALID_SHARING_URL',
  'NEED_PASSWORD',
  'INVALID_PASSWORD',
  'NEED_LOGIN',
  'SHARING_NOT_FOUND',
  'SHARING_FETCH_FAILED',
  'SCREEN_SELECTOR_REQUIRED',
  'SCREEN_NOT_FOUND',
  'META_FETCH_FAILED',
  'META_SCHEMA_MISMATCH',
  'INVALID_SELECTION',
  'INVALID_PLATFORM',
  'REMOTE_URL_NOT_ALLOWED',
  'PROFILE_DIR_UNSAFE',
  'SLICE_FETCH_FAILED',
  'SLICE_NOT_FOUND',
  'ARTIFACT_PATH_INVALID',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class CodesignError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CodesignError';
    this.code = code;
    this.details = details;
  }

  toJSON(): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
    const out: { code: ErrorCode; message: string; details?: Record<string, unknown> } = {
      code: this.code,
      message: this.message,
    };
    if (this.details) out.details = this.details;
    return out;
  }
}

export function isCodesignError(err: unknown): err is CodesignError {
  return err instanceof CodesignError;
}
