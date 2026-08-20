<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import CardLink from '$lib/components/CardLink.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'

  /**
   * The sections, each gated on the permission that makes it useful.
   *
   * They are governed by different permissions, so this is not one door: a key administrator holds
   * nothing over roles, and offering them a card that leads only to a refusal is exactly the
   * dishonesty §4.2.6's gates exist to remove.
   */
  const sections = [
    { href: '/configuration/iam', icon: 'person-badge', text: 'Roles and access', permission: 'config:roles:manage' },
    { href: '/configuration/keys', icon: 'key', text: 'Signing keys', permission: 'config:keys:manage' }
  ] as const
</script>

<div class="h-full flex flex-col">
    <TopPanel>
        <h1 class="text-2xl">
            Configuration
        </h1>
    </TopPanel>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-10 h-full content-center sm:p-5">
        {#each sections as section (section.href)}
            <PermissionGate permission={section.permission}>
                <div class="aspect-square m-auto md:m-0 md:ms-auto w-2/3 sm:1/2 md:w-full 2xl:w-1/2">
                    <CardLink href={section.href} icon={section.icon} text={section.text} />
                </div>
            </PermissionGate>
        {/each}
    </div>

</div>
