// Pure domain module: maps AWS S3 SDK / HTTP errors to stable i18n keys.
// No React, AWS SDK, or Expo imports — fully unit-testable.
// The caller is responsible for the actual i18n.t(key) lookup.

const NAME_TO_KEY = {
  InvalidAccessKeyId: 'errorInvalidCredentials',
  SignatureDoesNotMatch: 'errorInvalidCredentials',
  AccessDenied: 'errorAccessDenied',
  NoSuchBucket: 'errorBucketNotFound',
  NetworkingError: 'errorNetwork',
  TimeoutError: 'errorNetwork',
};

/**
 * Map an S3 SDK error to a stable, user-friendly i18n key.
 * @param {unknown} error - The error thrown by the AWS S3 SDK (may be null/undefined).
 * @returns {string} One of the error i18n keys.
 */
export function mapS3Error(error) {
  if (!error || typeof error !== 'object') {
    return 'errorGeneric';
  }

  const name = typeof error.name === 'string' ? error.name : undefined;
  const message = typeof error.message === 'string' ? error.message : '';
  const httpStatusCode = error.$metadata ? error.$metadata.httpStatusCode : undefined;

  // 1. Known error names take precedence over HTTP status codes.
  if (name && NAME_TO_KEY[name]) {
    return NAME_TO_KEY[name];
  }

  // 2. HTTP status codes.
  if (httpStatusCode === 403) {
    return 'errorAccessDenied';
  }
  if (httpStatusCode === 404) {
    return 'errorBucketNotFound';
  }

  // 3. Network errors: no usable status code, or a network-ish message.
  if (httpStatusCode === undefined) {
    return 'errorNetwork';
  }
  if (message.includes('Network')) {
    return 'errorNetwork';
  }

  // 4. Anything else.
  return 'errorGeneric';
}
