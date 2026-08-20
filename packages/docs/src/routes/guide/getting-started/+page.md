---
title: Getting started
---

GenoaCMS comes with a [CLI tool](/guide/cli) for handling project setup and management. Create empty direcotory or node project and run the following command:

```bash
npx @genoacms/cli init
```

During the install you will be prompted to select [adapter suite](/guide/adapters). For now the set of adapters is limited, but there is an option to write it yourself.

After the installation, you will have a new directory with the following structure:

```
root
├── genoa.config/
│   └── index.js
├── node_modules/
├── .env
├── package.json
└── package-lock.json
```

The `genoa.config/index.js` file is the main [configuration](/guide/config/structure) file for your project. It is a JavaScript file that allows importing and exporting configuration options.

:::tip[Break down the configuration]
Leverage ability to split configuration into multiple files and subdirectories. 
:::

:::note[Nothing to configure for secrets]
A `.env` file is created for local development. GenoaCMS writes what it needs there itself on first
start — signing key seeds and internal state — so there is nothing to set by hand. In a deployment,
point the secrets service at a real secret manager instead; see
[services](/guide/config/services).
:::

When the configuration is done, you can verify it by running the CMS locally with the following command:

```bash
npx @genoacms/cli run
```

Open the link from the console output in your browser and observe terminal for any errors.

After satisfying with the configuration, the CMS is ready to be deployed. 

```bash
npx @genoacms/cli deploy
```

Depending on your [deployment adapter configuration](/guide/adapters), you will have your CMS deployed to desired location.
