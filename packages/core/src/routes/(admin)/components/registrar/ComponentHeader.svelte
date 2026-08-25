<script lang="ts">
  import type { ComponentHeader } from '$lib/script/components/componentHeader/component/types'
  import CardLink from '$lib/components/CardLink.svelte'

  interface Props {
    entry: ComponentHeader
  }
  const { entry }: Props = $props()
</script>

<!-- `noscale`: SelectableCard scales the card and its checkbox together, so scaling here too would
     leave the checkbox behind. -->
<CardLink href="registrar/{entry.uid}" icon="box" text={entry.name} noscale />
