import { getCacheKey, deriveConnectionId, reconcileCurrentConnection } from '../cacheKeys';

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

describe('reconcileCurrentConnection', () => {
  const legacyFields = {
    service: 'aws',
    accessKey: 'AK-current',
    region: 'us-east-1',
    endpoint: 'https://s3.amazonaws.com',
  };

  it('returns null when there is no stored current connection', () => {
    expect(reconcileCurrentConnection(null, [])).toBeNull();
    expect(reconcileCurrentConnection(undefined, [])).toBeNull();
  });

  it('matches a legacy stored current (no id) to its backfilled list entry and returns that exact entry', () => {
    const derivedId = deriveConnectionId(legacyFields);
    const listEntry = { ...legacyFields, id: derivedId };
    const connections = [{ id: 'other', service: 'storj', accessKey: 'AK-x' }, listEntry];

    const result = reconcileCurrentConnection({ ...legacyFields }, connections);

    // Whole-object substitution: the list entry itself is returned (same
    // reference), keeping object identity consistent with `connections`.
    expect(result).toBe(listEntry);
  });

  it('returns the stored connection with a derived id when no list entry matches', () => {
    const connections = [{ id: 'unrelated', service: 'storj', accessKey: 'AK-x' }];

    const result = reconcileCurrentConnection({ ...legacyFields }, connections);

    expect(result.id).toBe(deriveConnectionId(legacyFields));
    expect(result.accessKey).toBe(legacyFields.accessKey);
    expect(result.service).toBe(legacyFields.service);
  });

  it('passes through a stored current that already has an id, preferring the matching list entry', () => {
    const listEntry = { id: 'explicit-id', service: 'aws', accessKey: 'AK-1' };
    const connections = [listEntry];

    const result = reconcileCurrentConnection({ id: 'explicit-id', service: 'aws', accessKey: 'AK-1' }, connections);

    expect(result).toBe(listEntry);
  });

  it('keeps an explicit id unchanged when it matches no list entry', () => {
    const stored = { id: 'stale-id', service: 'aws', accessKey: 'AK-gone' };

    const result = reconcileCurrentConnection(stored, []);

    expect(result.id).toBe('stale-id');
    expect(result.accessKey).toBe('AK-gone');
  });

  it('resolves a legacy current matching a duplicated account to the FIRST occurrence', () => {
    // Backfilled duplicates: first keeps the derived id, later ones get
    // index-suffixed ids (see connectionRepository.backfillConnectionIds).
    const derivedId = deriveConnectionId(legacyFields);
    const first = { ...legacyFields, id: derivedId };
    const second = { ...legacyFields, id: `${derivedId}-1` };
    const connections = [first, second];

    const result = reconcileCurrentConnection({ ...legacyFields }, connections);

    expect(result).toBe(first);
  });
});
