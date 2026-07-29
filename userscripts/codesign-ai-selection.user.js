// ==UserScript==
// @name         CoDesign AI 选区复制
// @name:en      CoDesign Copy AI Selection
// @namespace    https://github.com/ccpopy/codesign-mcp
// @version      0.1.1
// @description  将当前 CoDesign 画板和图层选区复制为 codesign-mcp 可使用的 Agent 提示词。
// @description:en Copy the current CoDesign screen and layer selection as a codesign-mcp Agent prompt.
// @author       codesign-mcp contributors
// @homepageURL  https://github.com/ccpopy/codesign-mcp
// @supportURL   https://github.com/ccpopy/codesign-mcp/issues
// @match        https://codesign.qq.com/app/s/*
// @match        https://codesign.qq.com/s/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ccpopy/codesign-mcp/main/userscripts/codesign-ai-selection.user.js
// @downloadURL  https://raw.githubusercontent.com/ccpopy/codesign-mcp/main/userscripts/codesign-ai-selection.user.js
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'codesign-ai-selection-copy';
  const STYLE_ID = 'codesign-ai-selection-style';
  const TOAST_ID = 'codesign-ai-selection-toast';
  const SELECTION_SCOPE = 'region';
  const SELECTORS = Object.freeze({
    inspectorHeaders: 'aside.screen-inspector .node-box__header',
    inspectorAction: ':scope > .node-box__btn',
    inspectorTitle: '.node-box__header--title, .node-box__header--left',
    activeScreen: '.board-screen-list__item.active[data-id]',
    selectedCanvasLayer:
      '.selected.layer[data-object-id][data-layer-name]:not(.orange-dash-rect)',
    activeLayerWrapper: '.custom-tree__node-wrapper.active',
    activeLayerNode: ':scope > .custom-tree__node[id^="id-"]',
  });

  let refreshScheduled = false;

  installStyles();
  refreshButton();

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-id', 'data-layer-name', 'data-object-id', 'id', 'title'],
  });
  window.addEventListener('popstate', scheduleRefresh);
  window.addEventListener('hashchange', scheduleRefresh);

  function scheduleRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      refreshButton();
    });
  }

  function refreshButton() {
    const header = findInspectorHeader();
    if (!header) return;

    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = '复制给 AI';
      button.addEventListener('click', copySelectionPrompt);
    }
    const nativeAction = header.querySelector(SELECTORS.inspectorAction);
    if (nativeAction) header.insertBefore(button, nativeAction);
    else if (button.parentElement !== header) header.append(button);

    const selection = readSelection(false, header);
    const disabled = selection == null;
    if (button.disabled !== disabled) button.disabled = disabled;
    const title = selection
      ? `复制 ${selection.screenName} / ${selection.layerName} 的 AI 选区提示词`
      : '请先在 CoDesign 画布或图层面板中选中一个图层或分组';
    if (button.title !== title) button.title = title;
    if (button.getAttribute('aria-label') !== title) button.setAttribute('aria-label', title);
  }

  function copySelectionPrompt() {
    try {
      const selection = readSelection(true);
      const prompt = buildPrompt(selection);
      GM_setClipboard(prompt, 'text');
      showToast(`已复制：${selection.screenName} / ${selection.layerName}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[codesign-ai-selection]', error);
      showToast(message, 'error');
    }
  }

  function readSelection(required, inspectorHeader = findInspectorHeader()) {
    const screenElements = document.querySelectorAll(SELECTORS.activeScreen);

    if (screenElements.length !== 1 || !inspectorHeader) {
      if (!required) return null;
      throw new Error(
        `无法确定唯一选区：找到 ${screenElements.length} 个当前画板，右侧标注面板${inspectorHeader ? '已找到' : '未找到'}。`,
      );
    }

    const screenElement = screenElements[0];
    const screenId = screenElement.getAttribute('data-id');
    const screenName = readRequiredLabel(screenElement, '当前画板');
    const layerName = readRequiredLabel(
      inspectorHeader.querySelector(SELECTORS.inspectorTitle),
      '当前图层',
    );
    const layerReference = readLayerReference(layerName, required);
    if (!layerReference) return null;
    const sharingUrl = readSharingUrl();

    if (!screenId) throw new Error('当前画板缺少 data-id，无法生成 AI 选区引用。');

    return {
      type: 'codesign-selection',
      sharingUrl,
      screenId,
      screenName,
      layerObjectId: layerReference.objectId,
      layerName,
      selectionScope: SELECTION_SCOPE,
    };
  }

  function findInspectorHeader() {
    return Array.from(document.querySelectorAll(SELECTORS.inspectorHeaders)).find((item) =>
      item.querySelector(SELECTORS.inspectorAction),
    );
  }

  function readLayerReference(layerName, required) {
    const canvasReferences = uniqueLayerReferences(
      Array.from(document.querySelectorAll(SELECTORS.selectedCanvasLayer))
        .filter(
          (element) =>
            readLabel(element) === layerName && getComputedStyle(element).display !== 'none',
        )
        .map((element) => ({
          objectId: (element.getAttribute('data-object-id') || '').trim(),
          name: readLabel(element),
        })),
    );
    if (canvasReferences.length === 1) return canvasReferences[0];

    const treeReferences = uniqueLayerReferences(
      Array.from(document.querySelectorAll(SELECTORS.activeLayerWrapper))
        .filter((wrapper) => readLabel(wrapper) === layerName)
        .flatMap((wrapper) =>
          Array.from(wrapper.querySelectorAll(SELECTORS.activeLayerNode)).map((node) => ({
            objectId: node.id.startsWith('id-') ? node.id.slice(3) : '',
            name: readLabel(wrapper),
          })),
        ),
    );
    if (treeReferences.length === 1) return treeReferences[0];

    if (!required) return null;
    throw new Error(
      `无法读取当前图层 ID：画布候选 ${canvasReferences.length} 个、与右侧标注一致的图层树候选 ${treeReferences.length} 个。请重新选择图层。`,
    );
  }

  function uniqueLayerReferences(references) {
    const unique = new Map();
    for (const reference of references) {
      if (reference.objectId) unique.set(reference.objectId, reference);
    }
    return Array.from(unique.values());
  }

  function readLabel(element) {
    return (
      element?.getAttribute('data-layer-name') ||
      element?.getAttribute('title') ||
      element?.textContent ||
      ''
    ).trim();
  }

  function readRequiredLabel(element, label) {
    const value = readLabel(element);
    if (!value) throw new Error(`${label}缺少可读名称，无法生成 AI 选区引用。`);
    return value;
  }

  function readSharingUrl() {
    const match = location.pathname.match(/\/s\/(\d+)/);
    if (!match) throw new Error('当前地址不是受支持的 CoDesign 分享页。');
    return `${location.origin}/s/${match[1]}`;
  }

  function buildPrompt(selection) {
    const reference = JSON.stringify(selection, null, 2);
    return `请仅实现下面这个 CoDesign 选区，不要实现整张画板。

CoDesign selection reference:
\`\`\`json
${reference}
\`\`\`

要求：
1. 调用 codesign-mcp 的 get_artboard_spec，传入 sharingUrl、screenId、layerObjectId、selectionScope，并设置 includeSlices=true。
2. 使用返回的 selection.layers、selection.groups、selection.hierarchy、selection.bounds 和 relativeRect 还原选区结构。
3. selectionScope=region 表示实现选中边界内的完整视觉区域，而不只是当前图层的严格子节点。
4. 默认优先使用语义化结构、正常文档流、Flexbox/Grid；如果用户明确要求 absolute/canvas 式布局，则以用户要求为准，并尽量把定位限制在选区容器内。
5. 设计师导出的资源使用 download_slice；预览图只用于视觉对比，不作为生产切图来源。
6. 如果分享链接需要访问码但当前上下文未提供，请明确向用户索取，不要猜测或伪造数据。`;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${BUTTON_ID} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 84px;
  height: 28px;
  flex: 0 0 auto;
  margin-left: auto;
  padding: 0 10px;
  border: 1px solid #0052d9;
  border-radius: 4px;
  background: #0052d9;
  color: #ffffff;
  font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
  cursor: pointer;
}

#${BUTTON_ID}:hover:not(:disabled) {
  background: #266fe8;
  border-color: #266fe8;
}

#${BUTTON_ID}:focus-visible {
  outline: 2px solid #85adff;
  outline-offset: 2px;
}

#${BUTTON_ID}:disabled {
  border-color: #dcdcdc;
  background: #eeeeee;
  color: #999999;
  cursor: not-allowed;
}

#${TOAST_ID} {
  position: fixed;
  right: 24px;
  bottom: 72px;
  z-index: 2147483647;
  max-width: 420px;
  padding: 10px 14px;
  border-radius: 4px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  color: #ffffff;
  font: 500 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
}

#${TOAST_ID}[data-kind="success"] {
  background: #137333;
}

#${TOAST_ID}[data-kind="error"] {
  background: #c5221f;
}
`;
    document.head.append(style);
  }

  function showToast(message, kind) {
    document.getElementById(TOAST_ID)?.remove();
    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.dataset.kind = kind;
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), kind === 'error' ? 6000 : 3000);
  }
})();
