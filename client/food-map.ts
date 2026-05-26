import type {
  FoodFrontMatter,
  FoodMapExternalSource,
  FoodMapJsonGenerator,
  FoodMapJsonRoot,
  FoodMapJsonSpot,
  FoodMapPostLike,
  FoodMapSource,
  FoodSpot,
  FoodVisit,
  FoodVisitFrontMatter,
  FoodVisitPerson,
} from '../types'

export const FOOD_MAP_SCHEMA = 'https://valaxy.site/schemas/food-map.v1.json'
export const FOOD_MAP_SCHEMA_VERSION = 1
export const FOOD_MAP_GENERATOR = 'valaxy-addon-food-map'
export const FOOD_MAP_GENERATOR_INFO: FoodMapJsonGenerator = {
  name: FOOD_MAP_GENERATOR,
  version: '0.1.10',
}
export const FOOD_MAP_COORDINATE_SYSTEM = 'GCJ-02'

export const LOCAL_FOOD_MAP_SOURCE: FoodMapSource = {
  id: 'local',
  name: '本站',
  type: 'local',
}

export interface CreateFoodSpotContext {
  defaultPeople?: FoodVisitPerson[]
  includeVisits?: boolean
  source?: FoodMapSource
}

export function createFoodSpot(post: FoodMapPostLike, context: CreateFoodSpotContext = {}): FoodSpot | null {
  const food = post.food

  if (!food || !isTruthy(food.show) || isFalse(food.visited))
    return null

  const lng = toFiniteNumber(food.lng)
  const lat = toFiniteNumber(food.lat)

  if (lng === null || lat === null)
    return null

  const title = frontmatterText(post.title)
  const name = normalizeText(food.name) || title || '未命名店铺'
  const city = normalizeText(food.city) || '未填写城市'
  const category = normalizeText(food.category) || '未分类'
  const articlePath = normalizeText(post.path) || normalizeText(post.url) || '#'
  const amapUrl = getAmapUrl(food)
  const visits = context.includeVisits === false
    ? []
    : createFoodVisits(food, post, {
      articlePath,
      defaultPeople: context.defaultPeople ?? [],
      title,
    })

  return {
    id: getFoodSpotId(food, name, lng, lat),
    address: normalizeText(food.address),
    amapUrl,
    articlePath,
    articleUrl: isExternalLink(articlePath) ? articlePath : undefined,
    category,
    city,
    coordinateSystem: normalizeText(food.coordinateSystem) || FOOD_MAP_COORDINATE_SYSTEM,
    lat,
    lng,
    name,
    price: toOptionalNumber(food.price),
    rating: toOptionalNumber(food.rating),
    recommend: toStringArray(food.recommend),
    showAmapLink: Boolean(amapUrl) && shouldShowAmapLink(food),
    source: context.source ?? LOCAL_FOOD_MAP_SOURCE,
    visited: true,
    visits,
  }
}

export function mergeFoodSpots(spots: FoodSpot[]) {
  const spotMap = new Map<string, FoodSpot>()

  for (const spot of spots) {
    const existingSpot = spotMap.get(spot.id)

    if (!existingSpot) {
      spotMap.set(spot.id, {
        ...spot,
        visits: sortFoodVisits([...spot.visits]),
      })
      continue
    }

    const visits = sortFoodVisits([...existingSpot.visits, ...spot.visits])
    const latestVisit = visits[0]
    const recommend = latestVisit?.recommend.length
      ? latestVisit.recommend
      : existingSpot.recommend.length
        ? existingSpot.recommend
        : spot.recommend

    spotMap.set(spot.id, {
      ...existingSpot,
      articlePath: latestVisit?.articlePath || existingSpot.articlePath,
      articleUrl: isExternalLink(latestVisit?.articlePath || '') ? latestVisit?.articlePath : existingSpot.articleUrl,
      price: latestVisit?.price ?? existingSpot.price ?? spot.price,
      rating: latestVisit?.rating ?? existingSpot.rating ?? spot.rating,
      recommend,
      visits,
    })
  }

  return Array.from(spotMap.values())
}

export function sortFoodSpots(spots: FoodSpot[]) {
  return [...spots].sort((left, right) => {
    return left.city.localeCompare(right.city, 'zh-CN')
      || left.category.localeCompare(right.category, 'zh-CN')
      || left.name.localeCompare(right.name, 'zh-CN')
      || left.source.name.localeCompare(right.source.name, 'zh-CN')
  })
}

