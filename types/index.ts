export interface FoodMapAddonOptions {
  exportJson?: boolean
  jsonPath?: string
  articleUrlFormat?: 'route' | 'html'
  sources?: FoodMapExternalSource[]
  owner?: FoodMapOwner
  amap?: {
    keyEnv?: string
    securityJsCodeEnv?: string
  }
}

export interface FoodMapExternalSource {
  id: string
  name: string
  url: string
  homepage?: string
  avatar?: string
  enabled?: boolean
}

export interface FoodMapOwner {
  id?: string
  name?: string
  url?: string
  avatar?: string
}

export interface FoodMapSite {
  title?: string
  url?: string
  homepage?: string
}

export interface FoodMapSource {
  id: string
  name: string
  homepage?: string
  jsonUrl?: string
  type: 'local' | 'external'
}

export interface FoodFrontMatter {
  show?: boolean | 'true' | 'false'
  spotId?: string
  name?: string
  city?: string
  address?: string
  lng?: number | string
  lat?: number | string
  coordinateSystem?: string
  category?: string
  price?: number | string
  visited?: boolean | 'true' | 'false'
  showTimeline?: boolean | 'true' | 'false'
  visitedAt?: string
  people?: FoodVisitPerson[] | string[] | string
  rating?: number | string
  recommend?: string[] | string
  note?: string
  visit?: FoodVisitFrontMatter
  visits?: FoodVisitFrontMatter[]
  amapUrl?: string
  showAmapLink?: boolean | 'true' | 'false'
  amap?: string | {
    url?: string
    show?: boolean | 'true' | 'false'
  }
}

export interface FoodVisitPerson {
  name: string
  url?: string
}

export interface FoodVisitFrontMatter {
  visitedAt?: string
  date?: string
  title?: string
  articleUrl?: string
  people?: FoodVisitPerson[] | string[] | string
  rating?: number | string
  price?: number | string
  recommend?: string[] | string
  note?: string
}

export interface FoodVisit {
  id: string
  title: string
  visitedAt: string
  articlePath: string
  people: FoodVisitPerson[]
  rating?: number
  price?: number
  recommend: string[]
  note: string
}

export interface FoodMapJsonGenerator {
  name: string
  version?: string
}

export interface FoodSpot {
  id: string
  name: string
  city: string
  address: string
  lng: number
  lat: number
  coordinateSystem?: string
  category: string
  price?: number
  visited: boolean
  rating?: number
  recommend: string[]
  articlePath: string
  articleUrl?: string
  amapUrl?: string
  showAmapLink: boolean
  source: FoodMapSource
  visits: FoodVisit[]
}

export interface FoodMapPostLike {
  title?: unknown
  path?: string
  url?: string
  food?: FoodFrontMatter
  date?: unknown
  updated?: unknown
  updatedAt?: unknown
  createdAt?: unknown
}

export interface FoodMapJsonRoot {
  schema: string
  schemaVersion: 1
  generator: FoodMapJsonGenerator
  owner?: FoodMapOwner
  site?: FoodMapSite
  generatedAt: string
  coordinateSystem: 'GCJ-02'
  spots: FoodMapJsonSpot[]
}

export interface FoodMapJsonSpot {
  id: string
  name: string
  city: string
  address?: string
  lng: number
  lat: number
  coordinateSystem?: string
  category?: string
  price?: number
  rating?: number
  recommend?: string[]
  articleUrl?: string
  amapUrl?: string
  source: FoodMapSource
}

declare global {
  interface Window {
    AMap?: unknown
    __foodMapAmapLoaded?: () => void
    _AMapSecurityConfig?: {
      securityJsCode: string
    }
  }

  interface ImportMetaEnv {
    readonly VITE_AMAP_KEY?: string
    readonly VITE_AMAP_SECURITY_JS_CODE?: string
    readonly [key: string]: string | boolean | undefined
  }
}
