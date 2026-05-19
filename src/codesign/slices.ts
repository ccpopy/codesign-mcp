import { fetchMetaJson } from './meta.js';
import { CodesignError } from './errors.js';
import type { SliceManifest, SliceManifestItem } from './types.js';

export async function fetchSliceManifest(slicesUrl: string): Promise<SliceManifest> {
  const raw = await fetchMetaJson<unknown>(slicesUrl);
  if (!Array.isArray(raw)) {
    throw new CodesignError('META_SCHEMA_MISMATCH', 'slice manifest is not an array', {
      url: slicesUrl,
      typeOf: typeof raw,
    });
  }
  // 浅校验每项必须有 object_id + exportables
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown> | undefined;
    if (!item || typeof item !== 'object') {
      throw new CodesignError('META_SCHEMA_MISMATCH', `slice item #${i} is not an object`, {
        url: slicesUrl,
      });
    }
    if (typeof item.object_id !== 'string') {
      throw new CodesignError('META_SCHEMA_MISMATCH', `slice item #${i} missing object_id`, {
        url: slicesUrl,
      });
    }
    if (!Array.isArray(item.exportables)) {
      throw new CodesignError('META_SCHEMA_MISMATCH', `slice item #${i} missing exportables`, {
        url: slicesUrl,
      });
    }
  }
  return raw as SliceManifest;
}

export function findSliceByObjectId(manifest: SliceManifest, objectId: string): SliceManifestItem | undefined {
  return manifest.find((s) => s.object_id === objectId);
}