export function normalizeExternalSource(source: FoodMapExternalSource): FoodMapSource {
  return {
    id: source.id,
    name: source.name,
    homepage: normalizeExternalUrl(source.homepage) || undefined,
    jsonUrl: normalizeExternalUrl(source.url) || source.url,
    type: 'external',
  }
}

export function normalizeExternalFoodMap(json: unknown, sourceConfig: FoodMapExternalSource): FoodSpot[] {
  if (!json || typeof json !== 'object')
    return []

  const record = json as Partial<FoodMapJsonRoot>
  if (record.schemaVersion !== FOOD_MAP_SCHEMA_VERSION)
    return []

  const spots = Array.isArray(record.spots) ? record.spots : []
  const source = normalizeExternalSource(sourceConfig)

  return spots
    .map(spot => normalizeExternalSpot(spot, source))
    .filter((spot): spot is FoodSpot => Boolean(spot))
}

export function toFoodMapJsonSpot(spot: FoodSpot): FoodMapJsonSpot {
  return {
    id: spot.id,
    name: spot.name,
    city: spot.city,
    address: spot.address || undefined,
    lng: spot.lng,
    lat: spot.lat,
    coordinateSystem: spot.coordinateSystem || FOOD_MAP_COORDINATE_SYSTEM,
    category: spot.category || undefined,
    price: spot.price,
    rating: spot.rating,
    recommend: spot.recommend.length ? spot.recommend : undefined,
    articleUrl: spot.articlePath || undefined,
    amapUrl: spot.amapUrl,
    source: spot.source,
  }
}

export function createFoodVisits(
  food: FoodFrontMatter,
  post: FoodMapPostLike,
  context: { articlePath: string, title: string, defaultPeople?: FoodVisitPerson[] },
): FoodVisit[] {
  const rawVisits = getRawFoodVisits(food)

  if (!rawVisits.length || isFalse(food.showTimeline))
    return []

  return sortFoodVisits(rawVisits.map((visit, index) => createFoodVisit(food, visit, post, context, index)))
}

export function getRawFoodVisits(food: FoodFrontMatter): FoodVisitFrontMatter[] {
  if (Array.isArray(food.visits))
    return food.visits.filter((visit): visit is FoodVisitFrontMatter => Boolean(visit && typeof visit === 'object'))

  if (food.visit && typeof food.visit === 'object')
    return [food.visit]

  return []
}

export function sortFoodVisits(visits: FoodVisit[]) {
  return visits.sort((left, right) => getVisitSortTime(right) - getVisitSortTime(left))
}

export function getVisitSortTime(visit: FoodVisit) {
  const parsed = Date.parse(visit.visitedAt)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatPrice(price?: number) {
  return hasNumber(price) ? `¥${price}/人` : ''
}

export function formatRating(rating?: number) {
  return hasNumber(rating) ? `${rating.toFixed(1)} 分` : ''
}

export function formatRecommends(recommend: string[]) {
  return recommend.join('、')
}

export function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value))
    return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function toOptionalNumber(value: unknown) {
  return toFiniteNumber(value) ?? undefined
}

export function toStringArray(value: unknown) {
  if (Array.isArray(value))
    return value.map(item => normalizeText(item)).filter(Boolean)
  if (typeof value === 'string')
    return value.split(/[、,，]/).map(item => item.trim()).filter(Boolean)
  return []
}

export function toVisitPeople(value: unknown, fallback: FoodVisitPerson[] = []): FoodVisitPerson[] {
  if (Array.isArray(value)) {
    return value
      .map(person => normalizeVisitPerson(person))
      .filter((person): person is FoodVisitPerson => Boolean(person))
  }

  if (typeof value === 'string') {
    const people = value
      .split(/[、,，]/)
      .map(person => normalizeVisitPerson(person))
      .filter((person): person is FoodVisitPerson => Boolean(person))

    return people.length ? people : fallback
  }

  return fallback
}

export function normalizeDateText(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const dateOnly = trimmed.match(/^\d{4}-\d{2}-\d{2}/)?.[0]

    if (dateOnly)
      return dateOnly

    return formatDateText(trimmed)
  }

  if (value instanceof Date)
    return formatDateText(value)

  if (typeof value === 'number')
    return formatDateText(value)

  return ''
}

export function frontmatterText(value: unknown) {
  if (typeof value === 'string')
    return value.trim()
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const preferred = record['zh-CN'] ?? record.zh ?? record.en ?? Object.values(record).find(item => typeof item === 'string')
    return normalizeText(preferred)
  }
  return ''
}

