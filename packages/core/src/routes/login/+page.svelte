<script lang="ts">
  import { Button, Input, } from '$lib/components/ui/index.ts'
  import { applyAction, enhance } from '$app/forms'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert.svelte'

  const enhanceLogin = () => {
    const pending = alertPending('Logging in')
    return async ({ result }) => {
      pending.close()
      if (result.type !== 'redirect') {
        toastError('Login failed')
        return
      }
      toastSuccess('Logged in')
      await applyAction(result)
    }
  }
</script>

<div class="container mx-auto w-full h-full flex flex-col justify-center items-center">
    <div class="flex mt-0 justify-center">
      <div class="m-auto w-auto max-w-[40rem]">
        <img src="/genoacms-narrow.png" alt="GenoaCMS logo" class="" />
      </div>
    </div>
    <form class="w-full md:w-2/3 xl:w-1/3 p-5" method="post" use:enhance={enhanceLogin}>
        <Input label="Username" type="text" name="username" placeholder="Username" class="mb-3"/>
        <Input label="Password" type="password" name="password" placeholder="Password" class="mb-3"/>
        <Button preset="outlined" class="w-full mt-4" type="submit">Login</Button>
    </form>
</div>
