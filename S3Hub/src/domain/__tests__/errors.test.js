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
      expect(
        mapS3Error({ name: 'Forbidden', $metadata: { httpStatusCode: 403 } })
      ).toBe('errorAccessDenied');
    });
  });

  describe('bucket not found', () => {
    it("maps NoSuchBucket to 'errorBucketNotFound'", () => {
      expect(mapS3Error({ name: 'NoSuchBucket' })).toBe('errorBucketNotFound');
    });

    it("maps httpStatusCode 404 to 'errorBucketNotFound'", () => {
      expect(
        mapS3Error({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })
      ).toBe('errorBucketNotFound');
    });
  });

  describe('network errors', () => {
    it("maps NetworkingError to 'errorNetwork'", () => {
      expect(mapS3Error({ name: 'NetworkingError' })).toBe('errorNetwork');
    });

    it("maps TimeoutError to 'errorNetwork'", () => {
      expect(mapS3Error({ name: 'TimeoutError' })).toBe('errorNetwork');
    });

    it("maps a message containing 'Network' to 'errorNetwork'", () => {
      expect(mapS3Error({ message: 'Network request failed' })).toBe('errorNetwork');
    });

    it("maps an error with no $metadata and no httpStatusCode to 'errorNetwork'", () => {
      expect(mapS3Error({ message: 'connection refused' })).toBe('errorNetwork');
    });
  });

  describe('generic / fallback', () => {
    it("maps an unknown named error (with metadata) to 'errorGeneric'", () => {
      expect(
        mapS3Error({ name: 'InternalError', $metadata: { httpStatusCode: 500 } })
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
      expect(
        mapS3Error({ name: 'NoSuchBucket', $metadata: { httpStatusCode: 403 } })
      ).toBe('errorBucketNotFound');
    });
  });
});
