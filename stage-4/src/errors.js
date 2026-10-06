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
export const authorizationNotOpen = () =>
  new ApiError(409, 'authorization_not_open', 'the authorization is not open');
export const authorizationExpired = () =>
  new ApiError(409, 'authorization_expired', 'the authorization has expired');
export const captureExceedsAuthorization = () =>
  new ApiError(422, 'capture_exceeds_authorization', 'amount is above the uncaptured remainder');
export const staleRevision = () =>
  new ApiError(409, 'stale_revision', 'expected_revision is not the payment\'s current revision');
export const historicalOverdraft = () =>
  new ApiError(409, 'historical_overdraft', 'the correction would make a balance negative at some point in the past');
export const linkedPaymentImmutable = () =>
  new ApiError(422, 'linked_payment_immutable', 'this payment cannot be corrected here');
export const refundExceedsPayment = () =>
  new ApiError(422, 'refund_exceeds_payment', 'refunds would exceed the payment\'s current amount');
export const invalidRefundTarget = () =>
  new ApiError(422, 'invalid_refund_target', 'a refund cannot be refunded');
export const incompleteSettlement = () =>
  new ApiError(422, 'incomplete_settlement', 'a batch that corrects a settlement member must correct every member');
export const selfRequest = () => new ApiError(422, 'self_request', 'cannot request from yourself');
