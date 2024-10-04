// src/services/s3Client.js
import { S3Client } from "@aws-sdk/client-s3";

/**
 * Configura el cliente de S3 para usar el endpoint correcto.
 * @param {Object} connection - Datos de conexión.
 * @returns {S3Client} - Instancia configurada de S3Client.
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
    forcePathStyle: service === 'storj', // Necesario para Storj
  });

  return s3Client;
};
