// src/services/s3Service.js
import {
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getAWSSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost, S3RequestPresigner } from "@aws-sdk/s3-presigned-post";
import { getS3Client } from "./s3Client";
import { Buffer } from 'buffer';

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

    // Convert base64 string to Buffer if necessary
    let bodyContent = file.content;
    if (typeof file.content === 'string') {
      const base64Data = file.content.replace(/^data:.+;base64,/, '');
      bodyContent = Buffer.from(base64Data, 'base64');
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: file.name,
      Body: bodyContent,
      ContentType: file.mimeType,
    });
    const response = await s3Client.send(command);
    console.log(response);
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

/**
 * Deletes a single file from an S3 bucket.
 * @param {Object} connection - User connection data.
 * @param {string} bucketName - Bucket name.
 * @param {string} key - Object key to delete.
 * @returns {Object} AWS S3 response.
 */
export const deleteFile = async (connection, bucketName, key) => {
  try {
    const s3Client = getS3Client(connection);
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const response = await s3Client.send(command);
    return response;
  } catch (error) {
    console.error("Error deleting the file:", error);
    throw error;
  }
};

/**
 * Deletes multiple files from an S3 bucket.
 * @param {Object} connection - User connection data.
 * @param {string} bucketName - Bucket name.
 * @param {Array} keys - Array of object keys to delete.
 * @returns {Object} AWS S3 response.
 */
export const deleteFiles = async (connection, bucketName, keys) => {
  try {
    const s3Client = getS3Client(connection);
    const objects = keys.map((key) => ({ Key: key }));
    const command = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: objects,
        Quiet: false,
      },
    });
    const response = await s3Client.send(command);
    return response;
  } catch (error) {
    console.error("Error deleting files:", error);
    throw error;
  }
};

/**
 * Gets a presigned URL for uploading an object to S3.
 * @param {Object} connection - User connection data.
 * @param {string} bucketName - Bucket name.
 * @param {string} key - Object key.
 * @param {string} mimeType - MIME type of the file.
 * @returns {string} Presigned URL.
 */
export const getPresignedUploadUrl = async (connection, bucketName, key, mimeType) => {
  try {
    const s3Client = getS3Client(connection);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: mimeType,
    });
    const url = await getAWSSignedUrl(s3Client, command, { expiresIn: 3600 });
    return url;
  } catch (error) {
    console.error('Error obtaining the presigned upload URL:', error);
    throw error;
  }
};

/**
 * Creates an empty folder by uploading a zero-byte object with a trailing slash.
 * @param {Object} connection - User connection data.
 * @param {string} bucketName - Bucket name.
 * @param {string} folderKey - Folder key ending with '/'.
 * @returns {Object} AWS S3 response.
 */
export const uploadEmptyFolder = async (connection, bucketName, folderKey) => {
  try {
    const s3Client = getS3Client(connection);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: folderKey,
      Body: '', // Zero-byte content
    });
    const response = await s3Client.send(command);
    return response;
  } catch (error) {
    console.error('Error creating empty folder:', error);
    throw error;
  }
};

