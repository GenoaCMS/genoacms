<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements'

  interface Props extends HTMLTextareaAttributes {
    type?: string
    value?: string
    class?: string
  }

  let { value = $bindable(), class: className = '', ...rest }: Props = $props()
</script>

<textarea bind:value class="textarea {className}" {...rest}></textarea>
