import { getCacheKey, deriveConnectionId } from '../cacheKeys';

describe('getCacheKey', () => {
  it('formats the cache key as files_<connection>_<bucket>_<path>', () => {
    expect(getCacheKey('conn', 'bucket', 'path/')).toBe('files_conn_bucket_path/');
  });

  it('uses the connection id when given a connection object', () => {
    const connection = { id: '1717000000000', accessKey: 'AK', name: 'My Connection' };
    expect(getCacheKey(connection, 'bucket', 'path/')).toBe(
      'files_1717000000000_bucket_path/'
    );
  });

  it('does not collide for different connections sharing a bucket name and path', () => {
    const connA = { id: 'aaa', accessKey: 'AK1' };
    const connB = { id: 'bbb', accessKey: 'AK2' };
    const keyA = getCacheKey(connA, 'photos', 'trip/');
    const keyB = getCacheKey(connB, 'photos', 'trip/');
    expect(keyA).not.toBe(keyB);
    expect(keyA).toBe('files_aaa_photos_trip/');
    expect(keyB).toBe('files_bbb_photos_trip/');
  });

  it('handles an empty path', () => {
    expect(getCacheKey('conn', 'bucket', '')).toBe('files_conn_bucket_');
  });
});

describe('deriveConnectionId', () => {
  const base = {
    service: 'aws',
    accessKey: 'AKIA123',
    region: 'us-east-1',
    endpoint: 'https://s3.amazonaws.com',
  };

  it('is stable: the same connection always derives the same id', () => {
    const idA = deriveConnectionId({ ...base });
    const idB = deriveConnectionId({ ...base });
    expect(idA).toBe(idB);
  });

  it('does not depend on Date.now() or any external randomness', () => {
    const idBefore = deriveConnectionId({ ...base });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(999999999);
    const idAfter = deriveConnectionId({ ...base });
    nowSpy.mockRestore();
    expect(idAfter).toBe(idBefore);
  });

  it('produces a different id when only the region differs', () => {
    const idA = deriveConnectionId(base);
    const idB = deriveConnectionId({ ...base, region: 'eu-west-1' });
    expect(idA).not.toBe(idB);
  });

  it('produces a different id when only the endpoint differs', () => {
    const idA = deriveConnectionId(base);
    const idB = deriveConnectionId({ ...base, endpoint: 'https://other.example.com' });
    expect(idA).not.toBe(idB);
  });

  it('produces a different id when only the accessKey differs', () => {
    const idA = deriveConnectionId(base);
    const idB = deriveConnectionId({ ...base, accessKey: 'AKIA999' });
    expect(idA).not.toBe(idB);
  });

  it('produces a different id when only the service differs', () => {
    const idA = deriveConnectionId(base);
    const idB = deriveConnectionId({ ...base, service: 'storj' });
    expect(idA).not.toBe(idB);
  });

  it('handles missing fields deterministically without throwing', () => {
    expect(() => deriveConnectionId({})).not.toThrow();
    expect(() => deriveConnectionId(undefined)).not.toThrow();
    expect(deriveConnectionId({})).toBe(deriveConnectionId({}));
  });

  it('does not collide two connections whose fields could naively concatenate the same way', () => {
    // Naive string concatenation of "service + accessKey" would make these
    // two connections indistinguishable ("a" + "bc" === "ab" + "c"). The
    // derivation must use an unambiguous separator so they stay distinct.
    const connA = { service: 'a', accessKey: 'bc', region: '', endpoint: '' };
    const connB = { service: 'ab', accessKey: 'c', region: '', endpoint: '' };
    expect(deriveConnectionId(connA)).not.toBe(deriveConnectionId(connB));
  });

  it('never produces an empty/falsy id, even for a fully empty connection', () => {
    expect(deriveConnectionId({})).toBeTruthy();
    expect(deriveConnectionId(undefined)).toBeTruthy();
  });

  it('produces an id safe for use as part of a storage key (alphanumeric only)', () => {
    const id = deriveConnectionId(base);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });
});
