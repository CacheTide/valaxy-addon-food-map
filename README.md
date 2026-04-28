# valaxy-addon-food-map

[中文文档](./README.zh-CN.md)

A Valaxy addon for building a food map from Markdown FrontMatter, exporting a shared JSON file, and aggregating food-map JSON files from other blogs.

This addon is designed for two use cases:

- Valaxy blogs: write food metadata in Markdown FrontMatter and render an interactive map.
- Other frameworks: generate the same JSON format and let Valaxy sites aggregate it.

## Features

- Render a food map with city/category filters, spot list, markers, detail cards, and AMap links.
- Read local food spots from Valaxy `usePageList()` and Markdown FrontMatter.
- Merge multiple posts that refer to the same spot by `food.spotId`.
- Show a local visit timeline from `food.visit` / `food.visits`.
- Export `/food-map/index.json` during build.
- Import external food-map JSON files through `sources[]`.
- Keep private timeline data out of the shared JSON format.

## Install

```bash
pnpm add valaxy-addon-food-map
```

AMap JSAPI is loaded in the browser. Configure your AMap Web JSAPI key through environment variables:

```bash
VITE_AMAP_KEY=your_amap_web_jsapi_key
VITE_AMAP_SECURITY_JS_CODE=your_amap_security_js_code
```

Do not commit real keys to your repository. For public sites, protect AMap keys with domain allowlists in the AMap console.

## Valaxy Usage

Register the addon in `valaxy.config.ts`:

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
          name: 'Friend Food Map',
          url: 'https://example.com/food-map/index.json',
          homepage: 'https://example.com',
        },
      ],
    }),
  ],
})
```

Create a page, for example `pages/food-map/index.md`:

```md
---
title: Food Map
layout: page
nav: false
comment: false
icon: i-ri-map-pin-line
---

<ValaxyFoodMap />
```

Then run your Valaxy site:

```bash
pnpm dev
```

## Options

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

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `exportJson` | `boolean` | `true` | Export local food spots to JSON during build. |
| `jsonPath` | `string` | `/food-map/index.json` | Public path for the generated JSON file. |
| `sources` | `FoodMapExternalSource[]` | `[]` | External food-map JSON sources to load in the browser. |
| `owner` | `FoodMapOwner` | site author | Owner information written to the exported JSON. |
| `amap.keyEnv` | `string` | `VITE_AMAP_KEY` | Environment variable name for the AMap Web JSAPI key. |
| `amap.securityJsCodeEnv` | `string` | `VITE_AMAP_SECURITY_JS_CODE` | Environment variable name for the AMap security code. |

`sources[].url` can be an absolute URL or a root-relative URL, for example `/food-map/test-source.json`. Root-relative URLs must point to files that are publicly served by your site.

## FrontMatter

Add `food` metadata to normal Markdown posts.

```yaml
---
title: Example Hotpot
date: 2026-04-20
tags:
  - Food
  - Hotpot
hide: index

food:
  show: true
  spotId: example-hotpot
  name: Example Hotpot
  city: Shanghai
  address: Shanghai Huangpu District
  lng: 121.4737
  lat: 31.2304
  coordinateSystem: GCJ-02
  category: Hotpot
  price: 120
  visited: true
  rating: 4.5
  recommend:
    - Beef
    - Tripe
  visit:
    visitedAt: 2026-04-20
    people:
      - name: Alice
        url: https://example.com
      - Bob
    note: Good for dinner with friends.
  amapUrl: https://uri.amap.com/marker?position=121.4737,31.2304&name=Example%20Hotpot
  showAmapLink: true
