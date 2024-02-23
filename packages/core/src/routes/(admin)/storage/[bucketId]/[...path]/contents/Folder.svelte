<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'
  import { page } from '$app/stores'

  export let bucketId: string
  export let path: string
  export let name: string
  $: searchParams = '?' + $page.url.searchParams.toString() || ''
</script>

<CardLink text={name || path} href="/storage/{bucketId}/{path}/contents{searchParams}" icon="folder"/>
