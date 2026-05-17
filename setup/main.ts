import { useHead } from '@unhead/vue'
import { computed } from 'vue'
import { defineAppSetup, useFrontmatter } from 'valaxy'

interface FoodMapNoindexFrontMatter {
  noindex?: boolean | 'true' | 'false'
}

export default defineAppSetup(({ app }) => {
  app.runWithContext(() => {
    const frontmatter = useFrontmatter<FoodMapNoindexFrontMatter>()

    useHead(computed(() => ({
      meta: isNoindexEnabled(frontmatter.value.noindex)
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

function isNoindexEnabled(value: FoodMapNoindexFrontMatter['noindex']) {
  return value === true || value === 'true'
}
