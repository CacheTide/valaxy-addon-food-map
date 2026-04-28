import type { ValaxyNode } from 'valaxy'
import type { FoodMapAddonOptions, FoodMapJsonRoot, FoodMapOwner, FoodMapPostLike, FoodMapSite } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import fg from 'fast-glob'
import matter from 'gray-matter'
import {
  FOOD_MAP_COORDINATE_SYSTEM,
  FOOD_MAP_GENERATOR_INFO,
  FOOD_MAP_SCHEMA,
  createFoodSpot,
  mergeFoodSpots,
  sortFoodSpots,
  toFoodMapJsonSpot,
} from '../client/food-map'
import { resolveFoodMapAddonOptions } from '../client/options'

export async function generateFoodMapJson(node: ValaxyNode, rawOptions: FoodMapAddonOptions = {}, outputRoot = 'public') {
  const options = resolveFoodMapAddonOptions(rawOptions)

  if (!options.exportJson)
    return

  const userRoot = node.options.userRoot
  const pages = await fg('pages/**/*.md', {
    absolute: true,
    cwd: userRoot,
    ignore: ['**/node_modules/**', '**/.valaxy/**', '**/dist/**'],
  })

  const localSource = {
    id: 'local',
    name: getSiteTitle(node) || '本站',
    homepage: getSiteUrl(node) || undefined,
    jsonUrl: joinPublicUrl(getSiteUrl(node), options.jsonPath),
    type: 'local' as const,
  }

  const posts = await Promise.all(pages.map(async (file) => {
    const parsed = matter(await readFile(file, 'utf-8'))
    return {
      ...parsed.data,
      food: parsed.data.food,
      path: getPageRoute(userRoot, file),
    } satisfies FoodMapPostLike
  }))

  const spots = sortFoodSpots(mergeFoodSpots(posts
    .map(post => createFoodSpot(post, {
      source: localSource,
    }))
    .filter((spot): spot is NonNullable<typeof spot> => Boolean(spot))))

  const siteUrl = getSiteUrl(node)
  const json: FoodMapJsonRoot = {
    schema: FOOD_MAP_SCHEMA,
    schemaVersion: 1,
    generator: FOOD_MAP_GENERATOR_INFO,
    owner: resolveOwner(node, options.owner),
    site: resolveSite(node),
    generatedAt: new Date().toISOString(),
    coordinateSystem: FOOD_MAP_COORDINATE_SYSTEM,
    spots: spots.map((spot) => {
      const jsonSpot = toFoodMapJsonSpot({
        ...spot,
        articlePath: joinPublicUrl(siteUrl, spot.articlePath),
      })

      jsonSpot.source = localSource
      return jsonSpot
    }),
  }

  const outputPath = join(userRoot, outputRoot, stripLeadingSlash(options.jsonPath))
  await writeJson(outputPath, json)
}

function resolveOwner(node: ValaxyNode, owner?: FoodMapOwner): FoodMapOwner | undefined {
  if (owner)
    return owner

  const author = node.options.config.siteConfig.author
  if (typeof author === 'string')
    return author.trim() ? { name: author.trim() } : undefined

  const name = typeof author?.name === 'string' ? author.name.trim() : ''
  const avatar = typeof author?.avatar === 'string' ? author.avatar.trim() : ''

  if (!name && !avatar)
    return undefined

  return {
    name: name || undefined,
    avatar: avatar || undefined,
  }
}

function resolveSite(node: ValaxyNode): FoodMapSite {
  return {
    title: getSiteTitle(node) || undefined,
    url: getSiteUrl(node) || undefined,
    homepage: getSiteUrl(node) || undefined,
  }
}

function getSiteTitle(node: ValaxyNode) {
  return typeof node.options.config.siteConfig.title === 'string'
    ? node.options.config.siteConfig.title.trim()
    : ''
}

function getSiteUrl(node: ValaxyNode) {
  return typeof node.options.config.siteConfig.url === 'string'
    ? node.options.config.siteConfig.url.trim()
    : ''
}

function getPageRoute(userRoot: string, file: string) {
  const relativePath = relative(join(userRoot, 'pages'), file).replace(/\\/g, '/')
  const withoutExt = relativePath.replace(/\.md$/, '')

  if (withoutExt === 'index')
    return '/'

  if (withoutExt.endsWith('/index'))
    return `/${withoutExt.slice(0, -'/index'.length)}/`

  return `/${withoutExt}/`
}

function joinPublicUrl(siteUrl: string, path: string) {
  if (!path)
    return siteUrl
  if (/^https?:\/\//i.test(path))
    return path
  if (!siteUrl)
    return path

  const base = siteUrl.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}

function stripLeadingSlash(path: string) {
  return path.replace(/^\/+/, '')
}

async function writeJson(path: string, value: unknown) {
  await import('node:fs/promises').then(fs => fs.mkdir(dirname(path), { recursive: true }))
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}
