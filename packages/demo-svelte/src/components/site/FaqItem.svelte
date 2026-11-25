<script lang="ts">
  const { question, answer }: { question: string, answer: string } = $props()
</script>

<details class="site-faq">
  <summary>{question}</summary>
  <p>{answer}</p>
</details>
