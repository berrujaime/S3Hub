// Unit tests for the s3Client factory's host-with-port middleware.
//
// The pinned @aws-sdk 3.121 drops the explicit port when it writes the
// `host` header (hostHeaderMiddleware sets it to the bare hostname), which
// breaks signature verification against custom endpoints with a port
// (self-hosted MinIO et al.) — see hostWithPortMiddleware in s3Client.js.
// These tests drive the middleware directly with the minimal request shape
// the SDK hands it at the `build` step.

import { getS3Client, hostWithPortMiddleware } from '../s3Client';

const runMiddleware = async (request) => {
  const next = jest.fn().mockResolvedValue('handled');
  const args = { request };
  const result = await hostWithPortMiddleware(next)(args);
  expect(next).toHaveBeenCalledWith(args);
  expect(result).toBe('handled');
  return request;
};

describe('hostWithPortMiddleware', () => {
  it('appends a non-default port to the signed host header', async () => {
    const request = await runMiddleware({
      protocol: 'http:',
      hostname: 'minio.local',
      port: 9000,
      headers: { host: 'minio.local' },
    });
    expect(request.headers.host).toBe('minio.local:9000');
  });

  it('leaves the host untouched when the endpoint has no port', async () => {
    const request = await runMiddleware({
      protocol: 'https:',
      hostname: 's3.us-east-1.amazonaws.com',
      headers: { host: 's3.us-east-1.amazonaws.com' },
    });
    expect(request.headers.host).toBe('s3.us-east-1.amazonaws.com');
  });

  it('leaves default ports out of the host header (clients omit them too)', async () => {
    const https = await runMiddleware({
      protocol: 'https:',
      hostname: 'gateway.example',
      port: 443,
      headers: { host: 'gateway.example' },
    });
    expect(https.headers.host).toBe('gateway.example');

    const http = await runMiddleware({
      protocol: 'http:',
      hostname: 'gateway.example',
      port: 80,
      headers: { host: 'gateway.example' },
    });
    expect(http.headers.host).toBe('gateway.example');
  });

  it('does not double-append when the host already carries a port', async () => {
    const request = await runMiddleware({
      protocol: 'http:',
      hostname: 'minio.local',
      port: 9000,
      headers: { host: 'minio.local:9000' },
    });
    expect(request.headers.host).toBe('minio.local:9000');
  });

  it('passes through requests without a host header or without a request', async () => {
    const request = await runMiddleware({
      protocol: 'http:',
      hostname: 'minio.local',
      port: 9000,
      headers: {},
    });
    expect(request.headers.host).toBeUndefined();

    const next = jest.fn().mockResolvedValue('handled');
    await expect(hostWithPortMiddleware(next)({ request: undefined })).resolves.toBe('handled');
  });
});

describe('getS3Client', () => {
  it('registers the middleware on every built client', () => {
    const client = getS3Client({
      service: 'custom',
      endpoint: 'http://10.0.2.2:9000',
      accessKey: 'AKIA-TEST',
      secretKey: 'test-secret',
    });
    // remove(name) returns true only if a middleware with that name was
    // registered (identify() does not exist in the pinned SDK version).
    expect(client.middlewareStack.remove('hostWithPortMiddleware')).toBe(true);
  });
});
