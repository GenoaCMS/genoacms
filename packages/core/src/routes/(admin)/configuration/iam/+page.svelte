<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import Grid from '$lib/components/Grid.svelte'
  import LockNotice from './LockNotice.svelte'
  import RefusalNotice from './RefusalNotice.svelte'
  import RoleCard from './RoleCard.svelte'
  import AccountCard from './AccountCard.svelte'
  import CreateRole from './CreateRole.svelte'
  import CreateAccount from './CreateAccount.svelte'
  import DangerousAction from './DangerousAction.svelte'
  import EditRole from './EditRole.svelte'
  import AssignRoles from './AssignRoles.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'

  const { data, form } = $props()
</script>

<TopPanel>
  <h1 class="text-2xl">Roles and access</h1>
  {#snippet right()}
    <!-- A locked instance refuses every mutation, so offering the triggers would only invite a
         refusal the user cannot act on from here. -->
    {#if !data.locked}
      <PermissionGate permission="config:roles:manage">
        <CreateRole />
      </PermissionGate>
      <PermissionGate permission="config:users:manage">
        <CreateAccount />
      </PermissionGate>
    {/if}
  {/snippet}
</TopPanel>

<div class="p-4">
  <LockNotice locked={data.locked} />
  <RefusalNotice reason={form?.reason} />

  <section class="mb-8">
    <h2 class="text-xl mb-3">Roles</h2>
    <Grid>
      {#each data.roles as entry (entry.role.name)}
        <RoleCard role={entry.role} editable={entry.editable}>
          {#snippet actions(role)}
            <EditRole {role} />
            <DangerousAction
              action="?/deleteRole"
              field="name"
              value={role.name}
              label="Delete"
              confirmation={`Delete the role "${role.name}"? Anyone holding it loses what it granted.`}
            />
          {/snippet}
        </RoleCard>
      {/each}
    </Grid>
  </section>

  <section>
    <h2 class="text-xl mb-3">Accounts</h2>
    {#if data.accounts.length === 0}
      <!-- Only reachable when nothing is declared either, which means nobody can administer this
           instance — worth saying plainly rather than rendering an empty grid. -->
      <p class="text-sm opacity-70">
        No accounts. Declare one in <code>genoa.config</code> under
        <code>security.assignments</code> to be able to administer this instance.
      </p>
    {:else}
      <Grid>
        {#each data.accounts as entry (entry.account.subject)}
          <AccountCard account={entry.account} editable={entry.editable}>
            {#snippet actions(account)}
              <!-- Assignment needs both permissions, which the service checks; the gate mirrors the
                   narrower of the two so the control is not offered to someone holding only one. -->
              <PermissionGate permission="config:roles:manage">
                <AssignRoles subject={account.subject} current={account.roles} />
              </PermissionGate>
              <DangerousAction
                action="?/removeAccount"
                field="subject"
                value={account.subject}
                label="Remove"
                confirmation={`Remove ${account.subject}? They lose access immediately.`}
              />
            {/snippet}
          </AccountCard>
        {/each}
      </Grid>
    {/if}
  </section>
</div>
