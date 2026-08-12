<script setup lang="ts">
// Activate / switch a World's Rules Package -- Infrastructure Commit 9.
// See .github/docs/architecture/rules-package-infrastructure.md Q6/Q7:
// activation is a single write, and switching is unrestricted in V1
// (no actor_rules_state exists yet to protect -- world-rules-
// activation.ts design decision 4). This component owns exactly one
// action (POST /rules/activate) and one read (GET /api/rules-packages,
// the Infra 9 package-list endpoint); it never resolves World
// Configuration or builds a runtime itself, and never updates its own
// idea of "what's active" locally -- see design note below.

const props = defineProps<{
  worldId: string | number
  currentPackageId?: string
  currentPackageVersion?: string
}>()

// No optimistic update, per this commit's own CONFIG section (which the
// same discipline applies to for consistency): a successful activation
// emits `activated` and the PARENT re-fetches GET /rules/summary --
// `currentPackageId`/`currentPackageVersion` only ever change because a
// fresh summary flowed back down as new props, never because this
// component assumed its own POST succeeded.
const emit = defineEmits<{ activated: [] }>()

type RulesPackageListing = {
  packageId: string
  version: string
  title: string
  engineApiVersion: string
}

const packages = ref<RulesPackageListing[]>([])
const packagesPending = ref(false)
const packagesError = ref('')

const selectedPackageId = ref('')
const selectedVersion = ref('')

const activating = ref(false)
const activateError = ref('')
const activateSuccess = ref('')

async function loadPackages() {
  packagesPending.value = true
  packagesError.value = ''

  try {
    const response = await $fetch<{ packages: RulesPackageListing[] }>('/api/rules-packages')
    packages.value = response?.packages ?? []

    if (!selectedPackageId.value) {
      const preferred = packages.value.find((pkg) => pkg.packageId === props.currentPackageId) ?? packages.value[0]
      selectedPackageId.value = preferred?.packageId ?? ''
    }
  } catch (error: any) {
    packages.value = []
    packagesError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to load installed Rules Packages.'
  } finally {
    packagesPending.value = false
  }
}

onMounted(loadPackages)

// Every {packageId, title} pair, de-duplicated -- `packages` has one row
// per (packageId, version), so a package with three versions would
// otherwise appear three times in the package picker.
const availablePackages = computed(() => {
  const seen = new Set<string>()
  const result: Array<{ packageId: string; title: string }> = []
  for (const pkg of packages.value) {
    if (seen.has(pkg.packageId)) continue
    seen.add(pkg.packageId)
    result.push({ packageId: pkg.packageId, title: pkg.title })
  }
  return result
})

const versionsForSelectedPackage = computed(() =>
  packages.value.filter((pkg) => pkg.packageId === selectedPackageId.value)
)

// Keep the version choice valid whenever the package choice changes --
// the previously selected version may belong to a different package.
watch([selectedPackageId, versionsForSelectedPackage], ([, versions]) => {
  if (!versions.some((pkg) => pkg.version === selectedVersion.value)) {
    selectedVersion.value = versions[0]?.version ?? ''
  }
})

const isAlreadyActive = computed(
  () =>
    Boolean(props.currentPackageId) &&
    props.currentPackageId === selectedPackageId.value &&
    props.currentPackageVersion === selectedVersion.value
)

const actionLabel = computed(() => (props.currentPackageId ? 'Switch Package' : 'Activate Package'))

async function activate() {
  if (!selectedPackageId.value || !selectedVersion.value || isAlreadyActive.value) return

  activating.value = true
  activateError.value = ''
  activateSuccess.value = ''

  try {
    await $fetch(`/api/worlds/${props.worldId}/rules/activate`, {
      method: 'POST',
      body: { packageId: selectedPackageId.value, version: selectedVersion.value }
    })
    activateSuccess.value = `Activated ${selectedPackageId.value}@${selectedVersion.value}.`
    emit('activated')
  } catch (error: any) {
    activateError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Activation failed.'
  } finally {
    activating.value = false
  }
}
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
      Package Activation
    </div>
    <h3 class="mt-2 text-lg font-semibold text-white">
      {{ currentPackageId ? 'Switch Active Package' : 'Activate a Rules Package' }}
    </h3>
    <p
      v-if="currentPackageId"
      class="mt-2 text-sm leading-6 text-[#d8ceb8]"
    >
      Currently active: <span class="font-mono text-[#f5e7bd]">{{ currentPackageId }}@{{ currentPackageVersion }}</span>
    </p>

    <div
      v-if="packagesPending"
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-4 text-sm text-[#9f9278]"
    >
      Loading installed Rules Packages...
    </div>

    <div
      v-else-if="packagesError"
      class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
    >
      {{ packagesError }}
    </div>

    <div
      v-else-if="!packages.length"
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-4 text-sm text-[#9f9278]"
    >
      No published Rules Packages are installed yet.
    </div>

    <template v-else>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Package</span>
          <select
            v-model="selectedPackageId"
            class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          >
            <option
              v-for="pkg in availablePackages"
              :key="pkg.packageId"
              :value="pkg.packageId"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ pkg.title || pkg.packageId }}
            </option>
          </select>
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Version</span>
          <select
            v-model="selectedVersion"
            class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          >
            <option
              v-for="pkg in versionsForSelectedPackage"
              :key="pkg.version"
              :value="pkg.version"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ pkg.version }} (engine {{ pkg.engineApiVersion }})
            </option>
          </select>
        </label>
      </div>

      <div
        v-if="activateError"
        class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
      >
        {{ activateError }}
      </div>

      <div
        v-if="activateSuccess"
        class="mt-4 rounded-none border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100"
      >
        {{ activateSuccess }}
      </div>

      <button
        type="button"
        class="eldra-button mt-4 rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
        :disabled="activating || !selectedPackageId || !selectedVersion || isAlreadyActive"
        @click="activate"
      >
        {{ activating ? 'Activating...' : isAlreadyActive ? 'Already Active' : actionLabel }}
      </button>
    </template>
  </div>
</template>
