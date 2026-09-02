<script lang="ts">
  import type { ComponentDefinition } from '$lib/script/components/editor/types'
  import type { SignaturePreview } from '@genoacms/internal/languageAdapter'
  import { activityTracker } from '$lib/script/activity/client'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
  import DeleteComponent from './DeleteComponent.svelte'
  import Editor from './Editor.svelte'
  import Signature from './Signature.svelte'
  import RegistrarLink from './RegistrarLink.svelte'
  import Undo from './Undo.svelte'
  import Redo from './Redo.svelte'
  import SaveComponent from './SaveComponent.svelte'

  /**
   * Writing one component's code.
   *
   * Split out of the route so the route can key it on the loaded definition. Undo and redo are form
   * actions that revalidate, so `load` re-runs and hands down a different definition — and the
   * working copy below, being `$state` initialized once, would otherwise keep showing the state from
   * before the undo. Re-creating the component on a new definition is what makes the two agree. The
   * registrar's editor is split for the same reason.
   *
   * **Publishing is not here.** It is an act on the whole component — a prebuilt component performs
   * it too, and it signs the header as well as the code — so it belongs to the registrar, which is
   * the one surface both kinds share.
   *
   * What is here is drafting, with the same lifecycle the registrar and the page editor have:
   * **edit, undo, redo, save**. That lifecycle is what replaced commits. Undo and redo step through
   * *saved* states, so they are only as useful as the saves are deliberate — which is why the
   * autosave went with them.
   */
  interface Props {
    component: { uid: string, name: string }
    definition: ComponentDefinition
    signature: SignaturePreview
    historyLength: number
    futureLength: number
  }
  const { component, definition, signature, historyLength, futureLength }: Props = $props()

  activityTracker.add({
    type: 'componentCode',
    timestamp: Date.now(),
    componentId: component.uid,
    componentName: component.name,
  })

  /**
   * The draft on screen, and the state it was loaded or last saved at.
   *
   * Comparing the two is the whole definition of "unsaved". It survives an author typing something
   * and typing it back again, which a flag set on every keystroke would not — and that matters here
   * because the comparison also decides whether undo is allowed to run.
   */
  let body = $state(definition.body)
  let saved = $state(definition.body)

  /**
   * How deep the history runs, kept locally because saving does not reload the page.
   *
   * Seeded from what `load` returned and advanced by each save. Undo and redo are form actions that
   * revalidate, so this component is re-created and this is seeded afresh — which is why it is only
   * ever written here.
   */
  let depth = $state({ historyLength, futureLength })

  const unsaved = $derived(body !== saved)
</script>

<UnsavedChangesGuard dirty={unsaved} />

<TopPanel>
  <h1 class="text-2xl">
    Component: {component.name}
  </h1>
  {#snippet right()}
    <!-- Deleting destroys the source, so it is governed by the component's existence rather than by
         authoring. The link back to the registrar is where both the shape and the Publish control
         live, and it is gated on `modify` because that is what changing either of them needs. -->
    <PermissionGate permission="components:modify">
      <RegistrarLink uid={component.uid} />
    </PermissionGate>
    <PermissionGate permission="components:register">
      <DeleteComponent uid={component.uid} name={component.name} />
    </PermissionGate>
    <!-- Undo, redo and save all write the stored body, so all three ride on the permission that
         reaches source. Ordered as they are performed, matching the registrar's own panel. -->
    <PermissionGate permission="components:code">
      <Undo historyLength={depth.historyLength} {unsaved} />
      <Redo futureLength={depth.futureLength} {unsaved} />
      <SaveComponent
        uid={component.uid}
        {body}
        {unsaved}
        onsaved={(next) => {
          depth = next
          saved = body
        }}
      />
    </PermissionGate>
  {/snippet}
</TopPanel>

<!-- The signature sits above the body it wraps, in reading order: an author sees what they are
     given before what they are to write with it. -->
<Signature {signature} />

<Editor bind:code={body} language={definition.language} />
