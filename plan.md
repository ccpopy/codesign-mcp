# CoDesign MCP Server 实施计划

> 版本：基于 `F:\project\codesign\har\codesign.qq.com.har` 调整  
> 目标：实现本地 MCP server，读取 CoDesign 分享稿的画板列表、标注信息、预览图和切图资源。

---

## HAR 结论

本次 HAR 共 251 条请求，其中 179 条包含响应体。已确认的可用链路如下。

### 分享页流程

| 步骤 | 请求 | 结论 |
|---|---|---|
| 打开分享页 | `GET /app/s/:sharingId` | 分享页入口 |
| 未登录检查 | `GET /api/user` | 未登录返回 401，扫码后返回用户信息 |
| 分享密码 | `POST /api/sharings/:sharingId/state-keys` | 请求体字段为 `password`，成功返回 `key` 和 `expires` |
| 分享内容 | `GET /api/sharings/:sharingId` | 返回设计稿、画板列表、画板 `meta_url`、`slices_url`、预览图 URL |
| 登录轮询 | `GET /oauth/check` | 扫码登录期间轮询 |
| 登录后设计稿 | `GET /api/designs/:designId` | 未登录时 401，登录后 200；MVP 不依赖它 |

### 画板数据

`GET /api/sharings/:sharingId` 中的 `designs[].screens[]` 已包含 MVP 需要的画板索引字段：

- `id`
- `object_id`
- `name`
- `width`
- `height`
- `frame`
- `meta_url`
- `slices_url`
- `slices_count`
- `image.url`
- `image.cover_url`
- `image.slices_base_url`

### 标注数据

标注主体来自 CDN JSON：

```text
GET https://cdn4.codesign.qq.com/meta/YYYY/MM/DD/:token/:token/:uuid.json
```

HAR 中观察到两类 meta JSON：

| 类型 | 结构 | 用途 |
|---|---|---|
| spec object | `object_id`, `name`, `page_id`, `page_name`, `width`, `height`, `rect`, `layers`, `groups`, `css` | 画板和图层标注 |
| slice manifest array | `name`, `object_id`, `rect`, `exportables[].screenshot.url` | 切图清单 |

图层标注字段已确认：

- 通用：`parent_id`, `object_id`, `master_id`, `type`, `name`, `rect`, `layerIndex`, `exportable`, `rotation`, `radius`, `borders`, `fills`, `shadows`, `effects`, `opacity`, `css`
- 文本：`content`, `color`, `fontSize`, `fontFace`, `fontWeight`, `textAlign`, `letterSpacing`, `lineHeight`, `paragraphSpacing`, `textStyleName`
- 填充颜色：`fills[].color`, `color-hex`, `css-rgba`, `ui-color`

### 切图数据

画板对象提供：

- `slices_url`: 指向切图清单 JSON
- `image.slices_base_url`: 指向按序号组织的切图目录

切图清单中的 `exportables[].screenshot.url` 是可下载资源 URL。

### 不进入 MVP 的内容

HAR 中没有足够证据支持以下能力：

- 项目级列表接口
- 团队项目列表接口
- 原型流转关系
- Webhook 或事件推送
- `/api/v2/artboard/.../spec` 类接口
- DOM 解析兜底

---

## 实施范围

### P0

| 工具 | 参数 | 行为 |
|---|---|---|
| `codesign_status` | 无 | 返回 profile 路径、登录态、最近错误摘要 |
| `codesign_login` | 无 | 打开可见 Chromium，用户扫码登录，登录态写入 persistent profile |
| `list_artboards` | `sharingUrl`, `password?` | 返回分享稿里的设计稿和画板列表 |
| `get_artboard_spec` | `sharingUrl`, `screenId?`, `objectId?`, `screenName?`, `password?` | 返回指定画板的标注 JSON |
| `get_artboard_image` | `sharingUrl`, `screenId?`, `objectId?`, `screenName?`, `password?` | 返回画板预览图或封面图 |
| `debug_collect_network` | `sharingUrl`, `password?`, `timeoutMs?` | 返回脱敏网络摘要 |

### P1

| 工具 | 参数 | 行为 |
|---|---|---|
| `download_slice` | `sharingUrl`, `screenId?`, `objectId?`, `screenName?`, `layerObjectId?`, `password?` | 读取 `slices_url`，按 `object_id` 匹配并下载切图 |
| `codesign_logout` | 无 | 清理本地 profile；执行前在工具结果中列出目标目录 |

