<script setup lang="ts">
import type { FoodMapExternalSource, FoodSpot, FoodVisitPerson } from '../types'
import {
  createFoodSpot,
  escapeHtml,
  formatPrice,
  formatRating,
  formatRecommends,
  getEnvString,
  getErrorMessage,
  hasNumber,
  isExternalLink,
  mergeFoodSpots,
  normalizeExternalFoodMap,
  sortFoodSpots,
} from '../client/food-map'
import { useAddonFoodMap } from '../client/options'
import { usePageList, useSiteConfig } from 'valaxy'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

interface AMapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap
  Marker: new (options: Record<string, unknown>) => AMapMarker
  InfoWindow: new (options: Record<string, unknown>) => AMapInfoWindow
  Pixel: new (x: number, y: number) => AMapPixel
  Scale?: new () => unknown
  ToolBar?: new (options?: Record<string, unknown>) => unknown
}

interface AMapPixel {
  getX?: () => number
  getY?: () => number
  x?: number
  y?: number
}

interface AMapMap {
  add: (overlays: AMapMarker[] | AMapMarker) => void
  remove: (overlays: AMapMarker[] | AMapMarker) => void
  addControl: (control: unknown) => void
  getCenter: () => { lng: number, lat: number }
  getZoom: () => number
  lngLatToContainer?: (position: [number, number]) => AMapPixel
  resize?: () => void
  setCenter: (center: [number, number], immediately?: boolean, duration?: number) => void
  setFitView: (
    overlays?: AMapMarker[],
    immediately?: boolean,
    avoid?: [number, number, number, number],
    maxZoom?: number,
  ) => void
  setZoomAndCenter: (zoom: number, center: [number, number], immediately?: boolean, duration?: number) => void
  destroy: () => void
}

interface AMapMarker {
  on: (event: 'click', handler: () => void) => void
}

interface AMapInfoWindow {
  open: (map: AMapMap, position: [number, number]) => void
  close: () => void
  setContent: (content: string | HTMLElement) => void
}

const CHINA_CENTER: [number, number] = [104.195397, 35.86166]
const AMAP_CALLBACK_NAME = '__foodMapAmapLoaded'
const AMAP_PLUGINS = ['AMap.Scale', 'AMap.ToolBar']
const FOCUS_ZOOM = 16
const SINGLE_SPOT_ZOOM = 15
const FIT_VIEW_PADDING: [number, number, number, number] = [48, 48, 48, 48]
const INFO_WINDOW_TARGET_Y_RATIO = 0.78
const INFO_WINDOW_TARGET_Y_MIN = 300
const INFO_WINDOW_TARGET_BOTTOM_GAP = 44
const INFO_WINDOW_TARGET_TOLERANCE = 20
const MAP_VIEW_EDGE_PADDING = 36
const MAP_LIST_MOVE_DURATION = 280
const MAP_TILE_SIZE = 256
const MAX_MERCATOR_LAT = 85.05112878
const FOCUS_ZOOM_TOLERANCE = 0.1

let amapLoadPromise: Promise<AMapNamespace> | null = null
const markerCache = new Map<string, AMapMarker>()
let visibleMarkerIds = new Set<string>()
let activeInfoSpotId = ''

const pageList = usePageList()
const siteConfig = useSiteConfig()
const foodMapOptions = useAddonFoodMap()
const selectedCity = ref('')
const selectedCategory = ref('')
const loading = ref(false)
const externalLoading = ref(false)
const mapReady = ref(false)
const errorMessage = ref('')
const externalErrorMessage = ref('')
const activeSpot = ref<FoodSpot | null>(null)
const mapContainer = ref<HTMLDivElement>()
const AMapRef = shallowRef<AMapNamespace>()
const mapRef = shallowRef<AMapMap>()
const infoWindowRef = shallowRef<AMapInfoWindow>()
const markerRefs = shallowRef<AMapMarker[]>([])
const externalSpots = ref<FoodSpot[]>([])

const amapKey = computed(() => getEnvString(import.meta.env[foodMapOptions.value.amap?.keyEnv || 'VITE_AMAP_KEY']))
const amapSecurityJsCode = computed(() => getEnvString(import.meta.env[foodMapOptions.value.amap?.securityJsCodeEnv || 'VITE_AMAP_SECURITY_JS_CODE']))
const externalSources = computed(() => foodMapOptions.value.sources.filter(isEnabledExternalSource))

const foodSpots = computed<FoodSpot[]>(() => {
  const localSpots = pageList.value
    .map(post => createFoodSpot(post, {
      defaultPeople: getDefaultVisitPeople(),
    }))
    .filter((spot): spot is FoodSpot => Boolean(spot))

  return sortFoodSpots([
    ...mergeFoodSpots(localSpots),
    ...externalSpots.value,
  ])
})

const cities = computed(() => {
  return Array.from(new Set(foodSpots.value.map(spot => spot.city))).sort((left, right) => left.localeCompare(right, 'zh-CN'))
})

const categories = computed(() => {
  return Array.from(new Set(foodSpots.value.map(spot => spot.category))).sort((left, right) => left.localeCompare(right, 'zh-CN'))
})

const filteredSpots = computed(() => {
  return foodSpots.value.filter((spot) => {
    return (!selectedCity.value || spot.city === selectedCity.value)
      && (!selectedCategory.value || spot.category === selectedCategory.value)
  })
})