export function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isTruthy(value: unknown) {
  return value === true || value === 'true'
}

export function isFalse(value: unknown) {
  return value === false || value === 'false'
}

export function hasNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function getEnvString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeExternalUrl(value: unknown) {
  const url = normalizeText(value)
  return isExternalLink(url) ? url : ''
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error)
    return error.message
  if (typeof error === 'string')
    return error
  return '未知错误'
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function isExternalLink(value: string) {
  return /^https?:\/\//i.test(value)
}

function normalizeExternalSpot(value: unknown, source: FoodMapSource): FoodSpot | null {
  if (!value || typeof value !== 'object')
    return null

  const spot = value as Partial<FoodMapJsonSpot>
  const lng = toFiniteNumber(spot.lng)
  const lat = toFiniteNumber(spot.lat)
  const name = normalizeText(spot.name)

  if (!name || lng === null || lat === null)
    return null

  const rawId = normalizeText(spot.id) || [name, lng.toFixed(6), lat.toFixed(6)].join('-')
  const articlePath = normalizeExternalUrl(spot.articleUrl) || '#'
  const amapUrl = normalizeExternalUrl(spot.amapUrl)

  return {
    id: `${source.id}:${rawId}`,
    address: normalizeText(spot.address),
    amapUrl,
    articlePath,
    articleUrl: articlePath !== '#' ? articlePath : undefined,
    category: normalizeText(spot.category) || '未分类',
    city: normalizeText(spot.city) || '未填写城市',
    coordinateSystem: normalizeText(spot.coordinateSystem) || FOOD_MAP_COORDINATE_SYSTEM,
    lat,
    lng,
    name,
    price: toOptionalNumber(spot.price),
    rating: toOptionalNumber(spot.rating),
    recommend: toStringArray(spot.recommend),
    showAmapLink: Boolean(amapUrl),
    source,
    visited: true,
    visits: [],
  }
}

function createFoodVisit(
  food: FoodFrontMatter,
  visit: FoodVisitFrontMatter,
  post: FoodMapPostLike,
  context: { articlePath: string, title: string, defaultPeople?: FoodVisitPerson[] },
  index: number,
): FoodVisit {
  const visitedAt = normalizeDateText(visit.visitedAt ?? visit.date ?? food.visitedAt ?? getPostDate(post))
  const articlePath = normalizeText(visit.articleUrl) || context.articlePath
  const title = normalizeText(visit.title) || context.title || '探店记录'

  return {
    id: `${articlePath}-${visitedAt || 'unknown-date'}-${index}`,
    articlePath,
    note: normalizeText(visit.note) || (index === 0 ? normalizeText(food.note) : ''),
    people: toVisitPeople(visit.people ?? food.people, context.defaultPeople ?? []),
    price: toOptionalNumber(visit.price ?? food.price),
    rating: toOptionalNumber(visit.rating ?? food.rating),
    recommend: toStringArray(visit.recommend ?? food.recommend),
    title,
    visitedAt,
  }
}

function getFoodSpotId(food: FoodFrontMatter, name: string, lng: number, lat: number) {
  const explicitId = normalizeText(food.spotId)

  if (explicitId)
    return explicitId

  return [
    name,
    lng.toFixed(6),
    lat.toFixed(6),
  ].join('-')
}

function getPostDate(post: FoodMapPostLike) {
  return post.date ?? post.updated ?? post.updatedAt ?? post.createdAt
}

function formatDateText(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime()))
    return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getAmapUrl(food: FoodFrontMatter) {
  if (typeof food.amap === 'string')
    return normalizeExternalUrl(food.amap)

  const nestedUrl = food.amap && typeof food.amap === 'object'
    ? normalizeExternalUrl(food.amap.url)
    : ''

  return normalizeExternalUrl(food.amapUrl) || nestedUrl
}

function shouldShowAmapLink(food: FoodFrontMatter) {
  if (isFalse(food.showAmapLink))
    return false

  if (food.amap && typeof food.amap === 'object' && isFalse(food.amap.show))
    return false

  return true
}

function normalizeVisitPerson(value: unknown): FoodVisitPerson | null {
  if (typeof value === 'string') {
    const name = value.trim()
    return name ? { name } : null
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const name = normalizeText(record.name)
    const url = normalizeExternalUrl(record.url) || normalizeExternalUrl(record.link)

    if (!name)
      return null

    return url ? { name, url } : { name }
  }

  return null
}
