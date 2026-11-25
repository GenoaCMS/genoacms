<script lang="ts">
  const { tag, title, body }: { tag: string, title: string, body: string } = $props()
</script>

<article class="site-feature">
  {#if tag !== ''}<span class="site-feature__tag">{tag}</span>{/if}
  <h3 class="site-feature__title">{title}</h3>
  <p class="site-feature__body">{body}</p>
</article>
