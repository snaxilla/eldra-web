<script setup lang="ts">
const { data: articles } = await useFetch('/api/articles')

const featured = computed(() => articles.value?.[0] || null)
const recent = computed(() => articles.value?.slice(0, 6) || [])
</script>

<template>
  <div class="space-y-8">
    <section class="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
      <DashboardCard
        title="Welcome to Eldra"
        subtitle="A living world of characters, lore, factions, maps, and timelines."
        icon="i-lucide-sparkles"
      >
        <div class="space-y-4">
          <p class="text-sm leading-6 text-neutral-300">
            This front page will become user-customizable with pinned articles, map panels,
            active character cards, recent updates, and campaign-specific widgets.
          </p>

          <div class="flex flex-wrap gap-3">
            <UButton
              v-if="featured"
              :to="`/article/${featured.slug}`"
              icon="i-lucide-book-open"
              color="primary"
            >
              Open Featured Article
            </UButton>

            <UButton
              to="/section/maps"
              icon="i-lucide-map"
              color="neutral"
              variant="soft"
            >
              View Maps
            </UButton>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard
        title="Pinned"
        subtitle="Starter widget area for quick access."
        icon="i-lucide-pin"
      >
        <div class="space-y-3">
          <NuxtLink
            v-if="featured"
            :to="`/article/${featured.slug}`"
            class="block rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-200 hover:border-neutral-700"
          >
            Featured: {{ featured.title }}
          </NuxtLink>

          <NuxtLink
            to="/section/characters"
            class="block rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-200 hover:border-neutral-700"
          >
            Character Directory
          </NuxtLink>

          <NuxtLink
            to="/section/locations"
            class="block rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-200 hover:border-neutral-700"
          >
            Location Index
          </NuxtLink>
        </div>
      </DashboardCard>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <DashboardCard
        title="Recently Updated Articles"
        subtitle="Your current article feed."
        icon="i-lucide-scroll-text"
      >
        <div v-if="recent.length" class="grid gap-4 md:grid-cols-2">
          <ArticleListCard
            v-for="article in recent"
            :key="article.id"
            :article="article"
          />
        </div>

        <div v-else class="rounded-xl border border-dashed border-neutral-800 bg-neutral-950 p-6 text-sm text-neutral-400">
          No articles found yet.
        </div>
      </DashboardCard>

      <div class="space-y-6">
        <DashboardCard
          title="World Modules"
          subtitle="These will become full sections."
          icon="i-lucide-layers-3"
        >
          <div class="grid gap-3">
            <div class="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-300">Maps with interactive pins</div>
            <div class="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-300">Timelines and event views</div>
            <div class="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-300">Dynamic article linking</div>
            <div class="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-300">User dashboards and pinned pages</div>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Activity"
          subtitle="Placeholder for recent edits and player activity."
          icon="i-lucide-bell-ring"
        >
          <div class="space-y-3 text-sm text-neutral-400">
            <div class="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">No recent activity yet.</div>
            <div class="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">Once auth is added, this becomes personalized.</div>
          </div>
        </DashboardCard>
      </div>
    </section>
  </div>
</template>
