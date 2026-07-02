import { CodesignError } from './errors.js';
import type {
  PlatformLayer,
  PlatformRect,
  PlatformSpec,
  Rect,
  SpecLayer,
  SpecObject,
  TargetPlatformId,
} from './types.js';

interface PlatformConfig {
  id: TargetPlatformId;
  label: string;
  unit: string;
  aliases: string[];
  availableUnits: string[];
  availableScales: number[];
}

export interface PlatformBuildOptions {
  targetUnit?: string;
  customScale?: number;
  customWidth?: number;
  remBasePx?: number;
}

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    id: 'raw',
    label: 'Raw CoDesign',
    unit: 'px',
    aliases: ['raw', 'origin', 'original', 'source', '原始', '原始标注', '不转换'],
    availableUnits: ['px'],
    availableScales: [1],
  },
  {
    id: 'web',
    label: 'Web',
    unit: 'px',
    aliases: ['web', '网页', '前端', 'h5', 'pc', 'browser', '浏览器', 'css', 'html'],
    availableUnits: ['px', 'rem'],
    availableScales: [0.5, 1, 2, 3],
  },
  {
    id: 'android',
    label: 'Android',
    unit: 'dp',
    aliases: ['android', '安卓', '安卓端', 'android端', 'android app'],
    availableUnits: ['dp', 'px'],
    availableScales: [0.25, 0.5, 1, 2, 3, 4],
  },
  {
    id: 'ios',
    label: 'iOS',
    unit: 'pt',
    aliases: ['ios', 'iphone', 'ipad', '苹果', '苹果端', 'ios端', 'swift', 'uikit'],
    availableUnits: ['pt', 'px'],
    availableScales: [0.5, 1, 2, 3],
  },
  {
    id: 'wechat-miniprogram',
    label: '微信小程序',
    unit: 'rpx',
    aliases: [
      'wechat-miniprogram',
      'wechat mini program',
      'wechat',
      'mini program',
      'miniprogram',
      '微信小程序',
      '小程序',
      '微信',
      'wx',
      'rpx',
    ],
    availableUnits: ['rpx'],
    availableScales: [0.5, 1, 2],
  },
  {
    id: 'other',
    label: '其它平台',
    unit: 'px',
    aliases: ['other', 'others', '其它平台', '其他平台', '其它', '其他', 'custom', '自定义'],
    availableUnits: ['px'],
    availableScales: [0.5, 1, 2, 3],
  },
];

const PLATFORM_BY_ID = new Map(PLATFORM_CONFIGS.map((config) => [config.id, config]));
const DEFAULT_REM_BASE_PX = 16;

export function normalizeTargetPlatform(input: string | undefined): TargetPlatformId | undefined {
  if (input == null || input.trim() === '') return undefined;
  const normalized = normalizePlatformText(input);
  for (const config of PLATFORM_CONFIGS) {
    if (config.id === normalized || config.aliases.some((alias) => normalizePlatformText(alias) === normalized)) {
      return config.id;
    }
  }
  throw new CodesignError('INVALID_PLATFORM', 'unsupported targetPlatform', {
    targetPlatform: input,
    supported: supportedTargetPlatforms(),
  });
}

export function buildPlatformSpec(
  spec: SpecObject,
  requestedPlatform: string,
  options: PlatformBuildOptions = {},
): PlatformSpec {
  const id = normalizeTargetPlatform(requestedPlatform);
  if (!id) {
    throw new CodesignError('INVALID_PLATFORM', 'targetPlatform is empty', { targetPlatform: requestedPlatform });
  }
  const config = getPlatformConfig(id);
  const unit = normalizeTargetUnit(options.targetUnit, config);
  const conversion = resolveConversion(spec, unit, options);
  const scale = conversion.scale;
  return {
    requested: requestedPlatform,
    id,
    label: config.label,
    unit,
    scale,
    conversion: conversion.metadata,
    availableUnits: config.availableUnits,
    availableScales: config.availableScales,
    source: {
      kind: 'codesign-meta-url',
      note:
        'CoDesign platform selection is a client-side presentation over the same meta_url data; no platform-specific meta endpoint is fetched.',
    },
    artboard: {
      objectId: spec.object_id,
      name: spec.name,
      width: convertNumber(spec.width, scale, conversion.remDivisor),
      height: convertNumber(spec.height, scale, conversion.remDivisor),
      unit,
      rect: convertRect(spec.rect, unit, scale, conversion.remDivisor),
    },
    layers: (spec.layers ?? []).map((layer) => convertLayer(layer, unit, scale, conversion.remDivisor)),
    groups: (spec.groups ?? []).map((layer) => convertLayer(layer, unit, scale, conversion.remDivisor)),
    css: convertCssList(spec.css, unit, scale, conversion.remDivisor),
  };
}

