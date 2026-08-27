<script lang="ts">
  import { renderResolved, type ResolvedNode } from '@genoacms/sdk'

  /**
   * A subtree the CMS compiled, rendered by the SDK and placed as it stands.
   *
   * An action rather than `{@html}`: the SDK produces a live node, and serializing it to markup would
   * discard every event handler the component attached.
   */
  const { node }: { node: ResolvedNode } = $props()

  const place = (host: HTMLElement) => {
    let cancelled = false
    void renderResolved(node).then(rendered => {
      if (cancelled) return
      host.replaceChildren(rendered.ok ? rendered.value : document.createComment(rendered.reason))
    })
    return { destroy: () => { cancelled = true } }
  }
</script>

<div use:place></div>