const currentMapHint = computed(() => {
  if (loading.value)
    return '高德地图加载中…'
  if (externalLoading.value)
    return '外部美食地图加载中…'
  if (errorMessage.value)
    return errorMessage.value
  if (externalErrorMessage.value)
    return externalErrorMessage.value
  if (!foodSpots.value.length)
    return '还没有配置 food.show: true 且坐标有效的探店文章。'
  if (!filteredSpots.value.length)
    return '当前筛选下没有店铺，试试清除筛选。'
  return ''
})

onMounted(async () => {
  await nextTick()
  await fetchExternalFoodMaps()
  await initMap()
})

onBeforeUnmount(() => {
  infoWindowRef.value?.close()
  activeInfoSpotId = ''
  if (mapRef.value && markerRefs.value.length)
    mapRef.value.remove(markerRefs.value)
  markerCache.clear()
  visibleMarkerIds.clear()
  markerRefs.value = []
  mapRef.value?.destroy()
})

watch(filteredSpots, () => {
  if (activeSpot.value && !filteredSpots.value.some(spot => spot.id === activeSpot.value?.id)) {
    activeSpot.value = null
    infoWindowRef.value?.close()
  }
  renderMarkers()
}, { flush: 'post' })

watch(cities, (value) => {
  if (selectedCity.value && !value.includes(selectedCity.value))
    selectedCity.value = ''
})

watch(categories, (value) => {
  if (selectedCategory.value && !value.includes(selectedCategory.value))
    selectedCategory.value = ''
})

watch(externalSources, () => {
  fetchExternalFoodMaps()
}, { deep: true })