export function supportedTargetPlatforms(): Array<{
  id: TargetPlatformId;
  label: string;
  unit: string;
  availableUnits: string[];
  availableScales: number[];
  aliases: string[];
}> {
  return PLATFORM_CONFIGS.map((config) => ({
    id: config.id,
    label: config.label,
    unit: config.unit,
    availableUnits: [...config.availableUnits],
    availableScales: [...config.availableScales],
    aliases: [...config.aliases],
  }));
}

function getPlatformConfig(id: TargetPlatformId): PlatformConfig {
  const config = PLATFORM_BY_ID.get(id);
  if (!config) {
    throw new CodesignError('INVALID_PLATFORM', 'unsupported targetPlatform', { targetPlatform: id });
  }
  return config;
}

function normalizeTargetUnit(input: string | undefined, config: PlatformConfig): string {
  if (input == null || input.trim() === '') return config.unit;
  const normalized = normalizeUnitText(input);
  if (!config.availableUnits.includes(normalized)) {
    throw new CodesignError('INVALID_PLATFORM', 'targetUnit is not supported for targetPlatform', {
      targetUnit: input,
      targetPlatform: config.id,
      supportedUnits: config.availableUnits,
    });
  }
  return normalized;
}

function resolveConversion(
  spec: SpecObject,
  unit: string,
  options: PlatformBuildOptions,
): {
  scale: number;
  remDivisor: number;
  metadata: PlatformSpec['conversion'];
} {
  const hasCustomScale = options.customScale != null;
  const hasCustomWidth = options.customWidth != null;
  if (hasCustomScale && hasCustomWidth) {
    throw new CodesignError('INVALID_PLATFORM', 'customScale and customWidth cannot both be set', {
      customScale: options.customScale,
      customWidth: options.customWidth,
    });
  }

  let scale = 1;
  const metadata: PlatformSpec['conversion'] = {
    mode: 'default',
    sourceWidth: spec.width,
  };

  if (hasCustomScale) {
    scale = assertPositiveNumber(options.customScale, 'customScale');
    metadata.mode = 'custom-scale';
    metadata.customScale = scale;
  } else if (hasCustomWidth) {
    const customWidth = assertPositiveNumber(options.customWidth, 'customWidth');
    scale = customWidth / spec.width;
    metadata.mode = 'custom-width';
    metadata.customWidth = customWidth;
  }

  let remDivisor = 1;
  if (unit === 'rem') {
    remDivisor = options.remBasePx == null ? DEFAULT_REM_BASE_PX : assertPositiveNumber(options.remBasePx, 'remBasePx');
    metadata.remBasePx = remDivisor;
    metadata.remBasePxSource = options.remBasePx == null ? 'default' : 'explicit';
  }

  return { scale, remDivisor, metadata };
}

function convertLayer(layer: SpecLayer, unit: string, scale: number, remDivisor: number): PlatformLayer {
  return {
    objectId: layer.object_id,
    name: layer.name,
    type: layer.type,
    rect: convertRect(layer.rect, unit, scale, remDivisor),
    css: convertCssList(layer.css, unit, scale, remDivisor),
  };
}

function convertRect(rect: Rect, unit: string, scale: number, remDivisor: number): PlatformRect {
  return {
    x: convertNumber(rect.x, scale, remDivisor),
    y: convertNumber(rect.y, scale, remDivisor),
    width: convertNumber(rect.width, scale, remDivisor),
    height: convertNumber(rect.height, scale, remDivisor),
    unit,
  };
}

function convertCssList(css: string[] | string | undefined, unit: string, scale: number, remDivisor: number): string[] {
  const list = Array.isArray(css) ? css : css ? [css] : [];
  return list.map((line) => convertCssUnits(line, unit, scale, remDivisor));
}

function convertCssUnits(css: string, unit: string, scale: number, remDivisor: number): string {
  if (unit === 'px' && scale === 1) return css;
  return css.replace(/(-?\d+(?:\.\d+)?)px\b/g, (_match, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return `${raw}${unit}`;
    return `${formatNumber((n * scale) / remDivisor)}${unit}`;
  });
}

function convertNumber(value: number, scale: number, remDivisor: number): number {
  return Number(formatNumber((value * scale) / remDivisor));
}

function assertPositiveNumber(value: number | undefined, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new CodesignError('INVALID_PLATFORM', `${name} must be a positive number`, { [name]: value });
  }
  return value;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function normalizeUnitText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function normalizePlatformText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, '')
    .replace(/[：:，,。.!！]/g, '');
}
