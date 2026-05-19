// HAR 实测字段命名，不补造
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenImage {
  width: number;
  height: number;
  url: string;
  cover_url: string;
  extension: string;
  mime: string;
  size: number;
  slices_count: number;
  slices_base_url: string;
}

export interface SharingScreen {
  id: number;
  object_id: string;
  name: string;
  width: number;
  height: number;
  frame: Rect;
  meta_url: string;
  slices_url: string;
  slices_count: number;
  image: ScreenImage;
  // 还有更多字段，按需透出
}

export interface SharingDesign {
  id: number;
  name: string;
  screens: SharingScreen[];
}

export interface SharingDetail {
  id: number;
  title: string;
  designs: SharingDesign[];
}

export interface StateKeyResponse {
  key: string;
  expires: number;
}

// Spec object（CDN meta JSON）
export interface SpecLayer {
  parent_id: string;
  object_id: string;
  master_id?: string | null;
  type: string;
  name: string;
  rect: Rect;
  layerIndex?: number;
  exportable?: boolean;
  rotation?: number;
  radius?: number | number[];
  borders?: unknown[];
  fills?: unknown[];
  shadows?: unknown[];
  effects?: unknown[];
  opacity?: number;
  styleName?: string;
  css?: string[] | string;
  // 文本图层可能携带的字段
  content?: string;
  fontSize?: number;
  fontFace?: string;
  fontWeight?: string | number;
  textAlign?: string;
  letterSpacing?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
  textStyleName?: string;
  color?: unknown;
}

export interface SpecObject {
  object_id: string;
  name: string;
  page_id?: string;
  page_name?: string;
  width: number;
  height: number;
  rect: Rect;
  layers: SpecLayer[];
  groups?: SpecLayer[];
  fills?: unknown[];
  css?: string[];
}

// Slice manifest 数组元素
export interface SliceExportableScreenshot {
  object_id: string;
  type?: string;
  name?: string;
  filename?: string;
  ext?: string;
  mime?: string;
  length?: number;
  size?: number;
  from?: string;
  to?: string;
  url: string;
  width?: number;
  height?: number;
}

export interface SliceExportable {
  name?: string;
  scale?: number;
  size?: number;
  format?: string;
  object_id?: string;
  exported?: boolean;
  screenshot: SliceExportableScreenshot;
}

export interface SliceManifestItem {
  name: string;
  object_id: string;
  master_id?: string;
  rect: Rect;
  exportables: SliceExportable[];
}

export type SliceManifest = SliceManifestItem[];

// 归一化后的标注输出（MCP 返回结构）
export interface NormalizedSpec {
  artboard: {
    objectId: string;
    name: string;
    pageId?: string;
    pageName?: string;
    width: number;
    height: number;
    rect: Rect;
  };
  layers: SpecLayer[];
  groups: SpecLayer[];
  css: string[];
  slices: SliceManifestItem[];
}
