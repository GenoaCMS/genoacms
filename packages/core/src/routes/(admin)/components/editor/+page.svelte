<script lang="ts">
  import Grid from '$lib/components/Grid.svelte'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import Component from './Component.svelte'
  import PermissionGate from '$lib/components/PermissionGate.svelte'
  import SelectableCard from '$lib/components/selection/SelectableCard.svelte'
  import SelectionToggle from '$lib/components/selection/SelectionToggle.svelte'
  import DeleteSelected from '$lib/components/selection/DeleteSelected.svelte'
  import { NamedSelection } from '$lib/script/selection/NamedSelection.svelte'

  const { data } = $props()

  const selection = new NamedSelection()
  // Acted on by uid and read by name, as in the registrar: two components may share a name, and
  // only the uid tells them apart.
  const entries = $derived(data.components.map(component => ({
    id: component.uid,
    name: component.name
  })))
</script>

<TopPanel>
  <h1 class="text-2xl">Component editor</h1>
  {#snippet right()}
    <!-- Removal is gated on the same permission as creation: both decide whether a component
         exists. Selection itself is not gated — selecting is not an operation, what it enables is.

         Delete is placed before the toggle deliberately. The toolbar is right-anchored, so a
         control that appears takes the coordinates the one beside it had, and putting Delete where
         "select all" was makes a second click destructive. -->
    <PermissionGate permission="components:register">
      <DeleteSelected {selection} action="?/deleteSelected" noun="component" />
    </PermissionGate>
    <SelectionToggle {selection} {entries} />
    <!-- There is no create control here. A component is born in the registrar, whichever kind it
         is, so that one act decides its type and demands the permission that type calls for. -->
  {/snippet}
</TopPanel>

<Grid>
  {#each data.components as component (component.uid)}
    <SelectableCard {selection} entry={{ id: component.uid, name: component.name }}>
      <Component {component} />
    </SelectableCard>
  {/each}
</Grid>
