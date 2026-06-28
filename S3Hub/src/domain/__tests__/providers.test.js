// src/domain/__tests__/providers.test.js
import {
  PROVIDERS,
  PROVIDER_LIST,
  getProvider,
} from '../providers';

describe('providers registry', () => {
  describe('descriptor shape', () => {
    it('exposes every provider with the required descriptor fields', () => {
      const expectedIds = [
        'aws',
        'storj',
        'r2',
        'b2',
        'wasabi',
        'do',
        'gcs',
        'custom',
      ];

      expect(Object.keys(PROVIDERS).sort()).toEqual([...expectedIds].sort());
      expect(PROVIDER_LIST.map((p) => p.id).sort()).toEqual(
        [...expectedIds].sort()
      );

      PROVIDER_LIST.forEach((provider) => {
        expect(typeof provider.id).toBe('string');
        expect(typeof provider.name).toBe('string');
        expect(typeof provider.forcePathStyle).toBe('boolean');
        expect(
          provider.regions === null || Array.isArray(provider.regions)
        ).toBe(true);
        expect(Array.isArray(provider.fields)).toBe(true);
        expect(typeof provider.defaultRegion).toBe('string');
        expect(typeof provider.buildEndpoint).toBe('function');
        // EITHER a logo (aws/storj) OR an icon string.
        const hasLogo = provider.logo !== undefined;
        const hasIcon = typeof provider.icon === 'string';
        expect(hasLogo || hasIcon).toBe(true);
        expect(hasLogo && hasIcon).toBe(false);
      });
    });

    it('uses PNG logos only for aws and storj, icons for the rest', () => {
      expect(PROVIDERS.aws.logo).toBeDefined();
      expect(PROVIDERS.storj.logo).toBeDefined();
      expect(PROVIDERS.aws.icon).toBeUndefined();
      expect(PROVIDERS.storj.icon).toBeUndefined();

      ['r2', 'b2', 'wasabi', 'do', 'gcs', 'custom'].forEach((id) => {
        expect(PROVIDERS[id].logo).toBeUndefined();
        expect(typeof PROVIDERS[id].icon).toBe('string');
      });
    });
  });

  describe('names, icons, forcePathStyle, regions, fields, defaultRegion', () => {
    const matrix = {
      aws: {
        name: 'AWS S3',
        forcePathStyle: false,
        regions: ['us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'],
        fields: [],
        defaultRegion: 'us-east-1',
      },
      storj: {
        name: 'Storj',
        forcePathStyle: true,
        regions: ['us1', 'eu1', 'ap1'],
        fields: [],
        defaultRegion: 'eu1',
      },
      r2: {
        name: 'Cloudflare R2',
        icon: 'cloud',
        forcePathStyle: true,
        regions: null,
        fields: ['accountId'],
        defaultRegion: 'auto',
      },
      b2: {
        name: 'Backblaze B2',
        icon: 'cloud',
        forcePathStyle: true,
        regions: ['us-west-001', 'us-west-002', 'us-west-004', 'eu-central-003'],
        fields: [],
        defaultRegion: 'us-west-002',
      },
      wasabi: {
        name: 'Wasabi',
        icon: 'cloud',
        forcePathStyle: false,
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'eu-central-1', 'ap-northeast-1'],
        fields: [],
        defaultRegion: 'us-east-1',
      },
      do: {
        name: 'DigitalOcean Spaces',
        icon: 'cloud',
        forcePathStyle: false,
        regions: ['nyc3', 'sfo3', 'ams3', 'sgp1', 'fra1'],
        fields: [],
        defaultRegion: 'nyc3',
      },
      gcs: {
        name: 'Google Cloud Storage',
        icon: 'google-cloud',
        forcePathStyle: true,
        regions: null,
        fields: [],
        defaultRegion: 'auto',
      },
      custom: {
        name: 'Custom / S3-compatible',
        icon: 'server-network',
        forcePathStyle: true,
        regions: null,
        fields: ['endpoint'],
        defaultRegion: 'us-east-1',
      },
    };

    Object.entries(matrix).forEach(([id, expected]) => {
      it(`describes ${id} correctly`, () => {
        const provider = PROVIDERS[id];
        expect(provider.name).toBe(expected.name);
        expect(provider.forcePathStyle).toBe(expected.forcePathStyle);
        expect(provider.regions).toEqual(expected.regions);
        expect(provider.fields).toEqual(expected.fields);
        expect(provider.defaultRegion).toBe(expected.defaultRegion);
        if (expected.icon) {
          expect(provider.icon).toBe(expected.icon);
        }
      });
    });
  });

  describe('buildEndpoint', () => {
    it('builds the AWS endpoint from the region', () => {
      expect(PROVIDERS.aws.buildEndpoint({ region: 'eu-west-1' })).toBe(
        'https://s3.eu-west-1.amazonaws.com'
      );
      expect(PROVIDERS.aws.buildEndpoint({ region: 'us-east-1' })).toBe(
        'https://s3.us-east-1.amazonaws.com'
      );
    });

    it('builds the fixed Storj gateway endpoint regardless of region', () => {
      expect(PROVIDERS.storj.buildEndpoint({ region: 'eu1' })).toBe(
        'https://gateway.storjshare.io'
      );
      expect(PROVIDERS.storj.buildEndpoint({})).toBe(
        'https://gateway.storjshare.io'
      );
    });

    it('builds the R2 endpoint from the accountId', () => {
      expect(
        PROVIDERS.r2.buildEndpoint({ accountId: 'abc123' })
      ).toBe('https://abc123.r2.cloudflarestorage.com');
    });

    it('builds the Backblaze B2 endpoint from the region', () => {
      expect(PROVIDERS.b2.buildEndpoint({ region: 'us-west-002' })).toBe(
        'https://s3.us-west-002.backblazeb2.com'
      );
    });

    it('builds the Wasabi endpoint from the region', () => {
      expect(PROVIDERS.wasabi.buildEndpoint({ region: 'eu-central-1' })).toBe(
        'https://s3.eu-central-1.wasabisys.com'
      );
    });

    it('builds the DigitalOcean Spaces endpoint from the region', () => {
      expect(PROVIDERS.do.buildEndpoint({ region: 'fra1' })).toBe(
        'https://fra1.digitaloceanspaces.com'
      );
    });

    it('builds the fixed Google Cloud Storage endpoint', () => {
      expect(PROVIDERS.gcs.buildEndpoint({ region: 'auto' })).toBe(
        'https://storage.googleapis.com'
      );
      expect(PROVIDERS.gcs.buildEndpoint({})).toBe(
        'https://storage.googleapis.com'
      );
    });

    it('returns the user-supplied endpoint for custom, undefined when missing', () => {
      expect(
        PROVIDERS.custom.buildEndpoint({ endpoint: 'https://minio.local:9000' })
      ).toBe('https://minio.local:9000');
      expect(PROVIDERS.custom.buildEndpoint({})).toBeUndefined();
    });
  });

  describe('getProvider', () => {
    it('returns the matching descriptor for a known id', () => {
      expect(getProvider('aws')).toBe(PROVIDERS.aws);
      expect(getProvider('storj')).toBe(PROVIDERS.storj);
      expect(getProvider('r2')).toBe(PROVIDERS.r2);
    });

    it('falls back to the custom provider for unknown ids', () => {
      expect(getProvider('totally-unknown')).toBe(PROVIDERS.custom);
    });

    it('falls back to the custom provider for legacy/empty ids without throwing', () => {
      expect(() => getProvider(undefined)).not.toThrow();
      expect(() => getProvider(null)).not.toThrow();
      expect(() => getProvider('')).not.toThrow();
      expect(getProvider(undefined)).toBe(PROVIDERS.custom);
      expect(getProvider(null)).toBe(PROVIDERS.custom);
      expect(getProvider('')).toBe(PROVIDERS.custom);
    });
  });
});
