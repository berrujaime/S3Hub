// Pure domain module: maps AWS S3 SDK / HTTP errors to stable i18n keys.
// No React, AWS SDK, or Expo imports — fully unit-testable.
// The caller is responsible for the actual i18n.t(key) lookup.

const NAME_TO_KEY = {
  InvalidAccessKeyId: 'errorInvalidCredentials',
  SignatureDoesNotMatch: 'errorInvalidCredentials',
  // Signature/clock-skew errors: the request itself was rejected because its
  // signature or timestamp is no longer valid, not because of a transport
  // failure — closer to a credentials problem than a network one.
  SignatureExpired: 'errorInvalidCredentials',
  ExpiredToken: 'errorInvalidCredentials',
  RequestTimeTooSkewed: 'errorInvalidCredentials',
  AccessDenied: 'errorAccessDenied',
  NoSuchBucket: 'errorBucketNotFound',
  NetworkingError: 'errorNetwork',
  TimeoutError: 'errorNetwork',
};

// Message substrings that indicate a connectivity/offline failure when the
// SDK error carries no recognized name (e.g. React Native's fetch layer
// throws a plain Error with no $metadata when the device has no network).
// Deliberately narrow: an error lacking both a known name and a status code
// is NOT automatically a network failure (see the "no usable status code"
// comment below) — it must say so.
const NETWORK_MESSAGE_PATTERN = /network|offline/i;

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

  // 3. Connectivity/offline indicators in the message — independent of
  //    whether a status code is present, since a plain connectivity error
  //    (e.g. RN's "Network request failed") never gets one.
  if (NETWORK_MESSAGE_PATTERN.test(message)) {
    return 'errorNetwork';
  }

  // 4. Anything else, including an unknown error with no usable status code
  //    (NOT automatically a network failure — e.g. a malformed request).
  return 'errorGeneric';
}
