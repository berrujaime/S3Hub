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
import { getS3Client } from "./s3Client";
import { S3_DELETE_BATCH_SIZE } from '../config/s3Config';

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
    return response.Buckets;
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
    // Log the error identity only: `error` (and, more importantly, `url`,
    // which is deliberately never in scope here) must never be logged in
    // full — a presigned URL is a bearer credential.
    console.error("Error obtaining the signed URL:", error?.name || error?.code, error?.message);
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
 * @param {Array} objects - Array of objects with Key properties to delete.
 * @returns {Object} AWS S3 response.
 */
export const deleteFiles = async (connection, bucketName, objects) => {
  try {
    const s3Client = getS3Client(connection);
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
    console.error('Error deleting files:', error);
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
    // See getSignedUrl above: never log the full error (or the URL itself)
    // for a presigned-URL operation — a signed URL is a bearer credential.
    console.error('Error obtaining the presigned upload URL:', error?.name || error?.code, error?.message);
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

/**
 * Lists objects in a bucket for a single page with pagination support.
 * @param {Object} connection - User connection data.
 * @param {string} bucket - Bucket name.
 * @param {Object} options - Options for listing.
 * @param {string} [options.prefix] - Optional prefix to filter objects.
 * @param {string} [options.delimiter] - Optional delimiter to group objects into common prefixes.
 * @param {string} [options.continuationToken] - Optional token for pagination.
 * @returns {Promise<Object>} Object with contents, commonPrefixes, nextContinuationToken, and isTruncated.
 */
export async function listObjectsPage(connection, bucket, { prefix = '', delimiter, continuationToken } = {}) {
  const client = getS3Client(connection);
  const input = { Bucket: bucket, Prefix: prefix };
  if (delimiter) input.Delimiter = delimiter;
  if (continuationToken) input.ContinuationToken = continuationToken;
  const response = await client.send(new ListObjectsV2Command(input));
  return {
    contents: response.Contents ?? [],
    commonPrefixes: (response.CommonPrefixes ?? []).map((p) => p.Prefix),
    nextContinuationToken: response.NextContinuationToken ?? null,
    isTruncated: Boolean(response.IsTruncated),
  };
}

/**
 * Lists all objects in a bucket, handling pagination automatically.
 * @param {Object} connection - User connection data.
 * @param {string} bucket - Bucket name.
 * @param {Object} options - Options for listing.
 * @param {string} [options.prefix] - Optional prefix to filter objects.
 * @param {string} [options.delimiter] - Optional delimiter to group objects into common prefixes.
 * @returns {Promise<Object>} Object with all contents and commonPrefixes aggregated across all pages.
 */
export async function listAllObjects(connection, bucket, { prefix = '', delimiter } = {}) {
  const contents = [];
  const commonPrefixes = [];
  let continuationToken;
  do {
    const page = await listObjectsPage(connection, bucket, { prefix, delimiter, continuationToken });
    contents.push(...page.contents);
    commonPrefixes.push(...page.commonPrefixes);
    if (page.isTruncated && !page.nextContinuationToken) {
      throw new Error('S3 listing reported truncation without a continuation token');
    }
    continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (continuationToken);
  return { contents, commonPrefixes };
}

/**
 * Deletes multiple objects from a bucket, splitting the request into batches
 * that respect the S3 DeleteObjects API limit of S3_DELETE_BATCH_SIZE keys
 * per request. Results (deleted counts and per-object errors) are aggregated
 * across all batches.
 * @param {Object} connection - User connection data.
 * @param {string} bucket - Bucket name.
 * @param {Array<string>} keys - Object keys to delete.
 * @returns {Promise<Object>} Object with `deleted` (number of objects deleted)
 *   and `errors` (array of per-object errors reported by S3).
 */
export async function deleteObjects(connection, bucket, keys) {
  const client = getS3Client(connection);
  let deleted = 0;
  const errors = [];

  for (let i = 0; i < keys.length; i += S3_DELETE_BATCH_SIZE) {
    const batch = keys.slice(i, i + S3_DELETE_BATCH_SIZE);
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
        Quiet: false,
      },
    });
    const response = await client.send(command);
    deleted += (response.Deleted ?? []).length;
    errors.push(...(response.Errors ?? []));
  }

  return { deleted, errors };
}

/**
 * Recursively deletes every object under a prefix (a "folder"), paginating
 * through the full listing before batching the deletes. This avoids the
 * silent partial delete that a single unpaginated listing would cause for
 * folders with more objects than a single ListObjectsV2 page.
 * @param {Object} connection - User connection data.
 * @param {string} bucket - Bucket name.
 * @param {string} prefix - Folder prefix to delete.
 * @returns {Promise<Object>} Object with `deleted` (number of objects deleted)
 *   and `errors` (array of per-object errors reported by S3).
 */
export async function deleteFolderRecursive(connection, bucket, prefix) {
  const { contents } = await listAllObjects(connection, bucket, { prefix });
  const keys = contents.map((object) => object.Key);
  return deleteObjects(connection, bucket, keys);
}

/**
 * Lists every object under a prefix (a "folder"), across all pages.
 * @param {Object} connection - User connection data.
 * @param {string} bucket - Bucket name.
 * @param {string} prefix - Folder prefix to list.
 * @returns {Promise<Array>} All objects found under the prefix.
 */
export async function listAllUnderPrefix(connection, bucket, prefix) {
  const { contents } = await listAllObjects(connection, bucket, { prefix });
  return contents;
}

