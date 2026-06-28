import { getCacheKey } from '../cacheKeys';

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
