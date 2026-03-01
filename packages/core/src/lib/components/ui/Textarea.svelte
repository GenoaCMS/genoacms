<script lang="ts">
  interface Props {
    value?: string
    class?: string
    [key: string]: any
  }

  let { value = $bindable(), class: className = '', ...rest }: Props = $props()
</script>

<textarea bind:value class="textarea {className}" {...rest}></textarea>
