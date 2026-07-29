import { CodesignError } from './errors.js';
import type { NormalizedSpec, Rect, SpecLayer } from './types.js';

export const LAYER_SELECTION_SCOPES = ['layer', 'subtree', 'region'] as const;

export type LayerSelectionScope = (typeof LAYER_SELECTION_SCOPES)[number];

export interface SelectedSpecLayer extends SpecLayer {
  relativeRect: Rect;
}

export interface LayerHierarchyNode {
  objectId: string;
  parentId: string;
  name: string;
  type: string;
  kind: 'layer' | 'group';
  rect: Rect;
  relativeRect: Rect;
  children: LayerHierarchyNode[];
}

export interface LayerSelection {
  scope: LayerSelectionScope;
  rootObjectId: string;
  rootName: string;
  bounds: Rect;
  nodeCount: number;
  layerCount: number;
  groupCount: number;
  root: SelectedSpecLayer;
  layers: SelectedSpecLayer[];
  groups: SelectedSpecLayer[];
  hierarchy: LayerHierarchyNode[];
}

interface IndexedLayer {
  kind: 'layer' | 'group';
  sourceOrder: number;
  value: SpecLayer;
}

export function buildLayerSelection(
  spec: NormalizedSpec,
  rootObjectId: string,
  scope: LayerSelectionScope,
): LayerSelection | undefined {
  const entries = indexLayers(spec);
  const byId = new Map(entries.map((entry) => [entry.value.object_id, entry]));
  const rootEntry = byId.get(rootObjectId);
  if (!rootEntry) return undefined;

  const childrenByParent = buildChildrenIndex(entries);
  const selectedIds = selectObjectIds(rootEntry, scope, entries, byId, childrenByParent);
  const selectedEntries = entries.filter((entry) => selectedIds.has(entry.value.object_id));
  const orderedEntries = [...selectedEntries].sort(compareEntries);
  const bounds = copyRect(rootEntry.value.rect);
  const selectedLayers = orderedEntries
    .filter((entry) => entry.kind === 'layer')
    .map((entry) => withRelativeRect(entry.value, bounds));
  const selectedGroups = orderedEntries
    .filter((entry) => entry.kind === 'group')
    .map((entry) => withRelativeRect(entry.value, bounds));
  const hierarchy = buildHierarchy(orderedEntries, bounds);

  return {
    scope,
    rootObjectId,
    rootName: rootEntry.value.name,
    bounds,
    nodeCount: selectedEntries.length,
    layerCount: selectedLayers.length,
    groupCount: selectedGroups.length,
    root: withRelativeRect(rootEntry.value, bounds),
    layers: selectedLayers,
    groups: selectedGroups,
    hierarchy,
  };
}

function indexLayers(spec: NormalizedSpec): IndexedLayer[] {
  const entries: IndexedLayer[] = [];
  const seen = new Set<string>();

  const append = (values: SpecLayer[], kind: IndexedLayer['kind']): void => {
    for (const value of values) {
      if (seen.has(value.object_id)) {
        throw new CodesignError('META_SCHEMA_MISMATCH', 'duplicate layer object_id', {
          objectId: value.object_id,
        });
      }
      seen.add(value.object_id);
      entries.push({ kind, sourceOrder: entries.length, value });
    }
  };

  append(spec.layers, 'layer');
  append(spec.groups, 'group');
  return entries;
}

function buildChildrenIndex(entries: IndexedLayer[]): Map<string, IndexedLayer[]> {
  const childrenByParent = new Map<string, IndexedLayer[]>();
  for (const entry of entries) {
    const children = childrenByParent.get(entry.value.parent_id) ?? [];
    children.push(entry);
    childrenByParent.set(entry.value.parent_id, children);
  }
  for (const children of childrenByParent.values()) children.sort(compareEntries);
  return childrenByParent;
}

function selectObjectIds(
  root: IndexedLayer,
  scope: LayerSelectionScope,
  entries: IndexedLayer[],
  byId: Map<string, IndexedLayer>,
  childrenByParent: Map<string, IndexedLayer[]>,
): Set<string> {
  if (scope === 'layer') return new Set([root.value.object_id]);
  if (scope === 'subtree') return collectSubtreeIds(root, childrenByParent);

  const ancestorIds = collectAncestorIds(root, byId);
  const selected = new Set<string>();
  for (const entry of entries) {
    if (ancestorIds.has(entry.value.object_id)) continue;
    if (rectContains(root.value.rect, entry.value.rect)) selected.add(entry.value.object_id);
  }
  selected.add(root.value.object_id);
  return selected;
}

