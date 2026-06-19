<script setup lang="ts">
import '@/components/icons'

defineProps<{ title: string }>()
</script>

<template>
  <section cds-layout="vertical gap:md p:xl">
    <h1 cds-text="title" class="heading">{{ title }}</h1>
    <cds-card>
      <div cds-layout="vertical p:xl gap:sm align:horizontal-center" class="empty">
        <cds-icon shape="history" size="xxl"></cds-icon>
        <p cds-text="section" class="title">即将推出</p>
        <p cds-text="body" class="muted">该模块正在建设中，请稍后查看。</p>
      </div>
    </cds-card>
  </section>
</template>

<style scoped>
.heading {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.empty {
  min-height: 320px;
  justify-content: center;
}
.title {
  margin: 0;
  color: var(--cds-alias-object-app-foreground, #1b1b1b);
}
.muted {
  color: var(--cds-alias-typography-color-300, #565656);
  margin: 0;
}
</style>
