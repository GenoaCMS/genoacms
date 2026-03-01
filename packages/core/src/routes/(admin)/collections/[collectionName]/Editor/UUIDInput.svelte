<script lang="ts">
  import { ButtonGroup, Input, InputAddon } from '$lib/components/ui/index'

  interface Props {
    value: string
    onvalue: (e: string) => void
  }
  let { value, onvalue }: Props = $props()

  function generateUUID () {
    value = crypto.randomUUID()
    onvalue(value)
  }
</script>

<ButtonGroup class="w-full">
  <InputAddon>
    <button type="button" onclick={generateUUID} aria-label="Generate UUID">
      <i class="bi bi-dice-5-fill"></i>
    </button>
  </InputAddon>
  <Input
    {value}
    oninput={(e) => onvalue((e.target as HTMLInputElement).value)}
  />
</ButtonGroup>
