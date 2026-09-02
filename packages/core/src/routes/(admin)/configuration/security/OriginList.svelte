<script lang="ts">
  import { Button, Input, Label, Helper } from '$lib/components/ui/index'
  import { isOrigin } from '$lib/script/securityPolicy/policy'

  /**
   * The origins a component's data bridge may reach.
   *
   * A list rather than a text field, because an allowlist edited as free text is one where a stray
   * comma grants an origin nobody chose. Each entry is checked the way the parser checks it, so the
   * screen refuses exactly what the server would.
   *
   * Posted as one hidden field holding JSON: a form sends strings, and the alternative — a field per
   * entry — makes removing the third one a question about what the fourth is now called.
   */
  interface Props { origins: string[], maximum: number }

  const { origins, maximum }: Props = $props()

  /**
   * The list as edited, or the stored one until it is touched.
   *
   * Not a copy of the prop into state: mirroring would freeze the first list this was rendered with,
   * so a reload bringing a different policy would show the old one.
   */
  let edited: string[] | undefined = $state(undefined)
  let draft = $state('')

  const entries = $derived(edited ?? origins)

  const invalid = $derived(draft !== '' && !isOrigin(draft))
  const full = $derived(entries.length >= maximum)
  const duplicate = $derived(entries.includes(draft))

  const add = () => {
    if (draft === '' || invalid || duplicate || full) return
    edited = [...entries, draft]
    draft = ''
  }

  const remove = (origin: string) => { edited = entries.filter(entry => entry !== origin) }
</script>

<div class="space-y-3">
  <Label for="origin-draft">Allowed origins</Label>
  <input type="hidden" name="fetchOrigins" value={JSON.stringify(entries)} />

  {#if entries.length === 0}
    <p class="text-sm opacity-70">
      Empty, which permits nothing. A component's bridge cannot reach anywhere until an origin is
      added here.
    </p>
  {:else}
    <ul class="space-y-2">
      {#each entries as origin (origin)}
        <li class="flex items-center gap-2">
          <code class="grow text-sm">{origin}</code>
          <Button type="button" onclick={() => remove(origin)}>Remove</Button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex items-start gap-2">
    <div class="grow">
      <Input
        id="origin-draft"
        placeholder="https://api.example.com"
        bind:value={draft}
        disabled={full}
      />
      <Helper class={invalid || duplicate ? 'text-red-600' : ''}>
        {#if invalid}
          An origin is a scheme, a host and an optional port — no path, and no trailing slash.
        {:else if duplicate}
          Already listed.
        {:else if full}
          {maximum} origins is the maximum. Each one travels inside every published component.
        {:else}
          Scheme, host and optional port. {entries.length} of {maximum} used.
        {/if}
      </Helper>
    </div>
    <Button type="button" onclick={add} disabled={draft === '' || invalid || duplicate || full}>Add</Button>
  </div>
</div>
