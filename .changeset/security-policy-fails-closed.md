---
'@genoacms/core': minor
---

The security policy becomes `genoacms.securityPolicy.v2`, with a `sequence` whose highest value is
kept in the secret `GENOACMS_SECURITY_POLICY_SEQUENCE`, so an older policy put back is refused.

A policy that cannot be trusted no longer puts the instance on the configured defaults. It is
damaged: it is left in place, sign-in runs on the strictest token lifetimes and grant cache,
publishing fails with `security-policy/damaged`, the current key does not rotate when due, and the
security screen says so until an administrator saves the policy there. A storage error while
reading the policy now propagates instead of being read as an absent policy.

A stored `genoacms.securityPolicy.v1` policy is read as damaged; saving the policy on
*Configuration → Security* replaces it.
