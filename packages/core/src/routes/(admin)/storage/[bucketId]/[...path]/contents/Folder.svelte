<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'
  import { page } from '$app/state'

  type Props = {
    bucketId: string,
    currentPath: string,
    path: string,
    name: string
  }
  const { bucketId, currentPath, path, name }: Props = $props()
  const searchParams = $derived('?' + page.url.searchParams.toString() || '')
</script>

<CardLink text={name || path} href="/storage/{bucketId}/{currentPath}{page.data.delimiter}{path}/contents{searchParams}" icon="folder"/>
