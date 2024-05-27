<script lang="ts">
  import { Card } from 'flowbite-svelte'

  export let reference = undefined

  export let collectionName: string
  export let documentId: string
  export let attributeName: string


  let bucket = ''
  let name = ''


</script>

<Card target="_blank" padding="sm" class="w-[25%] aspect-[2/1]">
    Bucket: {bucket}<br>
    Filename: {name}
</Card>
