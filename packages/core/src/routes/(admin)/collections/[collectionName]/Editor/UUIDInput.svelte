<script lang="ts">
  interface Props {
    value: string
    onvalue: (e: string) => void
    id?: string
  }
  let { value, onvalue, id }: Props = $props()

  function generateUUID () {
    value = crypto.randomUUID()
    onvalue(value)
  }
</script>

<div class="field-group grid-cols-[1fr_auto]">
  <input
    {id}
    type="text"
    class="input font-mono text-sm"
    {value}
    oninput={(e) => onvalue((e.target as HTMLInputElement).value)}
  />
  <button
    type="button"
    onclick={generateUUID}
    title="Generate a new UUID"
    aria-label="Generate UUID"
    class="btn preset-tonal"
  >
    <i class="bi bi-dice-5"></i>
  </button>
</div>
