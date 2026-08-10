<script lang="ts">
    import { onMount } from 'svelte'

    let isDark = $state(false)

    onMount(() => {
      isDark = document.documentElement.classList.contains('dark')
    })

    function toggle () {
      isDark = !isDark
      onChange(isDark)
    }

    const onChange = (checked: boolean) => {
      const mode = checked ? 'dark' : 'light'
      document.documentElement.setAttribute('data-mode', mode)
      localStorage.setItem('mode', mode)
    }

    $effect(() => {
      const mode = localStorage.getItem('mode') || 'light'
      isDark = mode === 'dark'
    })
</script>

<svelte:head>
  <script>
    document.documentElement.setAttribute('data-mode', localStorage.getItem('mode') || 'dark');
  </script>
</svelte:head>

<button
    class="btn-icon preset-tonal hover:preset-filled-surface-50-950"
    onclick={toggle}
    aria-label="Toggle Dark Mode"
>
    {#if isDark}
        <i class="bi bi-moon-fill"></i>
    {:else}
        <i class="bi bi-sun-fill"></i>
    {/if}
</button>
