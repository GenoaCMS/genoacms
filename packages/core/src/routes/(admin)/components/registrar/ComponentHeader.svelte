<script lang="ts">
  import type { ComponentHeader } from '$lib/script/components/componentHeader/component/types'
  import CardLink from '$lib/components/CardLink.svelte'

  /**
   * One component in the registrar, of either kind.
   *
   * The icon is the only thing that distinguishes them, and it is worth having: both kinds are
   * described the same way and act the same way here, but only one of them has code the CMS can
   * open — so a person about to click needs to know which page they are going to.
   */
  interface Props {
    entry: ComponentHeader
  }
  const { entry }: Props = $props()

  const icon = $derived(entry.type === 'dynamic' ? 'code-square' : 'box')
</script>

<!-- `noscale`: SelectableCard scales the card and its checkbox together, so scaling here too would
     leave the checkbox behind. -->
<CardLink href="registrar/{entry.uid}" {icon} text={entry.name} noscale />
