<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'

    export let name: string
</script>

<CardLink href="pages/{name}" icon="" text={name} />