async function fetchExternalFoodMaps() {
  const sources = externalSources.value

  if (!sources.length) {
    externalSpots.value = []
    externalErrorMessage.value = ''
    return
  }

  externalLoading.value = true
  externalErrorMessage.value = ''

  const settled = await Promise.all(sources.map(async (source) => {
    try {
      const response = await fetch(source.url, { cache: 'no-store' })

      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`)

      return normalizeExternalFoodMap(await response.json(), source)
    }
    catch (error) {
      console.warn(`[valaxy-addon-food-map] Failed to load source "${source.id}"`, error)
      externalErrorMessage.value = '部分外部美食地图加载失败。'
      return []
    }
  }))

  externalSpots.value = settled.flat()
  externalLoading.value = false
}

async function initMap() {
  if (!mapContainer.value)
    return

  if (!amapKey.value) {
    errorMessage.value = '缺少 VITE_AMAP_KEY，请在构建环境中配置高德 Web 端 JSAPI Key。'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    if (amapSecurityJsCode.value) {
      window._AMapSecurityConfig = {
        securityJsCode: amapSecurityJsCode.value,
      }
    }

    const AMap = await loadAMapScript(amapKey.value)

    AMapRef.value = AMap
    mapRef.value = new AMap.Map(mapContainer.value, {
      center: getMapCenter(),
      resizeEnable: true,
      viewMode: '2D',
      zoom: filteredSpots.value.length ? 12 : 4,
    })

    if (AMap.Scale)
      mapRef.value.addControl(new AMap.Scale())
    if (AMap.ToolBar)
      mapRef.value.addControl(new AMap.ToolBar({ position: 'RB' }))

    infoWindowRef.value = new AMap.InfoWindow({
      autoMove: false,
      closeWhenClickMap: true,
      isCustom: false,
      offset: new AMap.Pixel(0, -14),
    })
    mapReady.value = true
    renderMarkers()
  }
  catch (error) {
    errorMessage.value = `高德地图加载失败：${getErrorMessage(error)}`
  }
  finally {
    loading.value = false
  }
}

function renderMarkers() {
  if (!mapReady.value || !mapRef.value || !AMapRef.value)
    return

  pruneMarkerCache()

  if (!filteredSpots.value.length) {
    if (markerRefs.value.length)
      mapRef.value.remove(markerRefs.value)
    visibleMarkerIds = new Set()
    markerRefs.value = []
    return
  }

  const nextVisibleMarkerIds = new Set(filteredSpots.value.map(spot => spot.id))
  const markersToRemove = Array.from(visibleMarkerIds)
    .filter(id => !nextVisibleMarkerIds.has(id))
    .map(id => markerCache.get(id))
    .filter((marker): marker is AMapMarker => Boolean(marker))
  const markersToAdd: AMapMarker[] = []

  const markers = filteredSpots.value.map((spot) => {
    let marker = markerCache.get(spot.id)

    if (!marker) {
      marker = createMarker(spot)
      markerCache.set(spot.id, marker)
    }

    if (!visibleMarkerIds.has(spot.id))
      markersToAdd.push(marker)

    return marker
  })

  if (markersToRemove.length)
    mapRef.value.remove(markersToRemove)
  if (markersToAdd.length)
    mapRef.value.add(markersToAdd)

  visibleMarkerIds = nextVisibleMarkerIds
  markerRefs.value = markers

  if (activeSpot.value && filteredSpots.value.some(spot => spot.id === activeSpot.value?.id)) {
    focusMapOnSpot(activeSpot.value, true)
    return
  }

  fitMapToMarkers()
}

function createMarker(spot: FoodSpot) {
  const AMap = AMapRef.value

  if (!AMap)
    throw new Error('AMap is not initialized.')

  const marker = new AMap.Marker({
    anchor: 'bottom-center',
    content: getMarkerContent(spot),
    position: [spot.lng, spot.lat],
    title: spot.name,
  })

  marker.on('click', () => focusSpot(spot))
  return marker
}

function pruneMarkerCache() {
  const spotIds = new Set(foodSpots.value.map(spot => spot.id))
  const markersToRemove: AMapMarker[] = []

  for (const [id, marker] of markerCache) {
    if (spotIds.has(id))
      continue

    markerCache.delete(id)
    visibleMarkerIds.delete(id)
    markersToRemove.push(marker)
  }

  if (markersToRemove.length)
    mapRef.value?.remove(markersToRemove)
}

function loadAMapScript(key: string) {
  const currentAMap = getWindowAMap()

  if (currentAMap)
    return Promise.resolve(currentAMap)

  if (amapLoadPromise)
    return amapLoadPromise

  amapLoadPromise = new Promise<AMapNamespace>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-food-map-amap]')

    window[AMAP_CALLBACK_NAME] = () => {
      cleanupAmapCallback()

      const loadedAMap = getWindowAMap()

      if (loadedAMap)
        resolve(loadedAMap)
      else
        reject(new Error('高德地图脚本已加载，但 window.AMap 不存在。'))
    }

    if (existingScript)
      return

    const script = document.createElement('script')
    script.dataset.foodMapAmap = 'true'
    script.async = true
    script.defer = true
    script.src = getAmapScriptUrl(key)
    script.onerror = () => {
      cleanupAmapCallback()
      script.remove()
      amapLoadPromise = null
      reject(new Error('无法加载高德地图 JSAPI 脚本，请检查网络、Key 和域名白名单。'))
    }

    document.head.appendChild(script)
  })

  return amapLoadPromise
}

function getWindowAMap() {
  return window.AMap as AMapNamespace | undefined
}

function getAmapScriptUrl(key: string) {
  const params = new URLSearchParams({
    callback: AMAP_CALLBACK_NAME,
    key,
    plugin: AMAP_PLUGINS.join(','),
    v: '2.0',
  })

  return `https://webapi.amap.com/maps?${params.toString()}`
}

function cleanupAmapCallback() {
  delete window[AMAP_CALLBACK_NAME]
}

function fitMapToMarkers() {
  if (!mapRef.value || !markerRefs.value.length)
    return

  if (filteredSpots.value.length === 1) {
    const spot = filteredSpots.value[0]
    mapRef.value.resize?.()
    mapRef.value.setZoomAndCenter(SINGLE_SPOT_ZOOM, [spot.lng, spot.lat], true)
    return
  }

  mapRef.value.resize?.()
  mapRef.value.setFitView(markerRefs.value, true, FIT_VIEW_PADDING, SINGLE_SPOT_ZOOM)
}

function focusSpot(spot: FoodSpot) {
  activeSpot.value = spot
  focusMapOnSpot(spot)
}

function focusMapOnSpot(spot: FoodSpot) {
  const map = mapRef.value
  const infoWindow = infoWindowRef.value

  if (!map || !infoWindow)
    return

  const position: [number, number] = [spot.lng, spot.lat]
  const shouldRefreshInfoWindow = activeInfoSpotId !== spot.id

  if (shouldRefreshInfoWindow) {
    infoWindow.close()
    infoWindow.setContent(getInfoWindowContent(spot))
    activeInfoSpotId = spot.id
  }

  moveMapForFocus(position)

  if (shouldRefreshInfoWindow || !isPositionAtInfoWindowTarget(position))
    infoWindow.open(map, position)
}

function moveMapToPosition(
  position: [number, number],
  immediately = true,
  duration?: number,
) {
  const map = mapRef.value

  if (!map)
    return

  map.setZoomAndCenter(FOCUS_ZOOM, position, immediately, duration)
}

function moveMapForFocus(position: [number, number]) {
  if (isPositionAtInfoWindowTarget(position))
    return

  const isVisible = isPositionInMapView(position)
  const targetCenter = getInfoWindowFriendlyCenter(position, FOCUS_ZOOM)
  const shouldJump = !isVisible

  moveMapToPosition(targetCenter, shouldJump, shouldJump ? undefined : MAP_LIST_MOVE_DURATION)
}

function getInfoWindowFriendlyCenter(position: [number, number], zoom = mapRef.value?.getZoom() || FOCUS_ZOOM) {
  const container = mapContainer.value

  if (!container)
    return position

  const spotWorldPixel = lngLatToWorldPixel(position, zoom)
  const targetPixel = {
    x: container.clientWidth / 2,
    y: getInfoWindowTargetY(container.clientHeight),
  }
  const centerWorldPixel = {
    x: spotWorldPixel.x + container.clientWidth / 2 - targetPixel.x,
    y: spotWorldPixel.y + container.clientHeight / 2 - targetPixel.y,
  }

  return worldPixelToLngLat(centerWorldPixel, zoom)
}

function getInfoWindowTargetY(containerHeight: number) {
  return Math.min(
    Math.max(containerHeight * INFO_WINDOW_TARGET_Y_RATIO, INFO_WINDOW_TARGET_Y_MIN),
    Math.max(containerHeight - INFO_WINDOW_TARGET_BOTTOM_GAP, INFO_WINDOW_TARGET_Y_MIN),
  )
}

function isPositionInMapView(position: [number, number], padding = MAP_VIEW_EDGE_PADDING) {
  const pixel = getPositionPixel(position)
  const container = mapContainer.value

  if (!pixel || !container)
    return false

  const x = getPixelX(pixel)
  const y = getPixelY(pixel)

  return x >= padding
    && x <= container.clientWidth - padding
    && y >= padding
    && y <= container.clientHeight - padding
}

function isPositionAtInfoWindowTarget(position: [number, number]) {
  const pixel = getPositionPixel(position)
  const container = mapContainer.value
  const map = mapRef.value

  if (!pixel || !container || !map)
    return false

  return Math.abs(map.getZoom() - FOCUS_ZOOM) <= FOCUS_ZOOM_TOLERANCE
    && Math.abs(getPixelX(pixel) - container.clientWidth / 2) <= INFO_WINDOW_TARGET_TOLERANCE
    && Math.abs(getPixelY(pixel) - getInfoWindowTargetY(container.clientHeight)) <= INFO_WINDOW_TARGET_TOLERANCE
}

function getPositionPixel(position: [number, number]) {
  return mapRef.value?.lngLatToContainer?.(position)
}

function getPixelX(pixel: AMapPixel) {
  return typeof pixel.getX === 'function' ? pixel.getX() : pixel.x || 0
}

function getPixelY(pixel: AMapPixel) {
  return typeof pixel.getY === 'function' ? pixel.getY() : pixel.y || 0
}

function lngLatToWorldPixel(position: [number, number], zoom: number) {
  const scale = MAP_TILE_SIZE * 2 ** zoom
  const lng = position[0]
  const lat = clamp(position[1], -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT)
  const sinLat = Math.sin(lat * Math.PI / 180)

  return {
    x: (lng + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  }
}

function worldPixelToLngLat(pixel: { x: number, y: number }, zoom: number): [number, number] {
  const scale = MAP_TILE_SIZE * 2 ** zoom
  const lng = pixel.x / scale * 360 - 180
  const mercator = Math.PI - 2 * Math.PI * pixel.y / scale
  const lat = Math.atan(Math.sinh(mercator)) * 180 / Math.PI

  return [lng, clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT)]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resetFilters() {
  selectedCity.value = ''
  selectedCategory.value = ''
}

function isEnabledExternalSource(source: FoodMapExternalSource) {
  return source.enabled !== false
    && Boolean(source.id?.trim())
    && Boolean(source.name?.trim())
    && Boolean(source.url?.trim())
}

function getDefaultVisitPeople(): FoodVisitPerson[] {
  const author = siteConfig.value.author
  const name = typeof author === 'string'
    ? author.trim()
    : typeof author?.name === 'string'
      ? author.name.trim()
      : ''

  return name ? [{ name }] : []
}

function getMapCenter(): [number, number] {
  const firstSpot = filteredSpots.value[0] ?? foodSpots.value[0]

  if (!firstSpot)
    return CHINA_CENTER

  return [firstSpot.lng, firstSpot.lat]
}

function getMarkerContent(spot: FoodSpot) {
  return [
    `<button class="food-map-marker" type="button" aria-label="${escapeHtml(spot.name)}"></button>`,
  ].join('')
}

function getInfoWindowContent(spot: FoodSpot) {
  const meta = [
    spot.city,
    spot.category,
    formatPrice(spot.price),
    formatRating(spot.rating),
    spot.source.type === 'external' ? spot.source.name : '',
  ].filter(Boolean)
  const metaHtml = meta.length
    ? `<div class="food-map-info-window__meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
    : ''
  const address = spot.address
    ? `<p class="food-map-info-window__address">${escapeHtml(spot.address)}</p>`
    : ''
  const href = resolveHref(spot.articlePath)
  const externalAttrs = isExternalLink(spot.articlePath) ? ' target="_blank" rel="noopener noreferrer"' : ''

  return [
    '<article class="food-map-info-window">',
    `<h3>${escapeHtml(spot.name)}</h3>`,
    metaHtml,
    address,
    `<a class="food-map-info-window__link" href="${escapeHtml(href)}"${externalAttrs}>查看探店文章</a>`,
    '</article>',
  ].join('')
}

function resolveHref(value: string) {
  if (!value || value === '#')
    return '#'
  if (isExternalLink(value))
    return value

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const path = value.startsWith('/') ? value : `/${value}`
  return `${base}${path}` || '/'
}
</script>

<template>
  <section class="food-map" aria-label="美食地图">
    <div class="food-map__filters yun-card" aria-label="美食地图筛选">
      <label>
        <span>城市</span>
        <select v-model="selectedCity">
          <option value="">
            全部城市
          </option>
          <option v-for="city in cities" :key="city" :value="city">
            {{ city }}
          </option>
        </select>
      </label>

      <label>
        <span>分类</span>
        <select v-model="selectedCategory">
          <option value="">
            全部分类
          </option>
          <option v-for="category in categories" :key="category" :value="category">
            {{ category }}
          </option>
        </select>
      </label>

      <button
        v-if="selectedCity || selectedCategory"
        class="food-map__reset"
        type="button"
        @click="resetFilters"
      >
        清除筛选
      </button>

      <div class="food-map__stats" aria-label="店铺数量统计" aria-live="polite">
        <strong>{{ filteredSpots.length }}</strong>
        <span>/ {{ foodSpots.length }} 家店铺</span>
      </div>
    </div>

    <div class="food-map__body yun-card">
      <aside class="food-map__list" aria-label="店铺列表">
        <button
          v-for="spot in filteredSpots"
          :key="spot.id"
          class="food-map__list-item"
          :class="{ 'is-active': activeSpot?.id === spot.id }"
          type="button"
          @click="focusSpot(spot)"
        >
          <span class="food-map__list-title">{{ spot.name }}</span>
          <span class="food-map__list-meta">
            <span>{{ spot.city }}</span>
            <span>{{ spot.category }}</span>
            <span v-if="spot.source.type === 'external'">来源：{{ spot.source.name }}</span>
            <span v-if="hasNumber(spot.rating)">{{ formatRating(spot.rating) }}</span>
            <span v-if="spot.visits.length > 1">{{ spot.visits.length }} 次探店</span>
          </span>
          <span v-if="spot.address" class="food-map__list-address">{{ spot.address }}</span>
        </button>

        <p v-if="!filteredSpots.length" class="food-map__empty">
          暂无符合条件的店铺。
        </p>
      </aside>

      <div class="food-map__map-card">
        <div ref="mapContainer" class="food-map__map" />
        <div v-if="currentMapHint" class="food-map__map-hint" role="status">
          {{ currentMapHint }}
        </div>
      </div>
    </div>

    <article v-if="activeSpot" class="food-map__active-card yun-card">
      <div>
        <p class="food-map__eyebrow">
          当前店铺
        </p>
        <h2>{{ activeSpot.name }}</h2>
      </div>

      <dl>
        <div>
          <dt>城市</dt>
          <dd>{{ activeSpot.city }}</dd>
        </div>
        <div v-if="activeSpot.address">
          <dt>地址</dt>
          <dd>{{ activeSpot.address }}</dd>
        </div>
        <div>
          <dt>分类</dt>
          <dd>{{ activeSpot.category }}</dd>
        </div>
        <div v-if="activeSpot.source.type === 'external'">
          <dt>来源</dt>
          <dd>{{ activeSpot.source.name }}</dd>
        </div>
        <div v-if="hasNumber(activeSpot.price)">
          <dt>人均</dt>
          <dd>{{ formatPrice(activeSpot.price) }}</dd>
        </div>
        <div v-if="hasNumber(activeSpot.rating)">
          <dt>评分</dt>
          <dd>{{ formatRating(activeSpot.rating) }}</dd>
        </div>
        <div v-if="activeSpot.recommend.length">
          <dt>推荐菜</dt>
          <dd>{{ formatRecommends(activeSpot.recommend) }}</dd>
        </div>
      </dl>

      <section v-if="activeSpot.visits.length" class="food-map__timeline" aria-label="探店时间线">
        <div class="food-map__timeline-header">
          <h3>探店时间线</h3>
          <span>{{ activeSpot.visits.length }} 次</span>
        </div>
        <ol>
          <li v-for="visit in activeSpot.visits" :key="visit.id" class="food-map__visit">
            <div class="food-map__visit-date">
              <time v-if="visit.visitedAt" :datetime="visit.visitedAt">{{ visit.visitedAt }}</time>
              <span v-else>未知日期</span>
            </div>

            <div class="food-map__visit-body">
              <p class="food-map__visit-people">
                <template v-if="visit.people.length">
                  <template v-for="(person, index) in visit.people" :key="`${visit.id}-${person.name}-${index}`">
                    <span v-if="index">、</span>
                    <a
                      v-if="person.url"
                      :href="person.url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ person.name }}</a>
                    <span v-else>{{ person.name }}</span>
                  </template>
                  <span> 吃过这家店</span>
                </template>
                <span v-else>记录了一次探店</span>
              </p>

              <p v-if="visit.note" class="food-map__visit-note">
                {{ visit.note }}
              </p>
            </div>
          </li>
        </ol>
      </section>

      <div class="food-map__actions">
        <a
          v-if="isExternalLink(activeSpot.articlePath)"
          class="food-map__action-link"
          :href="activeSpot.articlePath"
          target="_blank"
          rel="noopener noreferrer"
        >
          查看探店文章
        </a>
        <RouterLink v-else class="food-map__action-link" :to="activeSpot.articlePath">
          查看探店文章
        </RouterLink>

        <a
          v-if="activeSpot.showAmapLink && activeSpot.amapUrl"
          class="food-map__action-link food-map__amap-link"
          :href="activeSpot.amapUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          高德地图打开
        </a>
      </div>
    </article>
  </section>
</template>

<style scoped>
:global(.yun-card:has(.food-map)) {
  border-color: transparent !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  margin-top: 0 !important;
  transform: none !important;
}

:global(.yun-card:has(.food-map):hover) {
  box-shadow: none !important;
  transform: none !important;
}

:global(.yun-card:has(.food-map) > .mt-8) {
  display: none !important;
  margin-top: 0 !important;
}

:global(.yun-card:has(.food-map) > div:last-child) {
  padding-top: 0 !important;
  padding-inline: 0 !important;
  padding-bottom: 0 !important;
}

.food-map {
  --food-map-accent-blue: var(--va-c-primary, #1e9bff);
  --food-map-accent-blue-shadow: color-mix(in oklab, var(--va-c-primary, #1e9bff) 42%, transparent);
  --food-map-border: rgba(0, 0, 0, 0.03);
  --food-map-inner-radius: var(--radius-detail-inner, 16px);
  --food-map-blur: blur(16px) saturate(140%);
  --food-map-top-offset: clamp(4rem, 7svh, var(--yun-margin-top, 68px));

  display: grid;
  gap: 1.1rem;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding-top: var(--food-map-top-offset);
}

:global(html.dark) .food-map {
  --food-map-border: rgba(255, 255, 255, 0.08);
}

.food-map__filters,
.food-map__body,
.food-map__active-card {
  margin-bottom: 0 !important;
  margin-inline: 0 !important;
  transform: none !important;
}

.food-map__filters:hover,
.food-map__body:hover,
.food-map__active-card:hover {
  transform: none !important;
}

.food-map__eyebrow {
  margin: 0 0 0.35rem;
  color: var(--va-c-primary, #f97316);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.food-map__filters {
  display: flex;
  align-items: end;
  gap: 0.75rem;
  overflow-x: auto;
  padding: 0.9rem 1rem;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklab, var(--va-c-primary, #f97316) 35%, transparent) transparent;
}

.food-map__filters label {
  display: grid;
  flex: 0 0 11rem;
  gap: 0.35rem;
  color: var(--va-c-text-2, #64748b);
  font-size: 0.85rem;
}

.food-map__filters select {
  width: 100%;
  border: 1px solid var(--food-map-border);
  border-radius: 0.9rem;
  padding: 0.65rem 0.75rem;
  background: color-mix(in oklab, var(--va-c-bg, #fff) 82%, transparent);
  color: var(--va-c-text-1, #0f172a);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.food-map__filters select:focus-visible {
  border-color: color-mix(in oklab, var(--va-c-primary, #f97316) 70%, transparent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--va-c-primary, #f97316) 16%, transparent);
}

.food-map__stats {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 0.25rem;
  margin-left: auto;
  border: 1px solid color-mix(in oklab, var(--va-c-primary, #f97316) 20%, transparent);
  border-radius: 999px;
  padding: 0.55rem 0.85rem;
  background: color-mix(in oklab, var(--va-c-primary, #f97316) 10%, transparent);
  color: var(--va-c-text-2, #64748b);
  white-space: nowrap;
}

.food-map__stats strong {
  color: var(--va-c-primary, #f97316);
  font-size: 1.35rem;
  line-height: 1;
}

.food-map__stats span {
  font-size: 0.85rem;
}

.food-map__reset,
.food-map__action-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  border: 0;
  border-radius: 999px;
  padding: 0.65rem 1rem;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.food-map__reset {
  background: var(--va-c-primary, #f97316);
}

.food-map__action-link {
  background: var(--va-c-primary, #1e9bff);
}

.food-map__reset:hover {
  box-shadow: 0 10px 24px -14px var(--va-c-primary, #f97316);
  transform: translateY(-1px);
}

.food-map__action-link:hover {
  box-shadow: 0 10px 24px -14px var(--food-map-accent-blue-shadow);
  transform: translateY(-1px);
}

.food-map__body {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  height: clamp(540px, 68vh, 720px);
  overflow: hidden;
  contain: layout paint style;
}

.food-map__list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  overflow: auto;
  border-right: 1px solid var(--food-map-border);
  padding: 1rem;
  background: color-mix(in oklab, var(--va-c-bg-soft, rgba(148, 163, 184, 0.12)) 28%, transparent);
  -webkit-overflow-scrolling: touch;
  contain: layout paint style;
  overscroll-behavior: contain;
  will-change: scroll-position;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklab, var(--va-c-primary, #f97316) 35%, transparent) transparent;
}

.food-map__list-item {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  border: 1px solid color-mix(in oklab, var(--food-map-border) 72%, transparent);
  border-radius: var(--food-map-inner-radius);
  padding: 0.85rem;
  background: color-mix(in oklab, var(--va-c-bg, #fff) 64%, transparent);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  color: inherit;
  cursor: pointer;
  text-align: left;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  backface-visibility: visible;
  isolation: auto;
  transform: none;
  will-change: auto;
  contain: layout style;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.food-map__list-item:hover,
.food-map__list-item.is-active {
  border-color: color-mix(in oklab, var(--va-c-primary, #f97316) 60%, transparent);
  background: color-mix(in oklab, var(--va-c-primary, #f97316) 10%, transparent);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), inset 0 0 0 1px color-mix(in oklab, var(--va-c-primary, #f97316) 12%, transparent);
  transform: none;
}

.food-map__list-title {
  display: block;
  color: var(--va-c-text-1, #0f172a);
  font-weight: 800;
}

.food-map__list-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.45rem;
  color: var(--va-c-text-2, #64748b);
  font-size: 0.82rem;
}

.food-map__list-meta span {
  border-radius: 999px;
  padding: 0.12rem 0.5rem;
  background: color-mix(in oklab, var(--va-c-bg, #fff) 72%, transparent);
}

.food-map__list-address {
  display: block;
  margin-top: 0.55rem;
  color: var(--va-c-text-2, #64748b);
  font-size: 0.85rem;
  line-height: 1.6;
}

.food-map__empty {
  margin: auto 0;
  color: var(--va-c-text-2, #64748b);
  text-align: center;
}

.food-map__map-card {
  position: relative;
  min-width: 0;
  height: 100%;
  background: transparent;
  contain: layout paint style;
  isolation: isolate;
}

.food-map__map {
  width: 100%;
  height: 100%;
  contain: strict;
  touch-action: pan-x pan-y;
}

.food-map__map-hint {
  position: absolute;
  top: 1rem;
  left: 50%;
  z-index: 2;
  max-width: min(86%, 34rem);
  border: 1px solid var(--food-map-border);
  border-radius: 999px;
  padding: 0.65rem 1rem;
  background: color-mix(in oklab, var(--va-c-bg, #fff) 82%, transparent);
  box-shadow: 0 16px 32px -24px rgba(15, 23, 42, 0.45);
  backdrop-filter: var(--food-map-blur);
  -webkit-backdrop-filter: var(--food-map-blur);
  color: var(--va-c-text-2, #64748b);
  text-align: center;
  transform: translateX(-50%);
}

.food-map__active-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.72rem 0.9rem;
  padding: 0.95rem 1.1rem;
  contain: layout paint style;
}

.food-map__active-card h2 {
  margin: 0;
  font-size: 1.35rem;
}

.food-map__active-card dl {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.48rem 0.82rem;
  margin: 0;
}

.food-map__active-card div {
  min-width: 0;
}

.food-map__active-card dt {
  color: var(--va-c-text-2, #64748b);
  font-size: 0.78rem;
  line-height: 1.3;
}

.food-map__active-card dd {
  margin: 0.1rem 0 0;
  color: var(--va-c-text-1, #0f172a);
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.food-map__timeline {
  grid-column: 1 / -1;
  border-top: 1px solid var(--food-map-border);
  padding-top: 0.95rem;
}

.food-map__timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.8rem;
}

.food-map__timeline-header h3 {
  margin: 0;
  color: var(--va-c-text-1, #0f172a);
  font-size: 1rem;
}

.food-map__timeline-header span {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  background: color-mix(in oklab, var(--va-c-primary, #f97316) 12%, transparent);
  color: var(--va-c-primary, #f97316);
  font-size: 0.78rem;
  font-weight: 800;
}

.food-map__timeline ol {
  display: grid;
  gap: 0.65rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.food-map__visit {
  display: grid;
  grid-template-columns: 7.4rem minmax(0, 1fr);
  gap: 0.85rem;
  border: 1px solid color-mix(in oklab, var(--food-map-border) 72%, transparent);
  border-radius: 0.95rem;
  padding: 0.75rem 0.85rem;
  background: color-mix(in oklab, var(--va-c-bg, #fff) 54%, transparent);
}

.food-map__visit-date {
  align-self: start;
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  background: color-mix(in oklab, var(--va-c-bg-soft, rgba(148, 163, 184, 0.12)) 60%, transparent);
  color: var(--va-c-primary, #f97316);
  font-size: 0.9rem;
  font-weight: 800;
  text-align: center;
  white-space: nowrap;
}

.food-map__visit-people,
.food-map__visit-note {
  margin: 0;
  color: var(--va-c-text-1, #0f172a);
  line-height: 1.6;
}

.food-map__visit-people a {
  color: var(--va-c-primary, #f97316);
  font-weight: 700;
  text-decoration: none;
}

.food-map__visit-people a:hover {
  text-decoration: underline;
}

.food-map__visit-note {
  color: var(--va-c-text-2, #64748b);
  font-size: 0.92rem;
}

.food-map__actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 0.6rem;
  align-self: start;
}

.food-map__amap-link {
  background: #10b981;
}

.food-map__amap-link:hover {
  box-shadow: 0 10px 24px -14px #10b981;
}

:global(.food-map-marker) {
  appearance: none;
  display: grid;
  place-items: center;
  width: 1.28rem;
  height: 1.28rem;
  border: 2.5px solid rgba(255, 255, 255, 0.96);
  border-radius: 999px;
  background: var(--food-map-accent-blue);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.16),
    0 0 0 1px var(--food-map-accent-blue-shadow),
    0 6px 14px rgba(15, 23, 42, 0.22);
  color: #fff;
  cursor: pointer;
  padding: 0;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  transform: translateZ(0);
}

:global(.food-map-marker:hover) {
  border-color: #fff;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.2),
    0 0 0 2px var(--food-map-accent-blue-shadow),
    0 8px 18px rgba(15, 23, 42, 0.26);
  transform: translateZ(0) scale(1.08);
}

:global(.amap-info-contentContainer .amap-info-content) {
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--va-c-divider, #e5e7eb) 65%, transparent) !important;
  border-radius: 1.15rem !important;
  padding: 0 !important;
  background: color-mix(in oklab, var(--va-c-bg, #fff) 92%, transparent) !important;
  box-shadow: 0 20px 48px -26px rgba(15, 23, 42, 0.5) !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  contain: layout paint style;
}

:global(.amap-info-contentContainer .amap-info-sharp) {
  border-color: color-mix(in oklab, var(--va-c-bg, #fff) 78%, transparent) transparent transparent !important;
}

:global(.amap-info-close) {
  top: 0.8rem !important;
  right: 0.85rem !important;
  color: var(--va-c-text-2, #64748b) !important;
  font-size: 1rem !important;
}

:global(.food-map-info-window) {
  display: grid;
  gap: 0.42rem;
  width: min(76vw, 18.5rem);
  padding: 0.78rem 0.86rem 0.82rem;
  color: var(--va-c-text-1, #1f2937);
  font-size: 0.86rem;
  text-align: left;
}

:global(.food-map-info-window h3) {
  margin: 0;
  padding-right: 1.5rem;
  color: var(--va-c-text-1, #111827);
  font-size: 0.98rem;
  line-height: 1.3;
}

:global(.food-map-info-window__meta) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 0;
}

:global(.food-map-info-window__meta span) {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.12rem 0.42rem;
  background: color-mix(in oklab, #38bdf8 13%, transparent);
  color: var(--va-c-text-2, #64748b);
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}

:global(.food-map-info-window__address) {
  margin: 0;
  color: var(--va-c-text-2, #64748b);
  font-size: 0.82rem;
  line-height: 1.38;
  overflow-wrap: anywhere;
}

:global(.food-map-info-window__link) {
  display: inline-flex;
  justify-self: start;
  margin-top: 0.1rem;
  border-radius: 999px;
  padding: 0.42rem 0.72rem;
  background: var(--va-c-primary, #1e9bff) !important;
  color: #fff !important;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}

:global(.food-map-info-window__link:hover) {
  box-shadow: 0 8px 18px var(--food-map-accent-blue-shadow, color-mix(in oklab, var(--va-c-primary, #1e9bff) 42%, transparent));
}

@media (max-width: 860px) {
  .food-map {
    gap: 0.85rem;
    width: min(100%, 44rem);
  }

  .food-map__body {
    display: flex;
    flex-direction: column-reverse;
    height: auto;
    min-height: auto;
  }

  .food-map__list {
    flex-direction: row;
    max-height: none;
    overflow-x: auto;
    overflow-y: hidden;
    border-top: 1px solid var(--food-map-border);
    border-right: 0;
    padding: 0.85rem;
    overscroll-behavior-x: contain;
    scroll-padding-inline: 0.85rem;
    scroll-snap-type: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .food-map__list-item {
    flex: 0 0 min(78vw, 19rem);
    scroll-snap-align: none;
    transform: none;
  }

  .food-map__list-item:hover,
  .food-map__list-item.is-active {
    transform: none;
  }

  .food-map__map-card,
  .food-map__map {
    height: clamp(380px, 62svh, 560px);
    min-height: 420px;
  }

  .food-map__active-card {
    grid-template-columns: 1fr;
  }

  .food-map__active-card dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  :global(.yun-card:has(.food-map)) {
    margin-inline: 0 !important;
  }

  :global(.yun-card:has(.food-map) > div:last-child) {
    padding-inline: 0 !important;
  }

  .food-map {
    width: 100%;
    margin-inline: 0;
    --food-map-inner-radius: 0.85rem;
  }

  .food-map__filters {
    align-items: stretch;
    gap: 0.6rem;
    padding: 0.75rem;
    scroll-padding-inline: 0.75rem;
    scroll-snap-type: none;
  }

  .food-map__filters label {
    flex: 0 0 min(42vw, 10rem);
  }

  .food-map__filters select {
    min-height: 2.75rem;
    padding: 0.6rem 0.7rem;
  }

  .food-map__stats {
    min-height: 2.75rem;
    margin-left: 0;
    padding: 0.5rem 0.75rem;
  }

  .food-map__reset {
    flex: 0 0 auto;
  }

  .food-map__map-card,
  .food-map__map {
    height: clamp(340px, 58svh, 480px);
    min-height: 340px;
  }

  .food-map__map-hint {
    top: 0.75rem;
    width: calc(100% - 1.5rem);
    max-width: none;
    border-radius: 0.9rem;
    padding: 0.55rem 0.75rem;
    font-size: 0.88rem;
  }

  .food-map__active-card {
    gap: 0.8rem;
    padding: 0.95rem;
  }

  .food-map__active-card dl {
    grid-template-columns: 1fr;
    gap: 0.65rem;
  }

  .food-map__active-card h2 {
    font-size: 1.18rem;
    line-height: 1.35;
  }

  .food-map__timeline-header {
    align-items: flex-start;
  }

  .food-map__visit {
    grid-template-columns: 1fr;
    gap: 0.55rem;
    padding: 0.75rem;
  }

  .food-map__visit-date {
    justify-self: start;
  }

  .food-map__actions {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .food-map__action-link {
    width: 100%;
  }

  :global(.food-map-info-window) {
    width: min(calc(100vw - 2rem), 18.5rem);
    max-height: min(68svh, 26rem);
    overflow-y: auto;
    padding: 0.78rem 0.82rem;
  }

  :global(.food-map-info-window__meta) {
    gap: 0.22rem;
  }

  :global(.food-map-info-window__link) {
    min-height: 2.2rem;
    align-items: center;
  }
}

@media (max-width: 380px) {
  .food-map__filters label {
    flex-basis: 8.8rem;
  }

  .food-map__list-item {
    flex-basis: min(84vw, 18rem);
  }

  :global(.food-map-info-window) {
    width: calc(100vw - 1.5rem);
  }
}

@media (hover: none) {
  .food-map__filters:hover,
  .food-map__body:hover,
  .food-map__active-card:hover,
  .food-map__list-item:hover {
    transform: none !important;
  }
}
</style>
