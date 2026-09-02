<script lang="ts">
  import type { Component } from '$lib/script/components/editor/types'
  import CardLink from '$lib/components/CardLink.svelte'

  interface Props {
    component: Component
  }
  const { component }: Props = $props()
</script>

<!-- `noscale`: SelectableCard scales the card and its checkbox together, so scaling here too would
     leave the checkbox behind. -->
<CardLink href="editor/{component.uid}" icon="file-earmark-code" text={component.name} noscale />
