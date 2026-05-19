import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { CodesignError } from '../codesign/errors.js';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (CodesignMcp/0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
};

export interface DownloadResult {
  url: string;
  path: string;
  bytes: number;
  mime: string | null;
}

// 把 URL 下载到 data/artifacts/<subdir>/<filename>。filename 为空时根据 URL 推断或哈希。
export async function downloadToArtifact(
  url: string,
  subdir: string,
  filename?: string,
  errorCode: 'SLICE_FETCH_FAILED' | 'META_FETCH_FAILED' = 'SLICE_FETCH_FAILED',
): Promise<DownloadResult> {
  const targetDir = resolve(config.artifactsDir, subdir);
  mkdirSync(targetDir, { recursive: true });

  const finalName = filename ?? deriveFilename(url);
  const finalPath = resolve(targetDir, finalName);
  mkdirSync(dirname(finalPath), { recursive: true });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.metaTimeoutMs);
  try {
    const resp = await fetch(url, { headers: DEFAULT_HEADERS, signal: controller.signal });
    if (!resp.ok) {
      throw new CodesignError(errorCode, `download failed: HTTP ${resp.status}`, {
        url,
        status: resp.status,
      });
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(tempPath, buf);
      renameSync(tempPath, finalPath);
    } catch (err) {
      rmSync(tempPath, { force: true });
      throw err;
    }
    return {
      url,
      path: finalPath,
      bytes: buf.byteLength,
      mime: resp.headers.get('content-type'),
    };
  } catch (err) {
    if (err instanceof CodesignError) throw err;
    throw new CodesignError(errorCode, `download threw: ${(err as Error).message}`, { url });
  } finally {
    clearTimeout(timer);
  }
}

function deriveFilename(url: string): string {
  try {
    const u = new URL(url);
    const last = basename(u.pathname);
    if (last && extname(last)) return last;
    const ext = extname(last) || '';
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 12);
    return `${hash}${ext || '.bin'}`;
  } catch {
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 12);
    return `${hash}.bin`;
  }
}
