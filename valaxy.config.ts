import { defineValaxyConfig } from 'valaxy'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const requireFromUserRoot = createRequire(`${process.cwd()}/package.json`)
const requireFromValaxy = createRequire(requireFromUserRoot.resolve('valaxy/package.json'))
const setupPath = toViteFsPath(fileURLToPath(new URL('./setup/main.ts', import.meta.url)))

export default defineValaxyConfig({
  vite: {
    resolve: {
      alias: [
        {
          find: /^@unhead\/vue$/,
          replacement: toViteFsPath(requireFromValaxy.resolve('@unhead/vue')),
        },
      ],
    },
    plugins: [
      {
        name: 'valaxy-addon-food-map:setup',
        enforce: 'pre',
        transform(code, id) {
          const normalizedId = id.replace(/\\/g, '/').replace(/\?.*$/, '')
          if (!normalizedId.endsWith('/valaxy/client/setup/main.ts'))
            return null
          if (code.includes('__valaxyAddonFoodMapSetup'))
            return null

          const importLine = `import __valaxyAddonFoodMapSetup from '${setupPath}'`
          const injection = `// ${setupPath}\n__valaxyAddonFoodMapSetup(injection_arg)`

          let next = code.includes('/* __imports__ */')
            ? code.replace('/* __imports__ */', `${importLine}\n/* __imports__ */`)
            : `${importLine}\n${code}`

          next = next.includes('/* __injections__ */')
            ? next.replace('/* __injections__ */', `${injection}\n\n  /* __injections__ */`)
            : next.replace('  if (import.meta.env.DEV && ctx.isClient) {', `  ${injection}\n\n  if (import.meta.env.DEV && ctx.isClient) {`)

          return next
        },
      },
    ],
  },
})

function toViteFsPath(path: string) {
  const normalizedPath = path.replace(/\\/g, '/')
  return normalizedPath.startsWith('/')
    ? `/@fs${normalizedPath}`
    : `/@fs/${normalizedPath}`
}
