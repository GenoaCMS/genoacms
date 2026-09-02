# Evidence

Inputs and suites for the thesis experiments, kept out of `src/` because **none of it is
loaded by the CMS**.

The distinction matters: `permissionMatrix.ts` declares roles named `Copywriter`, `Designer`,
`StorageManager` and so on, and next to the authorization modules those read like a shipped role set.
They are not. GenoaCMS ships one role, `SuperAdmin`; every other role is defined by an operator at
runtime.

| File | Experiment | Role |
| :--- | :--- | :--- |
| `permissionMatrix.ts` | Roles | The roles under test and their expected allow-lists, written by hand from the permission taxonomy |
| `permissionMatrix.test.ts` | Matrix | Invokes every (role × service function) pair against the real gated services |

Expectations are **never derived from the code they check**, so the matrix is able to disagree with
the implementation — the only way a test finds a wrong mapping rather than confirming one.

Regenerate the published table with:

```
pnpm --silent run generate-permission-matrix
```

That prints expectations only. It is evidence solely while `pnpm run test:unit` passes.
