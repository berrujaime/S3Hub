// src/services/s3Client.js
import { S3Client } from '@aws-sdk/client-s3';
import { getProvider } from '../domain/providers';

const isDefaultPort = (protocol, port) =>
  (protocol === 'https:' && Number(port) === 443) || (protocol === 'http:' && Number(port) === 80);

/**
 * Restores the explicit port in the `host` header before signing.
 *
 * The pinned @aws-sdk 3.121 (see CLAUDE.md — cannot be bumped) sets
 * `host` to the bare hostname in its hostHeaderMiddleware, silently
 * dropping any non-default port. HTTP clients (fetch/OkHttp/curl) send
 * `Host: hostname:port` for such endpoints, so the server recomputes the
 * signature over a different host value and rejects the request with 403
 * SignatureDoesNotMatch. This breaks presigned GET/PUT URLs against
 * custom endpoints with a port — e.g. a self-hosted MinIO at
 * http://host:9000 — while leaving port-less providers (all built-in
 * ones) untouched. Later SDK versions fixed this upstream.
 *
 * Exported for unit testing only.
 */
export const hostWithPortMiddleware = (next) => async (args) => {
  const { request } = args;
  if (
    request?.port &&
    !isDefaultPort(request.protocol, request.port) &&
    typeof request.headers?.host === 'string' &&
    !request.headers.host.includes(':')
  ) {
    request.headers.host = `${request.hostname}:${request.port}`;
  }
  return next(args);
};

/**
 * Configure the S3Client instance.
 *
 * Endpoint, region and path-style are derived from the provider registry
 * (src/domain/providers.js) — the single source of truth — rather than
 * hardcoded per-service branches. Backward compatible with connections that
 * only store { accessKey, secretKey, service, region } for 'aws' / 'storj'.
 *
 * @param {Object} connection - Connection data.
 * @returns {S3Client} - Configured S3Client instance.
 */
export const getS3Client = (connection) => {
  const { accessKey, secretKey } = connection;

  const provider = getProvider(connection.service);
  const endpoint = provider.buildEndpoint(connection) || connection.endpoint;
  const region = connection.region || provider.defaultRegion || 'us-east-1';

  const s3Client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: provider.forcePathStyle,
  });

  // Must run after the SDK's own hostHeaderMiddleware (which writes the
  // port-less value this corrects) and before signing.
  s3Client.middlewareStack.addRelativeTo(hostWithPortMiddleware, {
    name: 'hostWithPortMiddleware',
    relation: 'after',
    toMiddleware: 'hostHeaderMiddleware',
  });

  return s3Client;
};
