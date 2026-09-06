<script lang="ts">
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

<div class="field-group grid-cols-[auto_1fr] w-full">
  <label class="label label-text preset-tonal cursor-pointer">
    <button
      type="button"
      onclick={generateUUID}
      title="Generate UUID"
      aria-label="Generate UUID"
      class="flex items-center justify-center cursor-pointer hover:opacity-80"
    >
      <i class="bi bi-dice-5-fill text-lg"></i>
    </button>
  </label>
  <input
    type="text"
    class="input"
    {value}
    oninput={(e) => onvalue((e.target as HTMLInputElement).value)}
  />
</div>
