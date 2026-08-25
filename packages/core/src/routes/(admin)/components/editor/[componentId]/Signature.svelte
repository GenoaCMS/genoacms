<script lang="ts">
  import type { SignaturePreview } from '@genoacms/internal/languageAdapter'

  /**
   * What the author's body is wrapped in.
   *
   * Read-only, and not part of the document being edited: it is emitted from the component's shape,
   * so editing it here would be editing a copy of something authored in the registrar. The way to
   * change it is to change the shape.
   *
   * Showing it at all is what makes writing a body possible. Without it an author has to infer the
   * parameter list from the registrar and guess how each attribute's name was turned into an
   * identifier — `Heading text` becoming `HeadingText` is not something to be left to guesswork.
   */
  const { signature }: { signature: SignaturePreview } = $props()

  const refusals = $derived(signature.diagnostics.filter(d => d.severity === 'fatal'))
</script>

{#if refusals.length > 0}
  <!-- No signature can be emitted, so there is nothing to write a body against. Saying why here is
       what turns an empty editor into an instruction. -->
  <div class="p-3 border-b border-error-500/50 bg-error-500/10 space-y-1">
    <p class="text-sm font-medium">This component has no signature yet:</p>
    {#each refusals as refusal (refusal.rule)}
      <p class="text-sm">{refusal.message}</p>
    {/each}
  </div>
{:else}
  <pre class="p-3 border-b border-surface-500/40 overflow-x-auto text-sm opacity-80"><code
  >{signature.text}</code></pre>
{/if}
