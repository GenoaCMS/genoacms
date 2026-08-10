<script lang="ts">
  import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'
  import CardLink from '$lib/components/CardLink.svelte'

  interface Props {
    entry: ComponentEntry
  }
  const { entry }: Props = $props()
</script>

<CardLink href="prebuilt/{entry.uid}" icon="box" text={entry.name}/>
