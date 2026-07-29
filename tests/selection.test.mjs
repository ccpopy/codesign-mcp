import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLayerSelection } from '../dist/codesign/selection.js';

const artboardId = 'ARTBOARD';
const ancestorId = 'ANCESTOR';
const rootId = 'ROOT';

const spec = {
  artboard: {
    objectId: artboardId,
    name: 'Selection Fixture',
    width: 300,
    height: 300,
    rect: { x: 0, y: 0, width: 300, height: 300 },
  },
  layers: [
    layer('CHILD_TEXT', 'Child text', 'text', 'CHILD_GROUP', 35, 36, 20, 10, 3),
    layer('REGION_TEXT', 'Region sibling', 'text', ancestorId, 80, 80, 10, 10, 4),
    layer('PARTIAL_LAYER', 'Partial overlap', 'shape', ancestorId, 110, 110, 30, 30, 5),
    layer('OUTSIDE_LAYER', 'Outside', 'shape', artboardId, 220, 220, 20, 20, 6),
  ],
  groups: [
    layer(ancestorId, 'Same-size ancestor', 'group', artboardId, 20, 20, 100, 100, 0),
    layer(rootId, 'Selected group', 'group', ancestorId, 20, 20, 100, 100, 1),
    layer('CHILD_GROUP', 'Child group', 'group', rootId, 30, 30, 40, 40, 2),
    layer('REGION_GROUP', 'Region sibling group', 'group', ancestorId, 25, 25, 20, 20, 3),
  ],
  css: [],
  slices: [],
};

test('layer scope preserves the existing single-layer behavior', () => {
  const selection = buildLayerSelection(spec, rootId, 'layer');

  assert.ok(selection);
  assert.equal(selection.scope, 'layer');
  assert.equal(selection.nodeCount, 1);
  assert.equal(selection.layerCount, 0);
  assert.equal(selection.groupCount, 1);
  assert.deepEqual(selection.root.relativeRect, { x: 0, y: 0, width: 100, height: 100 });
  assert.deepEqual(selection.hierarchy.map((node) => node.objectId), [rootId]);
});

test('subtree scope returns only the selected node and its descendants', () => {
  const selection = buildLayerSelection(spec, rootId, 'subtree');

  assert.ok(selection);
  assert.equal(selection.nodeCount, 3);
  assert.deepEqual(selection.groups.map((group) => group.object_id), [rootId, 'CHILD_GROUP']);
  assert.deepEqual(selection.layers.map((item) => item.object_id), ['CHILD_TEXT']);
  assert.deepEqual(selection.layers[0].relativeRect, {
    x: 15,
    y: 16,
    width: 20,
    height: 10,
  });
  assert.equal(selection.hierarchy.length, 1);
  assert.equal(selection.hierarchy[0].children[0].objectId, 'CHILD_GROUP');
  assert.equal(selection.hierarchy[0].children[0].children[0].objectId, 'CHILD_TEXT');
});

test('region scope includes spatial siblings but excludes ancestors and partial overlaps', () => {
  const selection = buildLayerSelection(spec, rootId, 'region');

  assert.ok(selection);
  assert.deepEqual(
    new Set([...selection.layers, ...selection.groups].map((item) => item.object_id)),
    new Set([rootId, 'CHILD_GROUP', 'CHILD_TEXT', 'REGION_GROUP', 'REGION_TEXT']),
  );
  assert.equal(selection.groups.some((group) => group.object_id === ancestorId), false);
  assert.equal(selection.layers.some((item) => item.object_id === 'PARTIAL_LAYER'), false);
  assert.equal(selection.layers.some((item) => item.object_id === 'OUTSIDE_LAYER'), false);
  assert.deepEqual(
    new Set(selection.hierarchy.map((node) => node.objectId)),
    new Set([rootId, 'REGION_GROUP', 'REGION_TEXT']),
  );
});

test('returns undefined when the requested layer does not exist', () => {
  assert.equal(buildLayerSelection(spec, 'MISSING', 'region'), undefined);
});

function layer(objectId, name, type, parentId, x, y, width, height, layerIndex) {
  return {
    parent_id: parentId,
    object_id: objectId,
    type,
    name,
    rect: { x, y, width, height },
    layerIndex,
  };
}
