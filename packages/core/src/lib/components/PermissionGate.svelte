<script lang="ts">
  import type { Snippet } from 'svelte'
  import { page } from '$app/state'
  import { isPermitted, type PermissionDemand } from '$lib/script/authorization/gate'
  import type { AuthContext } from '$lib/script/authorization/context'

  /**
   * Shows its children only to a principal holding what it demands.
   *
   * **Cosmetic, and only cosmetic** (§4.2.6). Every element hidden here is independently refused by
   * the service it would reach, so this keeps the interface honest about what it offers rather than
   * securing anything. The decision lives in `authorization/gate`, tested without rendering, and it
   * uses the same matcher the server does — so the two cannot disagree about what a grant means.
   */
  interface Props {
    /** One permission, or every permission in a list. */
    permission: PermissionDemand
    /** Required for bucket- and collection-scoped permissions; omitted for instance-scoped ones. */
    resource?: string
    children: Snippet
    /** Shown instead when the permission is not held. Usually nothing. */
    fallback?: Snippet
  }
  const { permission, resource, children, fallback }: Props = $props()

  /**
   * The principal's own grants, sent by the admin layout.
   *
   * The subject is irrelevant to the decision — only the grants are matched — so it is left empty
   * rather than shipped to the client for no reason.
   */
  const context = $derived({
    subject: '',
    grants: page.data.grants ?? [],
    fromDeclarationsOnly: false
  } satisfies AuthContext)

  const permitted = $derived(isPermitted(context, permission, resource))
</script>

{#if permitted}
  {@render children()}
{:else if fallback}
  {@render fallback()}
{/if}
