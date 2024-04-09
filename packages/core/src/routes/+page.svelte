<script lang="ts">
  import { Button, Card } from 'flowbite-svelte'
  export let data
</script>

<div class="h-full w-full flex items-center justify-center">
  <Card class="min-w-[35%] min-h-[30%] flex">
    <h1 class="text-xl">
      Welcome to <strong>GenoaCMS</strong>
    </h1>
    <div class="flex-grow flex flex-col">
      <Button color="light" class="mt-auto">
        Read documentation
      </Button>
      <Button href="/login" color="light" class="mt-3">
        Login
      </Button>
    </div>
  </Card>
</div>

