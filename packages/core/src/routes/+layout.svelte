<script lang="ts">
    import type { Snippet } from 'svelte'
    import '$lib/css/app.css'
    import 'bootstrap-icons/font/bootstrap-icons.css'

    interface Props {
      children?: Snippet
    }
    const { children }: Props = $props()
</script>

{@render children?.()}
<div class="text-amber-600
  text-amber-500
  text-cyan-500
  text-cyan-600
  text-green-500
  text-blue-500
  text-lime-500
  text-sky-500" hidden></div>
