import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Cloudflare Workers environment before importing the module under test
vi.mock('cloudflare:workers', () => {
  const env = {};
  return { env };
});

import { env as workerEnv } from 'cloudflare:workers';
import { R2Utils } from '../src/r2-utils.js';

describe('R2Utils (public-URL mode)', () => {
  let r2Utils;
  let mockLogger;
  let mockBucket;

  beforeEach(() => {
    // Simple logger spy
    mockLogger = { log: vi.fn() };

    // Minimal R2 bucket mock (only methods used in these tests)
    mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
      head: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      name: 'test-bucket'
    };

    // Inject bindings into the mocked workers env
    workerEnv.FAX_FILES_BUCKET = mockBucket;
    workerEnv.FAX_FILES_BUCKET_PUBLIC_URL = 'https://public-url.r2.dev';

    r2Utils = new R2Utils(mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initialises with bucket and public URL', () => {
    expect(r2Utils.bucket).toBe(mockBucket);
    expect(r2Utils.publicUrlBase).toBe('https://public-url.r2.dev');
  });

  it('uploadFile stores file and returns public URL', async () => {
    const filename = 'test.pdf';
    const data = new Uint8Array([1, 2, 3]);

    const url = await r2Utils.uploadFile(filename, data);

    expect(mockBucket.put).toHaveBeenCalledWith(filename, data, expect.any(Object));
    expect(url).toBe(`${workerEnv.FAX_FILES_BUCKET_PUBLIC_URL}/${filename}`);
  });

  it('getPresignedUrl returns public URL (back-compat)', async () => {
    const filename = 'doc.pdf';
    const url = await r2Utils.getPresignedUrl(filename);
    expect(url).toBe(`${workerEnv.FAX_FILES_BUCKET_PUBLIC_URL}/${filename}`);
  });

  it('getSignedUrl returns public URL', async () => {
    const filename = 'signed.pdf';
    const url = await r2Utils.getSignedUrl(filename);
    expect(url).toBe(`${workerEnv.FAX_FILES_BUCKET_PUBLIC_URL}/${filename}`);
  });

  it('validateConfiguration passes with bucket and public URL', () => {
    expect(r2Utils.validateConfiguration()).toBe(true);
  });
});
