import { validateCredentials } from '../authService';
import { getS3Client } from '../s3Client';

jest.mock('../s3Client', () => ({
  getS3Client: jest.fn(),
}));

const authData = { service: 'aws', accessKey: 'A', secretKey: 'S', region: 'us-east-1' };

const makeClient = (impl) => ({ send: jest.fn(impl) });

afterEach(() => {
  getS3Client.mockReset();
});

describe('validateCredentials', () => {
  it('returns true when ListBuckets resolves with buckets', async () => {
    const client = makeClient(async () => ({ Buckets: [{ Name: 'a' }] }));
    getS3Client.mockReturnValue(client);

    await expect(validateCredentials(authData)).resolves.toBe(true);
  });

  it('returns true for an account with zero buckets (an empty array is still a successful response)', async () => {
    const client = makeClient(async () => ({ Buckets: [] }));
    getS3Client.mockReturnValue(client);

    await expect(validateCredentials(authData)).resolves.toBe(true);
  });

  it('returns true even when the response has no Buckets field at all (still a successful, non-error response)', async () => {
    const client = makeClient(async () => ({}));
    getS3Client.mockReturnValue(client);

    await expect(validateCredentials(authData)).resolves.toBe(true);
  });

  it('rethrows an InvalidAccessKeyId error instead of swallowing it into a false return', async () => {
    const sdkError = Object.assign(new Error('bad key'), { name: 'InvalidAccessKeyId' });
    const client = makeClient(async () => {
      throw sdkError;
    });
    getS3Client.mockReturnValue(client);

    await expect(validateCredentials(authData)).rejects.toBe(sdkError);
  });

  it('rethrows an AccessDenied error instead of swallowing it into a false return', async () => {
    const sdkError = Object.assign(new Error('denied'), { name: 'AccessDenied' });
    const client = makeClient(async () => {
      throw sdkError;
    });
    getS3Client.mockReturnValue(client);

    await expect(validateCredentials(authData)).rejects.toBe(sdkError);
  });

  it('rethrows an unrecognized error unchanged, for the caller to map via mapS3Error', async () => {
    const sdkError = Object.assign(new Error('boom'), { name: 'InternalError' });
    const client = makeClient(async () => {
      throw sdkError;
    });
    getS3Client.mockReturnValue(client);

    await expect(validateCredentials(authData)).rejects.toBe(sdkError);
  });
});
