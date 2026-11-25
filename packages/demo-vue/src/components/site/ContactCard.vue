<script setup lang="ts">
import { ui } from '@genoacms/demo-support/ui'

defineProps<{ heading: string, lines: string, email: string, phone: string }>()
</script>

<template>
  <article :class="ui.contact">
    <h3 :class="ui.contactHeading">{{ heading }}</h3>
    <p v-if="lines !== ''" :class="ui.contactLines">{{ lines }}</p>
    <a v-if="email !== ''" :class="ui.contactLink" :href="`mailto:${email}`">{{ email }}</a>
    <a v-if="phone !== ''" :class="ui.contactLink" :href="`tel:${phone.replaceAll(' ', '')}`">{{ phone }}</a>
  </article>
</template>
