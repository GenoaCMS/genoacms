<script lang="ts">
  import TopPanel from '#lib/components/TopPanel.svelte'
  import GridLargeItems from '#lib/components/GridLargeItems.svelte'
  import LockNotice from './LockNotice.svelte'
  import RoleCard from './RoleCard.svelte'
  import AccountCard from './AccountCard.svelte'
  import CreateRole from './CreateRole.svelte'
  import CreateAccount from './CreateAccount.svelte'
  import DangerousAction from '../DangerousAction.svelte'
  import EditRole from './EditRole.svelte'
  import AssignRoles from './AssignRoles.svelte'
  import AgentCard from './AgentCard.svelte'
  import CreateAgent from './CreateAgent.svelte'
  import IssuedToken from './IssuedToken.svelte'
  import { enhance } from '$app/forms'
  import { toastError } from '#lib/script/alert.svelte.js'
  import { refusalMessage } from '../refusalMessage'
  import type { SubmitFunction } from '$app/forms'
  import PermissionGate from '#lib/components/PermissionGate.svelte'

  const { data } = $props()

  // Declared roles are assignable even though they cannot be edited, so the selector offers both.
  const roleNames = $derived(data.roles.map(entry => entry.role.name))

  let issued = $state<{ subject: string, token: string } | undefined>()

  const enhanceReissue: SubmitFunction = () => async ({ result }) => {
    if (result.type !== 'success') {
      toastError(refusalMessage(result.type === 'failure' ? result.data?.reason : undefined, 'Token not replaced'))
      return
    }
    issued = result.data?.issued as { subject: string, token: string }
  }
</script>

<TopPanel>
  <h1 class="text-2xl">Roles and access</h1>
  {#snippet right()}
    <!-- A locked instance refuses every mutation, so offering the triggers would only invite a
         refusal the user cannot act on from here. -->
    {#if !data.locked}
      <PermissionGate permission="config:roles:manage">
        <CreateRole resources={data.resources} />
      </PermissionGate>
      <PermissionGate permission="config:users:manage">
        <CreateAccount available={roleNames} />
        <CreateAgent available={roleNames} onissued={(next) => { issued = next }} />
      </PermissionGate>
    {/if}
  {/snippet}
</TopPanel>

<div class="p-4">
  <LockNotice locked={data.locked} />

  <section class="mb-8">
    <h2 class="text-xl mb-3">Roles</h2>
    <GridLargeItems>
      {#each data.roles as entry (entry.role.name)}
        <RoleCard role={entry.role} editable={entry.editable}>
          {#snippet actions(role)}
            <DangerousAction
              action="?/deleteRole"
              field="name"
              value={role.name}
              confirmation={`Delete the role "${role.name}". Anyone holding it loses what it granted.`}
              success="Role deleted"
              failure="Role not deleted"
            />
            <EditRole {role} resources={data.resources} />
          {/snippet}
        </RoleCard>
      {/each}
    </GridLargeItems>
  </section>

  {#if issued}
    <IssuedToken subject={issued.subject} token={issued.token} onclose={() => { issued = undefined }} />
  {/if}

  <section class="mb-8">
    <h2 class="text-xl mb-3">Agents</h2>
    {#if data.agents.length === 0}
      <p class="text-sm opacity-70">No agents. An agent controls components and pages through MCP, with a token.</p>
    {:else}
      <GridLargeItems>
        {#each data.agents as agent (agent.subject)}
          <AgentCard {agent}>
            {#snippet actions(agent)}
              <DangerousAction
                action="?/revokeAgent"
                field="subject"
                value={agent.subject}
                confirmation={`Revoke ${agent.subject}. Its token stops working at once.`}
                success="Agent revoked"
                failure="Agent not revoked"
              />
              <form method="POST" action="?/reissueAgentToken" use:enhance={enhanceReissue}>
                <input type="hidden" name="subject" value={agent.subject} />
                <button type="submit" class="text-sm cursor-pointer hover:text-warning-800-200">New token</button>
              </form>
              <PermissionGate permission="config:roles:manage">
                <AssignRoles subject={agent.subject} current={agent.roles} available={roleNames} action="?/updateAgent" />
              </PermissionGate>
            {/snippet}
          </AgentCard>
        {/each}
      </GridLargeItems>
    {/if}
  </section>

  <section>
    <h2 class="text-xl mb-3">Accounts</h2>
    {#if data.accounts.length === 0}
      <!-- Only reachable when nothing is declared either, which means nobody can administer this
           instance — worth saying plainly rather than rendering an empty grid. -->
      <p class="text-sm opacity-70">
        No accounts. Declare one in <code>genoa.config</code> under
        <code>authorization.assignments</code> to be able to administer this instance.
      </p>
    {:else}
      <GridLargeItems>
        {#each data.accounts as entry (entry.account.subject)}
          <AccountCard account={entry.account} editable={entry.editable}>
            {#snippet actions(account)}
              <DangerousAction
                action="?/removeAccount"
                field="subject"
                value={account.subject}
                confirmation={`Remove ${account.subject}. They lose access immediately.`}
                success="Account removed"
                failure="Account not removed"
              />
              <!-- Assignment needs both permissions, which the service checks; the gate mirrors the
                   narrower of the two so the control is not offered to someone holding only one. -->
              <PermissionGate permission="config:roles:manage">
                <AssignRoles subject={account.subject} current={account.roles} available={roleNames} />
              </PermissionGate>
            {/snippet}
          </AccountCard>
        {/each}
      </GridLargeItems>
    {/if}
  </section>
</div>