如果分享稿包含多个画板，而调用方没有传入 `screenId`、`objectId` 或 `screenName`，`get_artboard_spec`、`get_artboard_image` 和 `download_slice` 返回 `isError: true`，错误码为 `SCREEN_SELECTOR_REQUIRED`，同时返回可选画板列表。

---

## 架构

### 数据路径

1. 从 `sharingUrl` 解析 `sharingId`。
2. 如果有 `password`，在 CoDesign 同源上下文中请求 `POST /api/sharings/:sharingId/state-keys`。
3. 请求 `GET /api/sharings/:sharingId`。
4. 从 `designs[].screens[]` 定位目标画板。
5. 使用 `meta_url` 拉取 spec object。
6. 使用 `slices_url` 拉取 slice manifest。
7. 将 spec object 和 slice manifest 归一化为 MCP 返回结构。

### 浏览器职责

浏览器只承担三件事：

- 扫码登录
- 持久化 CoDesign 会话
- 在 CoDesign 同源上下文中执行需要 `state-key`、cookie 或 Authorization 的 API 请求

CDN 的 `meta_url`、`slices_url`、预览图和切图资源在 HAR 中没有依赖 cookie，MVP 中使用 Node `fetch` 直接读取。

### `lazy-launch` 可行性

`lazy-launch` 可行，但需要改成可配置的 persistent context 策略。

| 场景 | 策略 |
|---|---|
| MCP server 启动 | 不启动浏览器 |
| `codesign_login` | 启动可见浏览器，扫码完成后保留 profile |
| 首次数据工具调用 | 懒启动 headless persistent context |
| 连续工具调用 | 复用同一个 context，新建独立 page |
| 空闲关闭 | 默认 10 分钟无活跃调用后关闭 context |
| 频繁批量读取 | 允许 `CODESIGN_KEEP_BROWSER=1` 禁用空闲关闭 |

关闭 context 不删除 `userDataDir`，下次冷启动仍能复用扫码登录态。冷启动主要成本是 Chromium 启动和页面初始化；CDN meta 和切图资源走 Node `fetch` 后，浏览器只在 API 阶段参与，性能风险可控。

### 并发

- 进程内只维护一个 persistent context。
- 每个工具调用创建独立 page。
- 用 active-call 计数保护 idle shutdown。
- 同一个 page 只服务一个工具调用。
- 不共享响应监听器。

---

## 解析模型

### Artboard

```jsonc
{
  "id": "screen.id",
  "objectId": "screen.object_id",
  "name": "screen.name",
  "width": "screen.width",
  "height": "screen.height",
  "frame": "screen.frame",
  "imageUrl": "screen.image.url",
  "coverUrl": "screen.image.cover_url",
  "metaUrl": "screen.meta_url",
  "slicesUrl": "screen.slices_url"
}
```

### Spec

```jsonc
{
  "artboard": {
    "objectId": "meta.object_id",
    "name": "meta.name",
    "pageId": "meta.page_id",
    "pageName": "meta.page_name",
    "width": "meta.width",
    "height": "meta.height",
    "rect": "meta.rect"
  },
  "layers": [],
  "groups": [],
  "css": [],
  "slices": []
}
```

### Layer

保留 HAR 已确认字段，不补造字段：

```jsonc
{
  "parentId": "parent_id",
  "objectId": "object_id",
  "masterId": "master_id",
  "type": "type",
  "name": "name",
  "rect": "rect",
  "layerIndex": "layerIndex",
  "exportable": "exportable",
  "rotation": "rotation",
  "radius": "radius",
  "borders": "borders",
  "fills": "fills",
  "shadows": "shadows",
  "effects": "effects",
  "opacity": "opacity",
  "text": {
    "content": "content",
    "fontSize": "fontSize",
    "fontFace": "fontFace",
    "fontWeight": "fontWeight",
    "textAlign": "textAlign",
    "letterSpacing": "letterSpacing",
    "lineHeight": "lineHeight",
    "paragraphSpacing": "paragraphSpacing",
    "textStyleName": "textStyleName",
    "color": "color"
  },
  "css": "css"
}
```

文本字段只在源数据存在时输出。

### Slice

