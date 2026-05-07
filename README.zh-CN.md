# valaxy-addon-food-map

[English README](./README.md)

一个 Valaxy 美食地图插件。它可以从 Markdown FrontMatter 读取店铺信息，生成交互式美食地图，在构建时导出共享 JSON，并读取其他博客提供的美食地图 JSON。

这个插件同时面向两类使用者：

- Valaxy 博客：直接在文章 FrontMatter 写 `food` 元数据，然后用 `<ValaxyFoodMap />` 展示地图。
- 其他框架：只要生成同样格式的 JSON，就可以被 Valaxy 站点聚合展示。

## 功能

- 展示美食地图、城市筛选、分类筛选、店铺列表、地图标记、店铺详情卡片和高德地图链接。
- 从 Valaxy 的 `usePageList()` 和文章 FrontMatter 自动读取本地店铺。
- 使用 `food.spotId` 合并同一家店的多篇文章。
- 本站可显示 `food.visit` / `food.visits` 生成的探店时间线。
- 构建时导出 `/food-map/index.json`。
- 通过 `sources[]` 聚合其他站点的美食地图 JSON。
- 共享 JSON 不导出探店时间线隐私信息。

## 安装

```bash
pnpm add valaxy-addon-food-map
```

插件会在浏览器端加载高德 JSAPI。请通过环境变量配置高德 Web JSAPI Key：

```bash
VITE_AMAP_KEY=your_amap_web_jsapi_key
VITE_AMAP_SECURITY_JS_CODE=your_amap_security_js_code
```

不要把真实 Key 提交到仓库。使用github pages可以在Actions secrets and variables的Repository secrets中添加VITE_AMAP_KEY与VITE_AMAP_SECURITY_JS_CODE。公开站点建议在高德开放平台配置域名白名单。

## Valaxy 使用方式

在 `valaxy.config.ts` 注册插件：

```ts
import { defineValaxyConfig } from 'valaxy'
import { addonFoodMap } from 'valaxy-addon-food-map'

export default defineValaxyConfig({
  addons: [
    addonFoodMap({
      jsonPath: '/food-map/index.json',
      sources: [
        {
          id: 'friend',
          name: '朋友的美食地图',
          url: 'https://example.com/food-map/index.json',
          homepage: 'https://example.com',
        },
      ],
    }),
  ],
})
```

创建页面，例如 `pages/food-map/index.md`：

```md
---
title: 美食地图
layout: page
nav: false
comment: false
icon: i-ri-map-pin-line
---

<ValaxyFoodMap />
```

运行 Valaxy：

```bash
pnpm dev
```

## 配置项

```ts
addonFoodMap({
  exportJson: true,
  jsonPath: '/food-map/index.json',
  sources: [],
  owner: {
    id: 'your-id',
    name: 'Your Name',
    url: 'https://example.com',
    avatar: 'https://example.com/avatar.jpg',
  },
  amap: {
    keyEnv: 'VITE_AMAP_KEY',
    securityJsCodeEnv: 'VITE_AMAP_SECURITY_JS_CODE',
  },
})
```

| 配置 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `exportJson` | `boolean` | `true` | 构建时是否导出本站店铺 JSON。 |
| `jsonPath` | `string` | `/food-map/index.json` | 生成的 JSON 公共路径。 |
| `sources` | `FoodMapExternalSource[]` | `[]` | 要聚合的外部美食地图 JSON。 |
| `owner` | `FoodMapOwner` | 站点作者 | 写入导出 JSON 的作者信息。 |
| `amap.keyEnv` | `string` | `VITE_AMAP_KEY` | 高德 Web JSAPI Key 对应的环境变量名。 |
| `amap.securityJsCodeEnv` | `string` | `VITE_AMAP_SECURITY_JS_CODE` | 高德安全密钥对应的环境变量名。 |

`sources[].url` 可以是完整 URL，也可以是站点根相对路径，例如 `/food-map/test-source.json`。根相对路径对应的文件必须能被当前站点公开访问。

## FrontMatter 写法

在普通 Markdown 文章顶部添加 `food` 元数据：

```yaml
---
title: 某某火锅店
date: 2026-04-20
tags:
  - 美食
  - 火锅
hide: index

food:
  show: true
  spotId: example-hotpot
  name: 某某火锅店
  city: 上海
  address: 上海市黄浦区某某路 1 号
  lng: 121.4737
  lat: 31.2304
  coordinateSystem: GCJ-02
  category: 火锅
  price: 120
  visited: true
  rating: 4.5
  recommend:
    - 牛肉
    - 毛肚
  visit:
    visitedAt: 2026-04-20
    people:
      - name: Alice
        url: https://example.com
      - Bob
    note: 适合朋友聚餐。
  amapUrl: https://uri.amap.com/marker?position=121.4737,31.2304&name=%E6%9F%90%E6%9F%90%E7%81%AB%E9%94%85%E5%BA%97
  showAmapLink: true
---
```

店铺显示条件：

- `food.show: true`
- `food.lng` 有效
- `food.lat` 有效
- `food.visited` 不是 `false`

常用字段：

