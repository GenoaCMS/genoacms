<script lang="ts">
  import { Button, Card, } from '$lib/components/ui/index'
</script>

<div class="h-full w-full flex items-center justify-center">
  <Card class="flex-col min-w-[35%] min-h-[30%] flex p-4">
    <h1 class="text-xl">
      Welcome to <strong>GenoaCMS</strong>
    </h1>
    <div class="flex-grow flex justify-center">
      <div class="m-auto w-auto max-w-[40rem]">
        <img src="/genoacms-narrow.png" alt="GenoaCMS logo" class="" />
      </div>
    </div>
    <div class="flex flex-col">
      <Button preset="outlined" class="mt-auto" href="https://genoacms.github.io/docs" target="_blank">
        Read documentation
      </Button>
      <Button preset="outlined" class="mt-3" href="/login">
        Login
      </Button>
    </div>
  </Card>
</div>