---
```

Required fields for a visible local spot:

- `food.show: true`
- valid `food.lng`
- valid `food.lat`
- `food.visited` is not `false`

Useful fields:

| Field | Description |
| --- | --- |
| `food.spotId` | Stable id for merging multiple posts into the same spot. |
| `food.name` | Spot name. Falls back to post title. |
| `food.city` | City name used by the city filter. |
| `food.category` | Category used by the category filter. |
| `food.lng` / `food.lat` | Coordinates. Use GCJ-02 for AMap. |
| `food.price` | Average price per person. |
| `food.rating` | Optional rating. |
| `food.recommend` | Recommended dishes or items. |
| `food.amapUrl` | Optional AMap link shown in the detail card. |
| `food.showAmapLink` | Set to `false` to hide the AMap link. |
| `food.visit` | One local visit record for the timeline. |
| `food.visits` | Multiple local visit records. |
| `food.showTimeline` | Set to `false` to hide the timeline even if visits exist. |

If no `food.visit` or `food.visits` is provided, the spot is still shown, but no timeline is displayed.

## Shared JSON

During build, this addon exports local spots to:

```txt
/food-map/index.json
```

The shared JSON is intentionally limited to public spot information. It does not include local timeline data such as:

- `visits`
- `visitedAt`
- `people`

That means other sites can aggregate your food map without exposing who ate with you and when.

Example:

See also: [examples/food-map-json.example.json](./examples/food-map-json.example.json).

```json
{
  "schema": "https://valaxy.site/schemas/food-map.v1.json",
  "schemaVersion": 1,
  "generator": {
    "name": "valaxy-addon-food-map",
    "version": "0.1.1"
  },
  "owner": {
    "id": "demo-blog",
    "name": "Demo Blog",
    "url": "https://example.com"
  },
  "site": {
    "title": "Demo Food Blog",
    "url": "https://example.com",
    "homepage": "https://example.com"
  },
  "generatedAt": "2026-04-28T00:00:00.000Z",
  "coordinateSystem": "GCJ-02",
  "spots": [
    {
      "id": "demo-shanghai-coffee",
      "name": "Wutong Road Coffee",
      "city": "Shanghai",
      "address": "Shanghai Xuhui District",
      "lng": 121.44418,
      "lat": 31.20931,
      "coordinateSystem": "GCJ-02",
      "category": "Coffee",
      "price": 68,
      "rating": 4.6,
      "recommend": [
        "Dirty",
        "Basque cheesecake"
      ],
      "articleUrl": "https://example.com/posts/shanghai-coffee/",
      "amapUrl": "https://uri.amap.com/marker?position=121.44418,31.20931&name=Wutong%20Road%20Coffee",
      "source": {
        "id": "demo-blog",
        "name": "Demo Food Blog",
        "homepage": "https://example.com",
        "jsonUrl": "https://example.com/food-map/index.json",
        "type": "local"
      }
    }
  ]
}
```

### JSON Fields

Top-level fields:

| Field | Required | Description |
| --- | --- | --- |
| `schema` | Yes | Schema URL. |
| `schemaVersion` | Yes | Currently `1`. |
| `generator` | Yes | Generator name and version. |
| `owner` | No | Owner metadata. |
| `site` | No | Site metadata. |
| `generatedAt` | Yes | ISO build timestamp. |
| `coordinateSystem` | Yes | Currently `GCJ-02`. |
| `spots` | Yes | Public spot list. |

Spot fields:

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | Stable spot id. |
| `name` | Yes | Spot name. |
| `city` | Yes | City name. |
| `address` | No | Address text. |
| `lng` | Yes | Longitude. |
| `lat` | Yes | Latitude. |
| `coordinateSystem` | No | Coordinate system. Defaults to `GCJ-02`. |
| `category` | No | Food category. |
| `price` | No | Average price per person. |
| `rating` | No | Rating number. |
| `recommend` | No | Recommended items. |
| `articleUrl` | No | Public article URL. External JSON should use an absolute URL. |
| `amapUrl` | No | Public AMap URL. |
| `source` | Yes | Source metadata for the original site. |

When importing external JSON, this addon validates `schemaVersion === 1` and uses the local `sources[]` config as the displayed source. External timeline data is ignored even if present.

## Use With Other Frameworks

You do not need Valaxy to participate in the shared food map format.

For another framework, generate a public JSON file at a stable URL, for example:

```txt
https://your-site.example/food-map/index.json
```

The file only needs to follow the shared JSON format above. Then a Valaxy user can aggregate it:

```ts
addonFoodMap({
  sources: [
    {
      id: 'your-site',
      name: 'Your Food Map',
      url: 'https://your-site.example/food-map/index.json',
      homepage: 'https://your-site.example',
    },
  ],
})
```

Recommended rules for non-Valaxy implementations:

- Use `schemaVersion: 1`.
- Use GCJ-02 coordinates if the data will be rendered on AMap.
- Use absolute `articleUrl` values.
- Do not export timeline or private visit fields.
- Keep `id` stable so aggregators can deduplicate or cache data safely.

## Local Testing

For local test sources, place a JSON file under your site's `public` directory:

```txt
public/food-map/test-source.json
```

Then configure:

```ts
addonFoodMap({
  sources: [
    {
      id: 'test-source',
      name: 'Test Source',
      url: '/food-map/test-source.json',
    },
  ],
})
```

The browser will fetch it from:

```txt
http://localhost:4860/food-map/test-source.json
```

## Privacy

Local timelines are only read from local Markdown and shown on the local site. Exported and imported shared JSON files do not expose visit timeline details.

This addon treats the following as private timeline data:

- visit dates
- visit people
- timeline notes
- per-visit article URLs

If you want to publish that information, put it in a normal public blog post and link it through `articleUrl`.

## License

MIT
