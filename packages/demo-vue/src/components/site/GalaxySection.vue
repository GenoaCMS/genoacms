<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, type VNode } from 'vue'
import { ui } from '@genoacms/demo-support/ui'
import { galaxy } from '../../galaxy'

defineProps<{ anchor: string, eyebrow: string, heading: string, intro: string, content: VNode[] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
let unmount: (() => void) | undefined
onMounted(() => { if (canvas.value !== null) unmount = galaxy.mount(canvas.value) })
onBeforeUnmount(() => unmount?.())
</script>

<template>
  <section :id="anchor === '' ? undefined : anchor" :class="ui.galaxy">
    <div :class="ui.galaxyHead">
      <p v-if="eyebrow !== ''" :class="ui.eyebrow">{{ eyebrow }}</p>
      <h2 :class="ui.heading">{{ heading }}</h2>
      <p v-if="intro !== ''" :class="ui.intro">{{ intro }}</p>
    </div>
    <div :class="ui.galaxyStage">
      <canvas ref="canvas" :class="ui.galaxyCanvas" />
      <div :class="ui.galaxyOverlay">
        <component :is="child" v-for="(child, i) in content" :key="i" />
      </div>
    </div>
  </section>
</template>
