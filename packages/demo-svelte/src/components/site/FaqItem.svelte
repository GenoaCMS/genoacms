<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'

  const { question, answer }: { question: string, answer: string } = $props()
</script>

<details class={ui.faq}>
  <summary class={ui.faqQuestion}>{question}</summary>
  <p class={ui.faqAnswer}>{answer}</p>
</details>
