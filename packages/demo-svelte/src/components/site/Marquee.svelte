<script lang="ts">
  const { text }: { text: string } = $props()
  const repeats = Array.from({ length: 8 }, (_, index) => index)
</script>

<div class="site-marquee" aria-label={text}>
  <div class="site-marquee__track" aria-hidden="true">
    {#each repeats as index (index)}
      <span class="site-marquee__item">{text}</span>
    {/each}
  </div>
</div>
