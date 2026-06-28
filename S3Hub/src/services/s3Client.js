// src/services/s3Client.js
import { S3Client } from "@aws-sdk/client-s3";
import { getProvider } from "../domain/providers";

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
  const region = connection.region || provider.defaultRegion || "us-east-1";

  const s3Client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: provider.forcePathStyle,
  });

  return s3Client;
};
