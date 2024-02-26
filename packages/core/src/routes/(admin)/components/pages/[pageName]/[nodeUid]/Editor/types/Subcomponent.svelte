<script lang="ts">
  import type { ComponentNode as ComponentNodeT } from '$lib/script/components/page/entry/types'
  import { Button } from 'flowbite-svelte'

  export let node: ComponentNodeT
</script>

<Button color="light" href={node.uid}>
    {node.name}
</Button>
