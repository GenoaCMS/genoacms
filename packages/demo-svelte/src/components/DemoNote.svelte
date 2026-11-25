<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'
  /** Text and a number, so a renderer that stringifies everything shows itself. */
  const { text, order }: { text: string, order: number } = $props()
</script>

<aside class={ui.demoNote}>
  <span class={ui.demoNoteOrder}>{order}</span>
  <p class={ui.demoNoteText}>{text}</p>
</aside>
