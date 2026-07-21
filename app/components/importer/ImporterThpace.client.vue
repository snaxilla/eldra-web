<template>
  <div
    data-importer-real-thpace
    class="pointer-events-none absolute inset-0 overflow-hidden"
    aria-hidden="true"
  >
    <WorldChooserThpace />
  </div>
</template>

<style scoped>
[data-importer-real-thpace] {
  z-index: 0;
  opacity: 1;
  background:
    radial-gradient(circle at 22% 16%, rgba(56, 189, 248, 0.10), transparent 34%),
    radial-gradient(circle at 78% 24%, rgba(91, 33, 182, 0.16), transparent 36%),
    #05080d;
}

[data-importer-real-thpace] :deep(*) {
  pointer-events: none !important;
}

[data-importer-real-thpace] :deep(div) {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

[data-importer-real-thpace] :deep(canvas) {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}
</style>
