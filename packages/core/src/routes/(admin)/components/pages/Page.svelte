<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'

    interface Props {
      name: string
    }
    const { name }: Props = $props()
</script>

<!-- `noscale`: SelectableCard scales the card and its checkbox together, so scaling here too would
     leave the checkbox behind. -->
<CardLink href="pages/{name}" icon="window" text={name} noscale />
