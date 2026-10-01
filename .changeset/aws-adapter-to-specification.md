---
'@genoacms/adapter-aws': minor
---

Brings the AWS adapter to its Specification (RFC-0026): the missing storage methods, merging DynamoDB updates and paged collections, a Secrets Manager secrets provider, and a Lambda deploy behind the Lambda Web Adapter and a function URL. The `aws` target no longer takes `accountId`, and `role` must be an IAM role ARN.
