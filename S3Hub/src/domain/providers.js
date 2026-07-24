// src/domain/providers.js
//
// Provider registry: the single source of truth for endpoints, regions,
// path-style, and extra connection fields. This module is PURE — no React,
// no AWS SDK, no Expo imports. The only side imports allowed are the two
// existing PNG brand logos for AWS and Storj.
//
// `regions === null` means the UI should render a free-text region input
// instead of a picker. Provider brand `name`s are NOT translated.

const awsLogo = require('../../assets/logos/aws.png');
const storjLogo = require('../../assets/logos/storj.png');

/**
 * @typedef {Object} Provider
 * @property {string} id
 * @property {string} name                 Brand name (never translated).
 * @property {boolean} forcePathStyle
 * @property {string[]|null} regions        null => free-text region input.
 * @property {string[]} fields              Extra fields beyond accessKey/secretKey.
 * @property {string} defaultRegion
 * @property {(connection: Object) => (string|undefined)} buildEndpoint
 * @property {*} [logo]                      PNG require (aws/storj only).
 * @property {string} [icon]                 MaterialCommunityIcons name.
 * @property {string|null} brandColor        6-digit hex brand color for the
 *   provider-spine UI signature, or null for custom/unknown providers (the
 *   UI falls back to `theme.colors.primary`).
 */

/** @type {Record<string, Provider>} */
export const PROVIDERS = {
  aws: {
    id: 'aws',
    name: 'AWS S3',
    logo: awsLogo,
    forcePathStyle: false,
    regions: ['us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'],
    fields: [],
    defaultRegion: 'us-east-1',
    buildEndpoint: ({ region }) => `https://s3.${region}.amazonaws.com`,
    brandColor: '#FF9900',
  },
  storj: {
    id: 'storj',
    name: 'Storj',
    logo: storjLogo,
    forcePathStyle: true,
    regions: ['us1', 'eu1', 'ap1'],
    fields: [],
    defaultRegion: 'eu1',
    buildEndpoint: () => 'https://gateway.storjshare.io',
    brandColor: '#2683FF',
  },
  r2: {
    id: 'r2',
    name: 'Cloudflare R2',
    icon: 'cloud',
    forcePathStyle: true,
    regions: null,
    fields: ['accountId'],
    defaultRegion: 'auto',
    buildEndpoint: ({ accountId }) => `https://${accountId}.r2.cloudflarestorage.com`,
    brandColor: '#F6821F',
  },
  b2: {
    id: 'b2',
    name: 'Backblaze B2',
    icon: 'cloud',
    forcePathStyle: true,
    regions: ['us-west-001', 'us-west-002', 'us-west-004', 'eu-central-003'],
    fields: [],
    defaultRegion: 'us-west-002',
    buildEndpoint: ({ region }) => `https://s3.${region}.backblazeb2.com`,
    brandColor: '#E21E29',
  },
  wasabi: {
    id: 'wasabi',
    name: 'Wasabi',
    icon: 'cloud',
    forcePathStyle: false,
    regions: ['us-east-1', 'us-east-2', 'us-west-1', 'eu-central-1', 'ap-northeast-1'],
    fields: [],
    defaultRegion: 'us-east-1',
    buildEndpoint: ({ region }) => `https://s3.${region}.wasabisys.com`,
    brandColor: '#00B04F',
  },
  do: {
    id: 'do',
    name: 'DigitalOcean Spaces',
    icon: 'cloud',
    forcePathStyle: false,
    regions: ['nyc3', 'sfo3', 'ams3', 'sgp1', 'fra1'],
    fields: [],
    defaultRegion: 'nyc3',
    buildEndpoint: ({ region }) => `https://${region}.digitaloceanspaces.com`,
    brandColor: '#0080FF',
  },
  gcs: {
    id: 'gcs',
    name: 'Google Cloud Storage',
    icon: 'google-cloud',
    forcePathStyle: true,
    regions: null,
    fields: [],
    defaultRegion: 'auto',
    buildEndpoint: () => 'https://storage.googleapis.com',
    brandColor: '#4285F4',
  },
  custom: {
    id: 'custom',
    name: 'Custom / S3-compatible',
    icon: 'server-network',
    forcePathStyle: true,
    regions: null,
    fields: ['endpoint'],
    defaultRegion: 'us-east-1',
    buildEndpoint: ({ endpoint }) => endpoint || undefined,
    // No brand color for a generic/unknown S3-compatible endpoint: the
    // provider-spine UI (Task 4.5) falls back to `theme.colors.primary`.
    brandColor: null,
  },
};

/** Ordered list of providers, for rendering selectors. */
export const PROVIDER_LIST = Object.values(PROVIDERS);

/**
 * Resolve a provider descriptor by id.
 * Falls back to the 'custom' provider for unknown, legacy, or missing ids
 * so callers never have to guard against undefined and this never throws.
 * @param {string} [id]
 * @returns {Provider}
 */
export const getProvider = (id) => (id && PROVIDERS[id]) || PROVIDERS.custom;
