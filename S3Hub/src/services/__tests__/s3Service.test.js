import { listAllObjects, listObjectsPage } from '../s3Service';
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