function collectSubtreeIds(
  root: IndexedLayer,
  childrenByParent: Map<string, IndexedLayer[]>,
): Set<string> {
  const selected = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const objectId = current.value.object_id;
    if (selected.has(objectId)) {
      throw new CodesignError('META_SCHEMA_MISMATCH', 'layer hierarchy contains a cycle', {
        objectId,
      });
    }
    selected.add(objectId);
    stack.push(...(childrenByParent.get(objectId) ?? []));
  }
  return selected;
}

function collectAncestorIds(
  root: IndexedLayer,
  byId: Map<string, IndexedLayer>,
): Set<string> {
  const ancestors = new Set<string>();
  let parentId = root.value.parent_id;
  while (byId.has(parentId)) {
    if (ancestors.has(parentId)) {
      throw new CodesignError('META_SCHEMA_MISMATCH', 'layer hierarchy contains a cycle', {
        objectId: root.value.object_id,
        parentId,
      });
    }
    ancestors.add(parentId);
    parentId = byId.get(parentId)!.value.parent_id;
  }
  return ancestors;
}

function buildHierarchy(entries: IndexedLayer[], bounds: Rect): LayerHierarchyNode[] {
  const selectedIds = new Set(entries.map((entry) => entry.value.object_id));
  const childrenByParent = buildChildrenIndex(entries);
  const roots = entries
    .filter((entry) => !selectedIds.has(entry.value.parent_id))
    .sort(compareEntries);
  const builtIds = new Set<string>();

  const buildNode = (entry: IndexedLayer, ancestors: Set<string>): LayerHierarchyNode => {
    const objectId = entry.value.object_id;
    if (ancestors.has(objectId)) {
      throw new CodesignError('META_SCHEMA_MISMATCH', 'selected layer hierarchy contains a cycle', {
        objectId,
      });
    }
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(objectId);
    builtIds.add(objectId);
    return {
      objectId,
      parentId: entry.value.parent_id,
      name: entry.value.name,
      type: entry.value.type,
      kind: entry.kind,
      rect: copyRect(entry.value.rect),
      relativeRect: relativeRect(entry.value.rect, bounds),
      children: (childrenByParent.get(objectId) ?? []).map((child) =>
        buildNode(child, nextAncestors),
      ),
    };
  };

  const hierarchy = roots.map((root) => buildNode(root, new Set()));
  if (builtIds.size !== entries.length) {
    throw new CodesignError('META_SCHEMA_MISMATCH', 'selected layer hierarchy has no valid root', {
      selectedCount: entries.length,
      reachableCount: builtIds.size,
    });
  }
  return hierarchy;
}

function compareEntries(a: IndexedLayer, b: IndexedLayer): number {
  const aIndex = typeof a.value.layerIndex === 'number' ? a.value.layerIndex : undefined;
  const bIndex = typeof b.value.layerIndex === 'number' ? b.value.layerIndex : undefined;
  if (aIndex != null && bIndex != null && aIndex !== bIndex) return aIndex - bIndex;
  if (aIndex != null && bIndex == null) return -1;
  if (aIndex == null && bIndex != null) return 1;
  return a.sourceOrder - b.sourceOrder;
}

function withRelativeRect(layer: SpecLayer, bounds: Rect): SelectedSpecLayer {
  return {
    ...layer,
    rect: copyRect(layer.rect),
    relativeRect: relativeRect(layer.rect, bounds),
  };
}

function relativeRect(rect: Rect, bounds: Rect): Rect {
  return {
    x: rect.x - bounds.x,
    y: rect.y - bounds.y,
    width: rect.width,
    height: rect.height,
  };
}

function rectContains(bounds: Rect, candidate: Rect): boolean {
  const epsilon = 0.01;
  return (
    candidate.x >= bounds.x - epsilon &&
    candidate.y >= bounds.y - epsilon &&
    candidate.x + candidate.width <= bounds.x + bounds.width + epsilon &&
    candidate.y + candidate.height <= bounds.y + bounds.height + epsilon
  );
}

function copyRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
