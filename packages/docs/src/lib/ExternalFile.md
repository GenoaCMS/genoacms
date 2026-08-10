<script lang="ts">
  let { source } = $props()
  let content = $state('');
  (async () => {
    const res = await fetch(source)
    content = await res.text()
  })()
</script>


```md

{content}

```
