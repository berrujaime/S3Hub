import {
  listAllObjects,
  listObjectsPage,
  deleteObjects,
  deleteFolderRecursive,
  listAllUnderPrefix,
} from '../s3Service';
import { getS3Client } from '../s3Client';

jest.mock('../s3Client', () => ({
  getS3Client: jest.fn(),
}));

const makeClient = (pages) => {
  let call = 0;
  return { send: jest.fn(async () => pages[call++]) };
};

const connection = { service: 'aws', accessKey: 'A', secretKey: 'S', region: 'us-east-1' };

test('listObjectsPage passes Delimiter and returns commonPrefixes', async () => {
  const client = makeClient([
    { Contents: [{ Key: 'a.txt' }], CommonPrefixes: [{ Prefix: 'sub/' }], IsTruncated: false },
  ]);
  getS3Client.mockReturnValue(client);
  const res = await listObjectsPage(connection, 'bucket', { prefix: '', delimiter: '/' });
  const sentInput = client.send.mock.calls[0][0].input;
  expect(sentInput.Delimiter).toBe('/');
  expect(res.commonPrefixes).toEqual(['sub/']);
  expect(res.contents).toHaveLength(1);
});

test('listAllObjects loops until IsTruncated is false', async () => {
  const client = makeClient([
    { Contents: [{ Key: '1' }], IsTruncated: true, NextContinuationToken: 'T1' },
    { Contents: [{ Key: '2' }], IsTruncated: true, NextContinuationToken: 'T2' },
    { Contents: [{ Key: '3' }], IsTruncated: false },
  ]);
  getS3Client.mockReturnValue(client);
  const res = await listAllObjects(connection, 'bucket', { prefix: 'p/' });
  expect(res.contents.map((c) => c.Key)).toEqual(['1', '2', '3']);
  // second/third calls must forward the ContinuationToken
  expect(client.send.mock.calls[1][0].input.ContinuationToken).toBe('T1');
  expect(client.send.mock.calls[2][0].input.ContinuationToken).toBe('T2');
});

test('listAllObjects throws when truncated page lacks a continuation token', async () => {
  const client = makeClient([
    { Contents: [{ Key: '1' }], IsTruncated: true },
  ]);
  getS3Client.mockReturnValue(client);
  await expect(listAllObjects(connection, 'bucket', { prefix: 'p/' })).rejects.toThrow();
});

test('deleteObjects splits 2500 keys into 3 DeleteObjectsCommand calls and aggregates results', async () => {
  const keys = Array.from({ length: 2500 }, (_, i) => `file-${i}.txt`);
  const client = makeClient([
    { Deleted: Array(1000).fill({}), Errors: [] },
    { Deleted: Array(999).fill({}), Errors: [{ Key: 'file-1500.txt', Code: 'AccessDenied' }] },
    { Deleted: Array(500).fill({}), Errors: [] },
  ]);
  getS3Client.mockReturnValue(client);

  const result = await deleteObjects(connection, 'bucket', keys);

  expect(client.send).toHaveBeenCalledTimes(3);
  expect(client.send.mock.calls[0][0].input.Delete.Objects).toHaveLength(1000);
  expect(client.send.mock.calls[1][0].input.Delete.Objects).toHaveLength(1000);
  expect(client.send.mock.calls[2][0].input.Delete.Objects).toHaveLength(500);
  // batches contain the correct slice of keys, in order
  expect(client.send.mock.calls[0][0].input.Delete.Objects[0]).toEqual({ Key: 'file-0.txt' });
  expect(client.send.mock.calls[2][0].input.Delete.Objects[0]).toEqual({ Key: 'file-2000.txt' });
  expect(result.deleted).toBe(2499);
  expect(result.errors).toEqual([{ Key: 'file-1500.txt', Code: 'AccessDenied' }]);
});

test('deleteObjects is a no-op for an empty key list: sends no S3 command and resolves cleanly', async () => {
  const client = makeClient([]); // No page queued: any send() call would throw "undefined" here.
  getS3Client.mockReturnValue(client);

  const result = await deleteObjects(connection, 'bucket', []);

  expect(client.send).not.toHaveBeenCalled();
  expect(result).toEqual({ deleted: 0, errors: [] });
});

test('deleteFolderRecursive lists all pages (no delimiter) then deletes every object found', async () => {
  const client = makeClient([
    { Contents: [{ Key: 'folder/a.txt' }], IsTruncated: true, NextContinuationToken: 'T1' },
    { Contents: [{ Key: 'folder/b.txt' }], IsTruncated: false },
    { Deleted: [{ Key: 'folder/a.txt' }, { Key: 'folder/b.txt' }], Errors: [] },
  ]);
  getS3Client.mockReturnValue(client);

  const result = await deleteFolderRecursive(connection, 'bucket', 'folder/');

  expect(client.send).toHaveBeenCalledTimes(3);
  // listing calls must not restrict to a single level (no Delimiter)
  expect(client.send.mock.calls[0][0].input.Delimiter).toBeUndefined();
  expect(client.send.mock.calls[1][0].input.Delimiter).toBeUndefined();
  // the delete call targets every key collected across pages
  expect(client.send.mock.calls[2][0].input.Delete.Objects).toEqual([
    { Key: 'folder/a.txt' },
    { Key: 'folder/b.txt' },
  ]);
  expect(result).toEqual({ deleted: 2, errors: [] });
});

test('listAllUnderPrefix returns every object under a prefix across pages, without a delimiter', async () => {
  const client = makeClient([
    { Contents: [{ Key: 'folder/a.txt' }], IsTruncated: true, NextContinuationToken: 'T1' },
    { Contents: [{ Key: 'folder/b.txt' }], IsTruncated: false },
  ]);
  getS3Client.mockReturnValue(client);

  const result = await listAllUnderPrefix(connection, 'bucket', 'folder/');

  expect(result.map((o) => o.Key)).toEqual(['folder/a.txt', 'folder/b.txt']);
  expect(client.send.mock.calls[0][0].input.Delimiter).toBeUndefined();
});
