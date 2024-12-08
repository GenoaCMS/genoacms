<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'
  import { page } from '$app/stores'

  type Props = {
    bucketId: string,
    path: string,
    name: string
  }
  const { bucketId, path, name }: Props = $props()
  const searchParams = $derived('?' + $page.url.searchParams.toString() || '')
</script>

<CardLink text={name || path} href="/storage/{bucketId}/{path}/contents{searchParams}" icon="folder"/>
