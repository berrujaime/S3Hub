// src/services/authService.js
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "./s3Client";

/**
 * Valida las credenciales ingresadas para S3/Storj.
 * @param {Object} authData - Datos de autenticación.
 * @returns {boolean} - `true` si las credenciales son válidas, de lo contrario `false`.
 */
export const validateCredentials = async (authData) => {
  try {
    const s3Client = getS3Client(authData);

    // Intentar listar los buckets disponibles
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);

    // Si se obtiene una lista de buckets, las credenciales son válidas
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
