<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'

  export let bucketId: string
  export let path: string
  export let name: string
</script>

<CardLink text={name || path} href="/storage/{bucketId}/{path}/contents" icon="folder"/>
