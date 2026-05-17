import { useHead } from '@unhead/vue'
import { computed } from 'vue'
import { defineAppSetup } from 'valaxy'

interface FoodMapNoindexFrontMatter {
  noindex?: boolean | 'true' | 'false'
}

export default defineAppSetup(({ app, router }) => {
  app.runWithContext(() => {
    useHead(computed(() => ({
      meta: isNoindexEnabled(getRouteFrontmatter(router).noindex)
        ? [
            {
              name: 'robots',
              content: 'noindex, follow',
            },
          ]
        : [],
    })))
  })
})

function getRouteFrontmatter(router: { currentRoute?: { value?: { meta?: { frontmatter?: FoodMapNoindexFrontMatter } } } }) {
  return router.currentRoute?.value?.meta?.frontmatter || {}
}

function isNoindexEnabled(value: FoodMapNoindexFrontMatter['noindex']) {
  return value === true || value === 'true'
}
