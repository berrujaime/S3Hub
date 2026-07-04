// Unit tests for the pure connection-storage helper: splitting a connection
// object into non-secret metadata and a secret pair, and reassembling it.
// No React, AWS SDK, or Expo imports involved — this is domain-layer only.

import { toStorageEntry, fromStorageEntry } from '../connectionStorage';

const conn = {
  id: 'abc',
  service: 'aws',
  region: 'us-east-1',
  bucket: 'b',
  accessKey: 'AKIA',
  secretKey: 'SECRET',
  preview: 'true',
};

describe('toStorageEntry', () => {
  it('separates secrets from metadata and normalizes preview', () => {
    const { meta, secret } = toStorageEntry(conn);

    expect(secret).toEqual({ accessKey: 'AKIA', secretKey: 'SECRET' });
    expect(meta.accessKey).toBeUndefined();
    expect(meta.secretKey).toBeUndefined();
    expect(meta.preview).toBe(true); // string 'true' -> boolean
    expect(meta.id).toBe('abc');
  });

  it('normalizes a boolean preview: true unchanged', () => {
    const { meta } = toStorageEntry({ ...conn, preview: true });
    expect(meta.preview).toBe(true);
  });

  it('normalizes a string preview "false" to boolean false', () => {
    const { meta } = toStorageEntry({ ...conn, preview: 'false' });
    expect(meta.preview).toBe(false);
  });

  it('normalizes a missing preview to boolean false', () => {
    const { preview, ...rest } = conn;
    const { meta } = toStorageEntry(rest);
    expect(meta.preview).toBe(false);
  });

  it('normalizes a boolean preview: false unchanged', () => {
    const { meta } = toStorageEntry({ ...conn, preview: false });
    expect(meta.preview).toBe(false);
  });

  it('omits meta fields that are absent on the input connection', () => {
    const minimal = { id: 'x', accessKey: 'AK', secretKey: 'SK' };
    const { meta } = toStorageEntry(minimal);

    expect(meta).toEqual({ id: 'x', preview: false });
    expect('service' in meta).toBe(false);
    expect('region' in meta).toBe(false);
    expect('endpoint' in meta).toBe(false);
    expect('bucket' in meta).toBe(false);
    expect('label' in meta).toBe(false);
  });

  it('includes provider-specific accountId (e.g. Cloudflare R2) in meta, not just the fixed field list', () => {
    const r2Conn = {
      id: 'r2-1',
      service: 'r2',
      accountId: 'my-account-id',
      accessKey: 'AK',
      secretKey: 'SK',
    };
    const { meta, secret } = toStorageEntry(r2Conn);

    expect(meta.accountId).toBe('my-account-id');
    expect(secret).toEqual({ accessKey: 'AK', secretKey: 'SK' });
  });

  it('never leaks accessKey/secretKey into meta even when other fields are absent', () => {
    const { meta } = toStorageEntry({ accessKey: 'AK', secretKey: 'SK' });
    expect(meta.accessKey).toBeUndefined();
    expect(meta.secretKey).toBeUndefined();
  });
});

describe('fromStorageEntry', () => {
  it('reassembles a full connection', () => {
    const { meta, secret } = toStorageEntry(conn);
    const round = fromStorageEntry(meta, secret);

    expect(round.accessKey).toBe('AKIA');
    expect(round.secretKey).toBe('SECRET');
    expect(round.region).toBe('us-east-1');
  });

  it('round-trips every meta field, including provider-specific ones', () => {
    const r2Conn = {
      id: 'r2-1',
      service: 'r2',
      provider: 'r2',
      region: 'auto',
      endpoint: undefined,
      bucket: 'photos',
      label: 'Work R2',
      accountId: 'acct-123',
      accessKey: 'AK',
      secretKey: 'SK',
      preview: true,
    };
    const { meta, secret } = toStorageEntry(r2Conn);
    const round = fromStorageEntry(meta, secret);

    expect(round).toMatchObject({
      id: 'r2-1',
      service: 'r2',
      provider: 'r2',
      region: 'auto',
      bucket: 'photos',
      label: 'Work R2',
      accountId: 'acct-123',
      accessKey: 'AK',
      secretKey: 'SK',
      preview: true,
    });
  });

  it('tolerates a missing secret (empty object) by leaving accessKey/secretKey undefined', () => {
    const round = fromStorageEntry({ id: 'x' }, {});
    expect(round.id).toBe('x');
    expect(round.accessKey).toBeUndefined();
    expect(round.secretKey).toBeUndefined();
  });
});
