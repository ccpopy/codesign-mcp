import { CodesignError } from './errors.js';
import type {
  NormalizedSpec,
  PlatformSpec,
  SliceManifest,
  SpecLayer,
  SpecObject,
} from './types.js';

// 浅校验 spec object 顶层 schema，符合 HAR 实测。
export function assertSpecObject(raw: unknown): asserts raw is SpecObject {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CodesignError('META_SCHEMA_MISMATCH', 'spec is not a plain object');
  }
  const r = raw as Record<string, unknown>;
  for (const k of ['object_id', 'name', 'rect'] as const) {
    if (r[k] == null) {
      throw new CodesignError('META_SCHEMA_MISMATCH', `spec missing required field: ${k}`, {
        topKeys: Object.keys(r),
      });
    }
  }
  if (r.layers != null && !Array.isArray(r.layers)) {
    throw new CodesignError('META_SCHEMA_MISMATCH', 'spec.layers is not an array');
  }
  if (r.groups != null && !Array.isArray(r.groups)) {
    throw new CodesignError('META_SCHEMA_MISMATCH', 'spec.groups is not an array');
  }
  if (r.css != null && !Array.isArray(r.css) && typeof r.css !== 'string') {
    throw new CodesignError('META_SCHEMA_MISMATCH', 'spec.css must be array or string');
  }
}

export function normalizeSpec(
  spec: SpecObject,
  slices: SliceManifest = [],
  platformSpec?: PlatformSpec,
): NormalizedSpec {
  const normalized: NormalizedSpec = {
    artboard: {
      objectId: spec.object_id,
      name: spec.name,
      pageId: spec.page_id,
      pageName: spec.page_name,
      width: spec.width,
      height: spec.height,
      rect: spec.rect,
    },
    layers: (spec.layers ?? []).map(passthroughLayer),
    groups: (spec.groups ?? []).map(passthroughLayer),
    css: Array.isArray(spec.css) ? spec.css : spec.css ? [spec.css] : [],
    slices,
  };
  if (platformSpec) normalized.platformSpec = platformSpec;
  return normalized;
}

// 按 objectId 在 layers + groups 中查找。
export function findLayerByObjectId(spec: NormalizedSpec, objectId: string): SpecLayer | undefined {
  const all = [...spec.layers, ...spec.groups];
  return all.find((l) => l.object_id === objectId);
}

// HAR 实测字段保留 snake_case + 文本字段（content/fontSize/...）按存在性透出
function passthroughLayer(layer: SpecLayer): SpecLayer {
  // 这里不主动改名，直接透传。归一化由调用方按需做（避免吞掉新字段）。
  return layer;
}