| 字段 | 说明 |
| --- | --- |
| `food.spotId` | 店铺稳定 ID，用来把多篇文章合并为同一家店。 |
| `food.name` | 店铺名；不填时回退到文章标题。 |
| `food.city` | 城市名，用于城市筛选。 |
| `food.category` | 分类，用于分类筛选。 |
| `food.lng` / `food.lat` | 经纬度。高德地图建议使用 GCJ-02 坐标。 |
| `food.price` | 人均价格。 |
| `food.rating` | 评分。 |
| `food.recommend` | 推荐菜或推荐项目。 |
| `food.amapUrl` | 店铺详情卡片里的高德地图链接。 |
| `food.showAmapLink` | 设为 `false` 可隐藏高德地图链接。 |
| `food.visit` | 单次探店记录，用于本站时间线。 |
| `food.visits` | 多次探店记录。 |
| `food.showTimeline` | 设为 `false` 可关闭时间线展示。 |

如果没有 `food.visit` 或 `food.visits`，店铺仍会显示，但不会显示探店时间线。

## 共享 JSON

构建时插件会导出本站店铺到：

```txt
/food-map/index.json
```

共享 JSON 只包含公开的店铺基础信息，不包含探店时间线隐私字段，例如：

- `visits`
- `visitedAt`
- `people`

这样其他站点可以聚合你的美食地图，但不会知道你和谁在什么时候去吃过。

示例文件见：[examples/food-map-json.example.json](./examples/food-map-json.example.json)。

核心结构：

```json
{
  "schema": "https://valaxy.site/schemas/food-map.v1.json",
  "schemaVersion": 1,
  "generator": {
    "name": "valaxy-addon-food-map",
    "version": "0.1.4"
  },
  "generatedAt": "2026-04-28T00:00:00.000Z",
  "coordinateSystem": "GCJ-02",
  "spots": [
    {
      "id": "demo-shanghai-coffee",
      "name": "梧桐路咖啡",
      "city": "上海",
      "address": "上海市徐汇区",
      "lng": 121.44418,
      "lat": 31.20931,
      "coordinateSystem": "GCJ-02",
      "category": "咖啡",
      "price": 68,
      "rating": 4.6,
      "recommend": [
        "Dirty",
        "巴斯克蛋糕"
      ],
      "articleUrl": "https://example.com/posts/shanghai-coffee/",
      "source": {
        "id": "demo-blog",
        "name": "示例美食博客",
        "homepage": "https://example.com",
        "jsonUrl": "https://example.com/food-map/index.json",
        "type": "local"
      }
    }
  ]
}
```

顶层字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schema` | 是 | Schema URL。 |
| `schemaVersion` | 是 | 当前为 `1`。 |
| `generator` | 是 | 生成器名称与版本。 |
| `owner` | 否 | 作者信息。 |
| `site` | 否 | 站点信息。 |
| `generatedAt` | 是 | ISO 格式生成时间。 |
| `coordinateSystem` | 是 | 当前建议 `GCJ-02`。 |
| `spots` | 是 | 店铺列表。 |

店铺字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 稳定店铺 ID。 |
| `name` | 是 | 店铺名。 |
| `city` | 是 | 城市名。 |
| `address` | 否 | 地址。 |
| `lng` | 是 | 经度。 |
| `lat` | 是 | 纬度。 |
| `coordinateSystem` | 否 | 坐标系，默认 `GCJ-02`。 |
| `category` | 否 | 分类。 |
| `price` | 否 | 人均价格。 |
| `rating` | 否 | 评分。 |
| `recommend` | 否 | 推荐项目。 |
| `articleUrl` | 否 | 公开文章链接；外部 JSON 建议使用完整 URL。 |
| `amapUrl` | 否 | 高德地图链接。 |
| `source` | 是 | 原始来源站点信息。 |

读取外部 JSON 时，插件会校验 `schemaVersion === 1`，并使用本地 `sources[]` 配置作为展示来源。即使外部 JSON 意外包含时间线字段，也不会被展示。

## 其他框架如何接入

其他框架不需要使用 Valaxy。只要生成一个公开可访问的 JSON 文件即可：

```txt
https://your-site.example/food-map/index.json
```

然后 Valaxy 用户可以这样聚合：

```ts
addonFoodMap({
  sources: [
    {
      id: 'your-site',
      name: '你的美食地图',
      url: 'https://your-site.example/food-map/index.json',
      homepage: 'https://your-site.example',
    },
  ],
})
```

非 Valaxy 实现建议：

- 使用 `schemaVersion: 1`。
- 如果使用高德地图展示，坐标使用 GCJ-02。
- `articleUrl` 使用完整 URL。
- 不导出时间线或私密探店字段。
- `id` 保持稳定，方便聚合方去重、缓存或调试。

## 本地测试相对路径 JSON

把测试 JSON 放到 Valaxy 站点的 `public` 目录：

```txt
public/food-map/test-source.json
```

然后配置：

```ts
addonFoodMap({
  sources: [
    {
      id: 'test-source',
      name: '测试来源',
      url: '/food-map/test-source.json',
    },
  ],
})
```

浏览器会请求：

```txt
http://localhost:4860/food-map/test-source.json
```

## 隐私说明

本地时间线只从本地 Markdown 读取，并只在本站页面展示。导出的共享 JSON 和导入的外部 JSON 都不会暴露探店时间线。

插件将这些内容视为私密时间线数据：

- 探店日期
- 同行人员
- 时间线备注
- 单次探店记录链接

如果你希望公开这些信息，请写进普通公开文章，并通过 `articleUrl` 链接到文章。

## License

MIT
