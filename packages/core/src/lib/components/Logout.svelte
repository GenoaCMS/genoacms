<script lang="ts">
  import { Button } from 'flowbite-svelte'
  import { applyAction, enhance } from '$app/forms'
  import { alertPending, toastError, toastSuccess } from '$lib/script/alert'

  function enhanceLogout () {
    const processing = alertPending('Logging out')
    return async function ({ result }) {
      processing.close()
      if (result.type !== 'redirect') {
        toastError('Failed to logout')
        return
      }
      toastSuccess('Logged out')
      applyAction(result)
    }
  }
</script>

<form action="/?/logout" method="post" use:enhance={enhanceLogout}>
  <Button type="subbmit" class="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-xl p-2">
    <i class="bi bi-box-arrow-right"></i>
  </Button>
</form>
