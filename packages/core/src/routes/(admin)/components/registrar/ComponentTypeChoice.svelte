<script lang="ts">
  import { Label } from '$lib/components/ui/index'
  import type { ComponentType } from '$lib/script/components/componentHeader/component/types'

  /**
   * Choosing where a component's code lives.
   *
   * The one question that cannot be answered later: the type decides whether the component gets a
   * source definition in the CMS, and changing it afterwards would orphan that definition or
   * invalidate every page that resolved the component the other way. So it is asked once, at
   * creation, and the wording is about *where the code is* rather than about the two words the
   * system stores — an author knows whether they have already written the component, and does not
   * need to know what the CMS calls that.
   */
  let { value = $bindable() }: { value: ComponentType } = $props()

  const choices: Array<{ type: ComponentType, title: string, description: string }> = [
    {
      type: 'prebuilt',
      title: 'Already coded in my app',
      description: 'The component exists in the consuming application. The CMS holds its name and the attributes it accepts.'
    },
    {
      type: 'dynamic',
      title: 'Code it here',
      description: 'The component is written in the CMS, compiled and signed, and delivered to the application.'
    }
  ]
</script>

<fieldset class="space-y-2">
  <legend class="text-sm mb-1">Where does this component live?</legend>
  {#each choices as choice (choice.type)}
    <Label class="flex gap-3 items-start p-3 rounded border border-surface-500/40 cursor-pointer hover:border-primary-500 transition-colors">
      <input
        type="radio"
        name="componentType"
        class="mt-1"
        value={choice.type}
        checked={value === choice.type}
        onchange={() => { value = choice.type }}
      />
      <span class="flex flex-col">
        <span class="font-medium">{choice.title}</span>
        <span class="text-sm opacity-70">{choice.description}</span>
      </span>
    </Label>
  {/each}
</fieldset>
