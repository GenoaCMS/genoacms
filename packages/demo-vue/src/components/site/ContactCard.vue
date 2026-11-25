<script setup lang="ts">
defineProps<{ heading: string, lines: string, email: string, phone: string }>()
</script>

<template>
  <article class="site-contact">
    <h3 class="site-contact__heading">{{ heading }}</h3>
    <p v-if="lines !== ''" class="site-contact__lines">{{ lines }}</p>
    <a v-if="email !== ''" class="site-contact__link" :href="`mailto:${email}`">{{ email }}</a>
    <a v-if="phone !== ''" class="site-contact__link" :href="`tel:${phone.replaceAll(' ', '')}`">{{ phone }}</a>
  </article>
</template>
