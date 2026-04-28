import type { FoodMapAddonOptions } from '../types'
import { defineValaxyAddon } from 'valaxy'
import pkg from '../package.json'
import { generateFoodMapJson } from './generate'

function createFoodMapAddon(name: string) {
  return defineValaxyAddon<FoodMapAddonOptions>((options = {}) => ({
    name,
    enable: true,
    options,
    setup(node) {
      node.hook('build:before', async () => {
        await generateFoodMapJson(node, options, 'public')
      })

      node.hook('build:after', async () => {
        await generateFoodMapJson(node, options, 'dist')
      })
    },
  }))
}

export const addonFoodMap = createFoodMapAddon(pkg.name)
