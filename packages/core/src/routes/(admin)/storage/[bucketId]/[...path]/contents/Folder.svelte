<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'
  import Folder from 'bootstrap-icons/icons/folder.svg'

  export let bucketId: string
  export let path: string
  export let name: string
  // $: directoryPath = path ? `${path}/${name}` : name
</script>

<CardLink text={name || path} href="/storage/{bucketId}/{path}/contents" icon={Folder}/>
