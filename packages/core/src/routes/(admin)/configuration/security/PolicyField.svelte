<script lang="ts">
  import { Input, Label, Helper } from '$lib/components/ui/index'

  /**
   * One policy value, with the range the parser will hold it to.
   *
   * The range is shown rather than merely enforced: a field that silently refuses teaches nothing,
   * and the server's answer would arrive after the whole form was sent.
   */
  interface Props {
    name: string
    label: string
    describe: string
    value: number
    min: number
    max: number
  }

  const { name, label, describe, value, min, max }: Props = $props()

  /**
   * What the field shows: what the administrator typed, or the stored value until they type.
   *
   * Not a copy of the prop. Mirroring it into state would freeze the first value the component was
   * given, so a reload that brought a different policy would render the old one.
   */
  let edited: number | undefined = $state(undefined)

  const current = $derived(edited ?? value)
  const outOfRange = $derived(current < min || current > max || !Number.isInteger(current))
</script>

<div class="space-y-1">
  <Label for={name}>{label}</Label>
  <Input
    id={name}
    {name}
    type="number"
    step="1"
    {min}
    {max}
    value={current}
    oninput={(event: Event) => { edited = Number((event.currentTarget as HTMLInputElement).value) }}
  />
  <Helper class={outOfRange ? 'text-red-600' : ''}>
    {describe} Between {min.toLocaleString()} and {max.toLocaleString()}.
  </Helper>
</div>
