// src/services/authService.js
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "./s3Client";

/**
 * Validate the credentials.
 * @param {Object} authData - Authentication data.
 * @returns {boolean} - True if the credentials are valid, false otherwise.
 */
export const validateCredentials = async (authData) => {
  try {
    const s3Client = getS3Client(authData);

    // Try to list buckets to check if the credentials are valid
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);

    // If the response has buckets, the credentials are valid
    if (response.Buckets) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error al validar las credenciales:", error);
    if (
      error.name === "InvalidAccessKeyId" ||
      error.name === "SignatureDoesNotMatch" ||
      error.name === "AccessDenied"
    ) {
      return false;
    }
    throw error;
  }
};
