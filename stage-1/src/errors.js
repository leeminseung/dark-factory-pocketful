// Every 4xx/5xx leaves the service as one ApiError: an HTTP status plus a §5 error code.

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const malformed = (message = 'request body is malformed') =>
  new ApiError(400, 'malformed_request', message);
export const missingIdempotencyKey = () =>
  new ApiError(400, 'missing_idempotency_key', 'Idempotency-Key header is required');
export const unauthenticated = (message = 'authentication required') =>
  new ApiError(401, 'unauthenticated', message);
export const forbidden = (message = 'not permitted') => new ApiError(403, 'forbidden', message);
export const notFound = (message = 'not found') => new ApiError(404, 'not_found', message);
export const idempotencyKeyReuse = () =>
  new ApiError(409, 'idempotency_key_reuse', 'key already used with a different request body');
export const insufficientFunds = () =>
  new ApiError(409, 'insufficient_funds', 'balance is below the amount');
export const requestNotPending = () =>
  new ApiError(409, 'request_not_pending', 'the request is not pending');
export const emailTaken = () => new ApiError(409, 'email_taken', 'email already registered');
export const handleTaken = () => new ApiError(409, 'handle_taken', 'derived handle already taken');
export const invalid = (message = 'validation failed') =>
  new ApiError(422, 'validation_failed', message);
export const selfPayment = () => new ApiError(422, 'self_payment', 'cannot pay yourself');
export const selfRequest = () => new ApiError(422, 'self_request', 'cannot request from yourself');