```jsonc
{
  "name": "name",
  "objectId": "object_id",
  "masterId": "master_id",
  "rect": "rect",
  "exportables": [
    {
      "name": "name",
      "scale": "scale",
      "size": "size",
      "format": "format",
      "objectId": "object_id",
      "exported": "exported",
      "url": "screenshot.url",
      "width": "screenshot.width",
      "height": "screenshot.height",
      "mime": "screenshot.mime"
    }
  ]
}
```

---

## 错误策略

| 错误码 | 场景 |
|---|---|
| `INVALID_SHARING_URL` | URL 中无法解析 `sharingId` |
| `NEED_PASSWORD` | 分享稿需要密码但未提供 |
| `INVALID_PASSWORD` | `state-keys` 返回 403 |
| `NEED_LOGIN` | API 返回 401，且当前工具需要登录 |
| `SHARING_NOT_FOUND` | `GET /api/sharings/:sharingId` 404 或结构不匹配 |
| `SCREEN_SELECTOR_REQUIRED` | 多画板但未指定目标画板 |
| `SCREEN_NOT_FOUND` | 指定画板不存在 |
| `META_FETCH_FAILED` | `meta_url` 请求失败 |
| `META_SCHEMA_MISMATCH` | meta JSON 结构不符合已确认 schema |
| `SLICE_FETCH_FAILED` | `slices_url` 请求失败 |
| `SLICE_NOT_FOUND` | 找不到指定图层切图 |

默认行为：

- 不做 DOM 解析兜底。
- 不返回截图冒充标注结果。
- 不吞掉 schema 错误。
- 不默认缓存业务结果。
- 不默认重试会改变状态的请求。

---

## 文件结构

```text
src/
├── index.ts
├── server.ts
├── config.ts
├── logger.ts
├── browser/
│   ├── manager.ts
│   └── session.ts
├── codesign/
│   ├── sharing.ts
│   ├── meta.ts
│   ├── slices.ts
│   ├── parser.ts
│   ├── errors.ts
│   └── types.ts
├── tools/
│   ├── login.ts
│   ├── status.ts
│   ├── artboards.ts
│   ├── spec.ts
│   ├── image.ts
│   ├── slices.ts
│   └── diagnostics.ts
└── utils/
    ├── http.ts
    ├── url.ts
    └── redact.ts
```

```text
data/
├── profile/
├── artifacts/
└── codesign-mcp.log
```

```text
har/
└── codesign.qq.com.har
```

---

## 里程碑

### Milestone 1：MCP 骨架

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/server.ts`
- `logger.ts`
- `codesign_status`

验收：

- `npm run build` 通过。
- stdio 不输出普通日志。
- MCP 客户端能发现工具。

### Milestone 2：浏览器会话

- persistent context
- visible login
- headless lazy-launch
- active-call 计数
- idle shutdown

验收：

- 扫码登录后重启 server，登录态仍存在。
- `GET /api/user` 未登录返回 `NEED_LOGIN`，登录后返回已登录。

### Milestone 3：分享稿和画板列表

- 解析 `sharingId`
- 处理 `state-keys`
- 获取 `GET /api/sharings/:sharingId`
- 实现 `list_artboards`

验收：

- 能返回 HAR 中 14 个画板的脱敏结构。
- 密码错误返回 `INVALID_PASSWORD`。

### Milestone 4：标注解析

- 拉取 `meta_url`
- 解析 spec object
- 归一化 `layers`、`groups`、文本字段、颜色字段和 CSS 数组
- 实现 `get_artboard_spec`

验收：

- 能解析 HAR 中已出现的 spec object。
- schema 缺失或类型变化时返回 `META_SCHEMA_MISMATCH`。

### Milestone 5：图片和切图

- `get_artboard_image`
- 拉取 `slices_url`
- 解析 slice manifest
- `download_slice`

验收：

- 能按 `object_id` 找到切图。
- 下载结果返回本地 artifact 路径和原始资源信息。

### Milestone 6：诊断

- `debug_collect_network`
- 脱敏 URL、header name、status、mimeType、top-level JSON keys
- HAR fixture 测试

验收：

- 诊断输出不包含 Cookie、Authorization、password、state-key 值。
- fixture 覆盖 sharing、spec object、slice manifest。

---

## 暂缓项

- 项目级列表
- 团队级列表
- 原型流
- Webhook
- DOM 兜底
- 默认缓存
- 多账号 profile
