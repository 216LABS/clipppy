export class ClipppyError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: string, message: string, status = 400, retryable = false) {
    super(message);
    this.name = "ClipppyError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function isClipppyError(error: unknown): error is ClipppyError {
  return error instanceof ClipppyError || (typeof error === "object" && error !== null && (error as { name?: string }).name === "ClipppyError");
}
