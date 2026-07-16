export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function statusToExitCode(statusCode: number): number {
  if (statusCode === 401) return 2;
  if (statusCode === 404) return 3;
  if (statusCode === 422) return 4;
  if (statusCode >= 500) return 5;
  return 1;
}
