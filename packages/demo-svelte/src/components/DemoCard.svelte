<script lang="ts">
  /** Two text values, so a wrapper putting them in the wrong props is visible on screen. */
  const { title, body }: { title: string, body: string } = $props()
</script>

<article class="card">
  <h3 class="card-title">{title}</h3>
  <p class="card-body">{body}</p>
</article>
