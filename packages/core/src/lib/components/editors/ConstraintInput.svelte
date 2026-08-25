<script lang="ts" generics="Schema extends object">
  import { Input } from '$lib/components/ui/index'
  import { setConstraint } from '$lib/script/components/componentHeader/component/constraints'

  /**
   * A meta-schema constraint whose empty state is an **absent key**.
   *
   * Every optional constraint an author edits as a single field — `minimum`, `maxLength`, `pattern`,
   * `format`, a scalar `default` — goes through this rather than through a bound input, because a
   * bound input cannot express "unset" at all: `bind:` can only assign, and every value it could
   * assign for an empty field (`null`, `undefined`, `''`) is a key that exists.
   *
   * Taking the schema object and the key is what makes removal possible. The rule itself lives in
   * `constraints.ts`, so the controls that are not inputs — a textarea, the markdown editor — obey
   * the same one rather than a second copy of it.
   */

  /** The keys of a meta-schema holding an optional scalar — the ones this can edit. */
  type OptionalConstraint<S> = {
    [K in keyof S]-?: number extends S[K] ? K : string extends S[K] ? K : never
  }[keyof S] & string

  interface Props {
    /** The meta-schema being edited. Mutated in place. */
    schema: Schema
    /** Which constraint this field edits. Constrained to the schema's scalar keys. */
    constraint: OptionalConstraint<Schema>
    /** `number` parses the entry; `text` stores it as written. */
    kind?: 'number' | 'text'
    /** Forwarded to the input — `min`, `step`, `placeholder`, and so on. */
    [key: string]: unknown
  }
  const { schema, constraint, kind = 'number', ...rest }: Props = $props()

  // The generic parameter is what makes the call site safe; inside, the schema is just an object
  // carrying constraints.
  const constraints = $derived(schema as Record<string, string | number | undefined>)
  const value = $derived(constraints[constraint])

  function read (event: Event & { currentTarget: HTMLInputElement }): void {
    const raw = event.currentTarget.value
    // The empty entry is handed over as it is: `setConstraint` decides that empty means absent, so
    // this component does not hold a second opinion about it.
    setConstraint(constraints, constraint, raw === '' || kind === 'text' ? raw : Number(raw))
  }
</script>

<Input
  type={kind === 'number' ? 'number' : 'text'}
  value={value ?? ''}
  oninput={read}
  {...rest}
/>
