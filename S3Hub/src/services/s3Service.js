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
 * Lista los buckets disponibles.
 * @param {Object} connection - Datos de conexión del usuario.
 * @returns {Array} Lista de buckets.
 */
export const listBuckets = async (connection) => {
  try {
    const s3Client = getS3Client(connection);
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);

    // Filtrar los buckets si es necesario (por ejemplo, para Storj)
    if (connection.service === 'storj') {
      // Storj devuelve todos los buckets, no es necesario filtrar
      return response.Buckets;
    } else {
      // Para AWS S3, podrías filtrar los buckets por región si es necesario
      return response.Buckets;
    }
  } catch (error) {
    console.error("Error al listar los buckets:", error);
    throw error;
  }
};

/**
 * Lista los objetos dentro de un bucket.
 * @param {Object} connection - Datos de conexión del usuario.
 * @param {string} bucketName - Nombre del bucket.
 * @param {string} [prefix] - Prefijo opcional para filtrar objetos.
 * @returns {Object} Respuesta de AWS S3.
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
    console.error("Error al listar objetos:", error);
    throw error;
  }
};

/**
 * Sube un archivo a un bucket S3.
 * @param {Object} connection - Datos de conexión del usuario.
 * @param {string} bucketName - Nombre del bucket.
 * @param {Object} file - Archivo a subir.
 * @returns {Object} Respuesta de AWS S3.
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
    console.error("Error al subir el archivo:", error);
    throw error;
  }
};

/**
 * Obtiene una URL firmada para un objeto en S3.
 * @param {Object} connection - Datos de conexión del usuario.
 * @param {string} bucketName - Nombre del bucket.
 * @param {string} key - Clave del objeto.
 * @returns {string} URL firmada.
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
    console.error("Error al obtener la URL firmada:", error);
    throw error;
  }
};

/**
 * Valida las credenciales ingresadas para S3/Storj.
 * @param {Object} connection - Datos de conexión.
 * @returns {boolean} - `true` si las credenciales son válidas, de lo contrario `false`.
 */
export const validateCredentials = async (connection) => {
  try {
    const s3Client = getS3Client(connection);

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
