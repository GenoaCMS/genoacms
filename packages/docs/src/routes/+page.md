---
heroImage: /genoacms.png
tagline: A headless CMS for the infrastructure you already run
actions: 
  - label: Get started
    type: primary
    to: /guide/introduction
  - label: In production
    to: /in-production/
  - label: View on github
    to: https://github.com/GenoaCMS/genoacms
    external: true
features:
  - title: Your existing data
    description: Edit the database and storage your project already has, in place. Nothing to migrate.
    icon:
      type: iconify
      collection: tabler
      name: database-edit
  - title: Platform-agnostic
    description: Adaptable to work with any database, storage, auth and compute solution.
    icon:
      type: iconify
      collection: game-icons
      name: swiss-army-knife
  - title: Multi-cloud 
    description: Ability to manage resources across multiple cloud providers.
    icon:
      type: iconify
      collection: tabler
      name: cloud-network
  - title: No tech stack requirements
    description: The CMS adapts, not the rest of the system.
    icon:
      type: iconify
      collection: tabler
      name: code-off
  - title: Typed configuration
    description: One config per environment, checked by TypeScript. Credentials stay in your secret manager.
    icon:
      type: iconify
      collection: tabler
      name: brand-typescript
  - title: Signed components
    description: Compose pages from components in your codebase or written in the CMS, in any language. Your app verifies every page before rendering it.
    icon:
      type: iconify
      collection: tabler
      name: shield-check
---

<div class="screenshots">
  <figure>
    <img class="shot-light" src="./screenshots/collection-list-light.webp" alt="The collection list: a table of documents with a filter">
    <img class="shot-dark" src="./screenshots/collection-list-dark.webp" alt="The collection list: a table of documents with a filter">
    <figcaption>Collections: browse and filter the documents of a table that already exists</figcaption>
  </figure>
  <figure>
    <img class="shot-light" src="./screenshots/document-editor-light.webp" alt="The document editor with a markdown field and live preview">
    <img class="shot-dark" src="./screenshots/document-editor-dark.webp" alt="The document editor with a markdown field and live preview">
    <figcaption>Documents: edit every field type, with a live markdown preview</figcaption>
  </figure>
  <figure>
    <img class="shot-light" src="./screenshots/signing-keys-light.webp" alt="The signing keys page with the root trust anchor and the key registry">
    <img class="shot-dark" src="./screenshots/signing-keys-dark.webp" alt="The signing keys page with the root trust anchor and the key registry">
    <figcaption>Signing keys: the trust anchor your application uses to verify published pages</figcaption>
  </figure>
</div>
