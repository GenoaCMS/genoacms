<script lang="ts">
    interface Props {
      value?: string | number
      class?: string
      [key: string]: any
    }

    let {
      value = $bindable(),
      class: className = '',
      ...rest
    }: Props = $props()
</script>

<input bind:value class="input {className}" {...rest} />
