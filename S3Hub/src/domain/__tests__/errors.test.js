import { mapS3Error } from '../errors';

describe('mapS3Error', () => {
  describe('invalid credentials', () => {
    it("maps InvalidAccessKeyId to 'errorInvalidCredentials'", () => {
      expect(mapS3Error({ name: 'InvalidAccessKeyId' })).toBe('errorInvalidCredentials');
    });

    it("maps SignatureDoesNotMatch to 'errorInvalidCredentials'", () => {
      expect(mapS3Error({ name: 'SignatureDoesNotMatch' })).toBe('errorInvalidCredentials');
    });
  });

  describe('access denied', () => {
    it("maps AccessDenied to 'errorAccessDenied'", () => {
      expect(mapS3Error({ name: 'AccessDenied' })).toBe('errorAccessDenied');
    });

    it("maps httpStatusCode 403 to 'errorAccessDenied'", () => {
      expect(mapS3Error({ name: 'Forbidden', $metadata: { httpStatusCode: 403 } })).toBe(
        'errorAccessDenied',
      );
    });
  });

  describe('bucket not found', () => {
    it("maps NoSuchBucket to 'errorBucketNotFound'", () => {
      expect(mapS3Error({ name: 'NoSuchBucket' })).toBe('errorBucketNotFound');
    });

    it("maps httpStatusCode 404 to 'errorBucketNotFound'", () => {
      expect(mapS3Error({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })).toBe(
        'errorBucketNotFound',
      );
    });
  });

  describe('network errors', () => {
    it("maps NetworkingError to 'errorNetwork'", () => {
      expect(mapS3Error({ name: 'NetworkingError' })).toBe('errorNetwork');
    });

    it("maps TimeoutError to 'errorNetwork'", () => {
      expect(mapS3Error({ name: 'TimeoutError' })).toBe('errorNetwork');
    });

    it("maps a message containing 'Network' (no name, no $metadata) to 'errorNetwork'", () => {
      expect(mapS3Error({ message: 'Network request failed' })).toBe('errorNetwork');
    });

    it("maps a message containing 'network' case-insensitively to 'errorNetwork'", () => {
      expect(mapS3Error({ message: 'network error occurred' })).toBe('errorNetwork');
    });

    it("maps a message containing 'offline' to 'errorNetwork'", () => {
      expect(mapS3Error({ message: 'The Internet connection appears to be offline.' })).toBe(
        'errorNetwork',
      );
    });
  });

  describe('signature / clock-skew errors', () => {
    it("maps SignatureExpired to 'errorInvalidCredentials'", () => {
      expect(mapS3Error({ name: 'SignatureExpired' })).toBe('errorInvalidCredentials');
    });

    it("maps ExpiredToken to 'errorInvalidCredentials'", () => {
      expect(mapS3Error({ name: 'ExpiredToken' })).toBe('errorInvalidCredentials');
    });

    it("maps RequestTimeTooSkewed to 'errorInvalidCredentials'", () => {
      expect(mapS3Error({ name: 'RequestTimeTooSkewed' })).toBe('errorInvalidCredentials');
    });
  });

  describe('generic / fallback', () => {
    it("maps an unknown named error (with metadata) to 'errorGeneric'", () => {
      expect(mapS3Error({ name: 'InternalError', $metadata: { httpStatusCode: 500 } })).toBe(
        'errorGeneric',
      );
    });

    it("maps an unknown no-status error with a non-network message to 'errorGeneric' (previously mis-mapped to errorNetwork)", () => {
      expect(mapS3Error({ message: 'connection refused' })).toBe('errorGeneric');
    });

    it("maps a plain Error with no name/$metadata match (e.g. the listAllObjects truncation guard) to 'errorGeneric'", () => {
      expect(
        mapS3Error(new Error('S3 listing reported truncation without a continuation token')),
      ).toBe('errorGeneric');
    });

    it("maps null to 'errorGeneric'", () => {
      expect(mapS3Error(null)).toBe('errorGeneric');
    });

    it("maps undefined to 'errorGeneric'", () => {
      expect(mapS3Error(undefined)).toBe('errorGeneric');
    });
  });

  describe('precedence', () => {
    it('prefers the error name over the http status code', () => {
      expect(mapS3Error({ name: 'NoSuchBucket', $metadata: { httpStatusCode: 403 } })).toBe(
        'errorBucketNotFound',
      );
    });
  });
});
