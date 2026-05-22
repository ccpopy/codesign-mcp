import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname, basename, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { APIRequestContext } from 'playwright';
import { config } from '../config.js';
import { CodesignError } from '../codesign/errors.js';
import { assertAllowedRemoteUrl, normalizeCodesignAssetUrl } from './url.js';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (CodesignMcp/0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
};

const FILE_COMMIT_RETRY_DELAYS_MS = [50, 150, 350] as const;

export interface DownloadResult {
  url: string;
  path: string;
  bytes: number;
  mime: string | null;
  reusedExisting?: boolean;
  writeAttempts?: number;
}

export interface DownloadOptions {
  request?: APIRequestContext;
  headers?: Record<string, string>;
  expectedBytes?: number;
}

// 把 URL 下载到 data/artifacts/<subdir>/<filename>。filename 为空时根据 URL 推断或哈希。
export async function downloadToArtifact(
  url: string,
  subdir: string,
  filename?: string,
  errorCode: 'SLICE_FETCH_FAILED' | 'META_FETCH_FAILED' = 'SLICE_FETCH_FAILED',
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const remoteUrl = normalizeCodesignAssetUrl(url);
  assertAllowedRemoteUrl(remoteUrl, 'download');
  const targetDir = resolveInside(config.artifactsDir, subdir);
  mkdirSync(targetDir, { recursive: true });

  const finalName = filename ?? deriveFilename(url);
  const finalPath = resolveInside(targetDir, finalName);
  mkdirSync(dirname(finalPath), { recursive: true });

  const existing = getExistingArtifact(finalPath, options.expectedBytes);
  if (existing) {
    return {
      url,
      path: finalPath,
      bytes: existing.bytes,
      mime: null,
      reusedExisting: true,
      writeAttempts: 0,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.metaTimeoutMs);
  try {
    const headers = { ...DEFAULT_HEADERS, ...options.headers };
    const resp = options.request
      ? await fetchWithBrowserContext(options.request, remoteUrl, headers)
      : await fetchWithNode(remoteUrl, headers, controller.signal);
    if (!resp.ok) {
      throw new CodesignError(errorCode, `download failed: HTTP ${resp.status}`, {
        url: remoteUrl,
        status: resp.status,
      });
    }
    const buf = resp.body;
    const writeAttempts = await commitArtifactWithRetry(finalPath, buf);
    return {
      url: remoteUrl,
      path: finalPath,
      bytes: buf.byteLength,
      mime: resp.mime,
      writeAttempts,
    };
  } catch (err) {
    if (err instanceof CodesignError) throw err;
    throw new CodesignError(errorCode, `download threw: ${(err as Error).message}`, {
      url: remoteUrl,
      path: finalPath,
    });
  } finally {
    clearTimeout(timer);
  }
}

function resolveInside(root: string, child: string): string {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(resolvedRoot, child);
  const rel = relative(resolvedRoot, resolvedTarget);
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) {
    return resolvedTarget;
  }
  throw new CodesignError('ARTIFACT_PATH_INVALID', 'artifact path escapes artifactsDir', {
    root: resolvedRoot,
    child,
    resolvedTarget,
  });
}

function getExistingArtifact(path: string, expectedBytes: number | undefined): { bytes: number } | undefined {
  if (typeof expectedBytes !== 'number' || !Number.isSafeInteger(expectedBytes) || expectedBytes < 0) {
    return undefined;
  }
  try {
    const stat = statSync(path);
    if (stat.isFile() && stat.size === expectedBytes) return { bytes: stat.size };
    return undefined;
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return undefined;
    throw err;
  }
}

async function commitArtifactWithRetry(finalPath: string, buf: Buffer): Promise<number> {
  for (let attempt = 0; attempt <= FILE_COMMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    const tempPath = `${finalPath}.${process.pid}.${Date.now()}.${attempt}.tmp`;
    try {
      writeFileSync(tempPath, buf);
      renameSync(tempPath, finalPath);
      return attempt + 1;
    } catch (err) {
      rmSync(tempPath, { force: true });
      if (!isRetryableFileCommitError(err) || attempt === FILE_COMMIT_RETRY_DELAYS_MS.length) {
        throw err;
      }
      await delay(FILE_COMMIT_RETRY_DELAYS_MS[attempt]!);
    }
  }
  throw new Error('artifact write retry loop exhausted');
}

function isRetryableFileCommitError(err: unknown): boolean {
  if (!isErrnoException(err)) return false;
  return err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES';
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function fetchWithNode(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; body: Buffer; mime: string | null }> {
  const resp = await fetch(url, { headers, signal });
  return {
    ok: resp.ok,
    status: resp.status,
    body: Buffer.from(await resp.arrayBuffer()),
    mime: resp.headers.get('content-type'),
  };
}

async function fetchWithBrowserContext(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: Buffer; mime: string | null }> {
  const resp = await request.get(url, { headers, timeout: config.metaTimeoutMs });
  const responseHeaders = resp.headers();
  return {
    ok: resp.ok(),
    status: resp.status(),
    body: await resp.body(),
    mime: responseHeaders['content-type'] ?? null,
  };
}

function deriveFilename(url: string): string {
  try {
    const u = new URL(url);
    const last = basename(u.pathname);
    if (last && extname(last)) return last;
    const ext = extname(last) || '';
    const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
    return `${hash}${ext || '.bin'}`;
  } catch {
    const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
    return `${hash}.bin`;
  }
}
