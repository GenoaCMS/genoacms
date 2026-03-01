<script lang="ts">
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
  <button
    class="btn-icon preset-tonal hover:preset-filled-surface-50-950"
    type="submit"
    aria-label="Logout"
  >
    <i class="bi bi-box-arrow-right"></i>
  </button>
</form>
