// src/services/s3Client.js
import { S3Client } from "@aws-sdk/client-s3";

/**
 * Configure the S3Client instance.
 * @param {Object} connection - Connection data.
 * @returns {S3Client} - Configured S3Client instance.
 */
export const getS3Client = (connection) => {
  const { accessKey, secretKey, region, service } = connection;

  let endpoint;
  if (service === 'storj') {
    endpoint = "https://gateway.storjshare.io";
  } else if (service === 'aws') {
    endpoint = `https://s3.${region}.amazonaws.com`;
  }

  const s3Client = new S3Client({
    region: region || "us-east-1",
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: service === 'storj', // Necessary for Storj
  });

  return s3Client;
};
