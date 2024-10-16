// src/services/s3Service.js
import {
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getAWSSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "./s3Client";

/**
 * Lists available buckets.
 * @param {Object} connection - User connection data.
 * @returns {Array} List of buckets.
 */
export const listBuckets = async (connection) => {
  try {
    const s3Client = getS3Client(connection);
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);

    if (connection.service === 'storj') {
      // Storj returns all buckets, no need to filter
      return response.Buckets;
    } else {
      // For AWS S3, you could filter buckets by region if necessary
      return response.Buckets;
    }
  } catch (error) {
    console.error("Error listing buckets:", error);
    throw error;
  }
};

/**
 * Lists the objects within a bucket.
 * @param {Object} connection - User connection data.
 * @param {string} bucketName - Bucket name.
 * @param {string} [prefix] - Optional prefix to filter objects.
 * @returns {Object} AWS S3 response.
 */
export const listObjects = async (connection, bucketName, prefix = '') => {
  try {
    const s3Client = getS3Client(connection);
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    });
    const response = await s3Client.send(command);
    return response;
  } catch (error) {
    console.error("Error listing objects:", error);
    throw error;
  }
};

/**
 * Uploads a file to an S3 bucket.
 * @param {Object} connection - User connection data.
 * @param {string} bucketName - Bucket name.
 * @param {Object} file - File to upload.
 * @returns {Object} AWS S3 response.
 */
export const uploadFile = async (connection, bucketName, file) => {
  try {
    const s3Client = getS3Client(connection);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: file.name,
      Body: file.content,
      ContentType: file.mimeType,
    });
    const response = await s3Client.send(command);
    return response;
  } catch (error) {
    console.error("Error uploading the file:", error);
    throw error;
  }
};

/**
 * Gets a signed URL for an object in S3.
 * @param {Object} connection - User connection data.
 * @param {string} bucketName - Bucket name.
 * @param {string} key - Object key.
 * @returns {string} Signed URL.
 */
export const getSignedUrl = async (connection, bucketName, key) => {
  try {
    const s3Client = getS3Client(connection);
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const url = await getAWSSignedUrl(s3Client, command, { expiresIn: 3600 });
    return url;
  } catch (error) {
    console.error("Error obtaining the signed URL:", error);
    throw error;
  }
};
