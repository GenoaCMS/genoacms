<script lang="ts">
  import type { Snippet } from 'svelte'
  import { page } from '$app/state'
  import { hasPermission } from '$lib/script/authorization/enforce'
  import type { Permission } from '$lib/script/authorization/permissions'
  import type { AuthContext } from '$lib/script/authorization/context'

  interface Props {
    permission: Permission
    /** Required for bucket- and collection-scoped permissions; omitted for instance-scoped ones. */
    resource?: string
    children: Snippet
    /** Shown instead when the permission is not held. Usually nothing. */
    fallback?: Snippet
  }
  const { permission, resource, children, fallback }: Props = $props()

  /**
   * Hiding is **cosmetic**, and deliberately so: the same permission is checked in the service
   * this element would reach, so a user who forces the control through gets a denial rather than
   * an action. This exists to keep the interface honest about what it offers, not to secure it.
   *
   * The matcher is the one the server uses, so the two cannot disagree about what a grant means.
   */
  const context = $derived({
    subject: '',
    grants: page.data.grants ?? [],
    fromDeclarationsOnly: false
  } satisfies AuthContext)

  /**
   * Fails closed rather than throwing.
   *
   * `hasPermission` refuses a resource-scoped permission checked without a resource, which is a
   * programming error — but raising it here would take out the whole surrounding view over a hidden
   * button. Hiding and warning degrades the interface; throwing removes it.
   */
  function check (): boolean {
    try {
      return (hasPermission as (c: AuthContext, p: Permission, r?: string) => boolean)(context, permission, resource)
    } catch (error) {
      console.warn(`[genoacms:ui] permission gate for '${permission}' could not be evaluated`, error)
      return false
    }
  }

  const permitted = $derived(check())
</script>

{#if permitted}
  {@render children()}
{:else if fallback}
  {@render fallback()}
{/if}
