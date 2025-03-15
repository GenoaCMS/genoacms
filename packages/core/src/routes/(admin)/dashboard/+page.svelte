<script lang="ts">
    import { Button } from 'flowbite-svelte'

  const { data } = $props()
</script>

<div class="p-9">
  <div class="w-full flex flex-wrap">
    <div>
      <h1 class="text-xl md:text-2xl m-2">
        Welcome {data.user.email}
      </h1>
    </div>
    <div class="ms-auto w-full md:w-auto">
      <Button color="light" href="https://genoacms.github.io/docs" target="_blank" class="w-full">
        Read the docs
      </Button>
    </div>
  </div>
</div>
