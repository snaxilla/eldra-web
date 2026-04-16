<template>
  <div
    class="pointer-events-none fixed inset-0 z-0"
    style="
      background:
        radial-gradient(circle at 20% 20%, rgba(255, 0, 255, 0.55), transparent 22%),
        radial-gradient(circle at 80% 25%, rgba(0, 255, 255, 0.45), transparent 24%),
        radial-gradient(circle at 50% 80%, rgba(0, 128, 255, 0.35), transparent 28%),
        linear-gradient(180deg, #060816 0%, #0a1024 100%);
    "
  >
    <div
      style="
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px);
        background-size: 48px 48px;
      "
    />
  </div>
</template>
