<script lang="ts">
  import CardLink from '$lib/components/CardLink.svelte'
  import File from 'bootstrap-icons/icons/file-earmark.svg'

  export let name: string
</script>

<CardLink text={name} icon={File}/>
