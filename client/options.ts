import type { ValaxyAddon } from 'valaxy'
import type { FoodMapAddonOptions } from '../types'
import { useRuntimeConfig } from 'valaxy'
import { computed } from 'vue'

export const defaultFoodMapAddonOptions = {
  exportJson: true,
  jsonPath: '/food-map/index.json',
  sources: [],
  amap: {
    keyEnv: 'VITE_AMAP_KEY',
    securityJsCodeEnv: 'VITE_AMAP_SECURITY_JS_CODE',
  },
} satisfies FoodMapAddonOptions

export function resolveFoodMapAddonOptions(options: FoodMapAddonOptions = {}): Required<Pick<FoodMapAddonOptions, 'exportJson' | 'jsonPath' | 'sources'>> & Omit<FoodMapAddonOptions, 'exportJson' | 'jsonPath' | 'sources'> {
  return {
    ...options,
    exportJson: options.exportJson ?? defaultFoodMapAddonOptions.exportJson,
    jsonPath: options.jsonPath ?? defaultFoodMapAddonOptions.jsonPath,
    sources: options.sources ?? [],
    amap: {
      ...defaultFoodMapAddonOptions.amap,
      ...options.amap,
    },
  }
}

export function useAddonFoodMap() {
  const runtimeConfig = useRuntimeConfig()

  return computed(() => {
    const addon = runtimeConfig.value.addons['valaxy-addon-food-map'] as ValaxyAddon<FoodMapAddonOptions> | undefined
    return resolveFoodMapAddonOptions(addon?.options)
  })
}
