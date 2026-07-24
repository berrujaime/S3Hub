// src/services/authService.js
import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { getS3Client } from './s3Client';

/**
 * Validates credentials by attempting to list buckets. Any response that
 * doesn't throw is treated as valid — including an account with zero (or
 * no) buckets, since a successful empty response is not an auth failure.
 * Errors are rethrown as-is (never swallowed into a `false` return) so the
 * caller maps them via domain/errors.mapS3Error instead of this module
 * duplicating error-name checks.
 * @param {Object} authData - Authentication data.
 * @returns {Promise<boolean>} True when the credentials are valid.
 */
export const validateCredentials = async (authData) => {
  const s3Client = getS3Client(authData);
  await s3Client.send(new ListBucketsCommand({}));
  return true;
};
