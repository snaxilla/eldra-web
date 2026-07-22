<script setup lang="ts">
defineProps<{
  form: any
  summaryLine: string
  typeOptions: Array<{ value: string; label: string }>
  rarityOptions: string[]
  equipSlotOptions: Array<{ value: string; label: string }>
  damageTypes: string[]
  actionTimings: string[]
  rechargeOptions: string[]
}>()
</script>

<template>
  <div
    data-homebrew-item-builder
    class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
  >
    <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Item Builder
        </div>
        <h3 class="mt-2 text-xl font-semibold text-white">
          Item Mechanics
        </h3>
        <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
          Build the structured item profile Eldra will use for sheets, granted actions, and eventual Foundry export.
        </p>
      </div>

      <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs leading-5 text-[#d8ceb8]">
        {{ summaryLine || 'No item mechanics yet' }}
      </div>
    </div>

    <div class="mt-5 grid gap-4 xl:grid-cols-3">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Item Name</span>
        <input v-model="form.name" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="Flamebrand Longsword, Lucky Boots...">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Item Type</span>
        <select v-model="form.itemType" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
          <option v-for="type in typeOptions" :key="type.value" :value="type.value" class="bg-[#090909] text-[#f5e7bd]">
            {{ type.label }}
          </option>
        </select>
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Rarity</span>
        <select v-model="form.rarity" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
          <option v-for="rarity in rarityOptions" :key="rarity" :value="rarity" class="bg-[#090909] text-[#f5e7bd]">
            {{ rarity }}
          </option>
        </select>
      </label>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-4">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Weight</span>
        <input v-model="form.weight" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="1">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Value</span>
        <input v-model="form.value" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="5000 cp or raw value">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Equip Slot</span>
        <select v-model="form.equipSlot" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
          <option v-for="slot in equipSlotOptions" :key="slot.value" :value="slot.value" class="bg-[#090909] text-[#f5e7bd]">
            {{ slot.label }}
          </option>
        </select>
      </label>

      <div class="grid gap-2">
        <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
          <input v-model="form.equippable" type="checkbox" class="accent-[#c9a45a]">
          Equippable
        </label>

        <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
          <input v-model="form.requiresAttunement" type="checkbox" class="accent-[#c9a45a]">
          Requires Attunement
        </label>
      </div>
    </div>

    <label v-if="form.requiresAttunement" class="mt-4 block">
      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Attunement Text</span>
      <input v-model="form.attunementText" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="by a spellcaster, by a dwarf, etc.">
    </label>

    <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.40)] p-4">
      <label class="inline-flex items-center gap-2 text-sm font-semibold text-[#fff7df]">
        <input v-model="form.weaponEnabled" type="checkbox" class="accent-[#c9a45a]">
        Weapon Profile
      </label>

      <div v-if="form.weaponEnabled" class="mt-4 grid gap-4 xl:grid-cols-4">
        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Kind</span>
          <select v-model="form.weaponKind" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
            <option value="melee" class="bg-[#090909] text-[#f5e7bd]">Melee</option>
            <option value="ranged" class="bg-[#090909] text-[#f5e7bd]">Ranged</option>
          </select>
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Category</span>
          <input v-model="form.weaponCategory" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="simple, martial...">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage</span>
          <input v-model="form.weaponDamage" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="1d8">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage Type</span>
          <select v-model="form.weaponDamageType" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
            <option v-for="type in damageTypes" :key="type || 'none'" :value="type" class="bg-[#090909] text-[#f5e7bd]">
              {{ type || 'None' }}
            </option>
          </select>
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Range</span>
          <input v-model="form.weaponRange" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="5, 20/60, 120/360">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Properties</span>
          <input v-model="form.weaponProperties" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="finesse, light, thrown">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Attack Bonus</span>
          <input v-model="form.attackBonus" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="+1">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage Bonus</span>
          <input v-model="form.damageBonus" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="+1">
        </label>
      </div>
    </div>

    <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.40)] p-4">
      <label class="inline-flex items-center gap-2 text-sm font-semibold text-[#fff7df]">
        <input v-model="form.armorEnabled" type="checkbox" class="accent-[#c9a45a]">
        Armor / Shield Profile
      </label>

      <div v-if="form.armorEnabled" class="mt-4 grid gap-4 xl:grid-cols-5">
        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">AC</span>
          <input v-model="form.armorClass" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="16">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Armor Type</span>
          <input v-model="form.armorType" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="armor, shield">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Dex Cap</span>
          <input v-model="form.dexCap" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="2">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Strength Req.</span>
          <input v-model="form.strength" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="13">
        </label>

        <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
          <input v-model="form.stealthDisadvantage" type="checkbox" class="accent-[#c9a45a]">
          Stealth Disadvantage
        </label>
      </div>
    </div>

    <div class="mt-5 grid gap-4 xl:grid-cols-4">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">AC Bonus</span>
        <input v-model="form.acBonus" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="+1">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Save Bonus</span>
        <input v-model="form.saveBonus" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="+1">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Spell Attack Bonus</span>
        <input v-model="form.spellAttackBonus" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="+1">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Spell Save DC Bonus</span>
        <input v-model="form.spellSaveDcBonus" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="+1">
      </label>
    </div>

    <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.40)] p-4">
      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        Granted Action
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-4">
        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Action Name</span>
          <input v-model="form.grantedActionName" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="Poison the Blade">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Timing</span>
          <select v-model="form.grantedActionTiming" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
            <option v-for="timing in actionTimings" :key="timing" :value="timing" class="bg-[#090909] text-[#f5e7bd]">
              {{ timing }}
            </option>
          </select>
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Uses</span>
          <input v-model="form.grantedActionUses" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="1, 3, etc.">
        </label>

        <label>
          <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Recharge</span>
          <select v-model="form.grantedActionRecharge" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
            <option v-for="recharge in rechargeOptions" :key="recharge || 'none'" :value="recharge" class="bg-[#090909] text-[#f5e7bd]">
              {{ recharge || 'None' }}
            </option>
          </select>
        </label>
      </div>

      <label class="mt-4 block">
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Action Detail</span>
        <textarea v-model="form.grantedActionDetail" rows="4" class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white" placeholder="Describe the action this item grants..." />
      </label>
    </div>

    <label class="mt-5 block">
      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Description</span>
      <textarea v-model="form.description" rows="7" class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white" placeholder="What the item does at the table..." />
    </label>
  </div>
</template>
