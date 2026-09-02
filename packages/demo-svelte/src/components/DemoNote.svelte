<script lang="ts">
  /** Text and a number, so a renderer that stringifies everything shows itself. */
  const { text, order }: { text: string, order: number } = $props()
</script>

<aside class="note">
  <span class="note-order">{order}</span>
  <p class="note-text">{text}</p>
</aside>
