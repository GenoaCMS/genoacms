<script lang="ts">
  import { Button, Input } from 'flowbite-svelte'
  import { applyAction, enhance } from '$app/forms'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'

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

<div class="w-full h-full flex justify-center items-center">
    <form class="w-1/3" method="post" use:enhance={enhanceLogin}>
        <h1 class="text-4xl text-center mb-[8rem]">
            GenoaCMS - Log in
        </h1>
        <Input label="Email" type="email" name="email" placeholder="Email" class="mb-3"/>
        <Input label="Password" type="password" name="password" placeholder="Password" class="mb-3"/>
        <Button type="submit" color="light" size="lg" class="w-full mt-4">Login</Button>
    </form>
</div>
