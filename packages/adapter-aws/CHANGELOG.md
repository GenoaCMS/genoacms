# @genoacms/adapter-aws

## 0.7.0

### Minor Changes

- [#11](https://github.com/GenoaCMS/genoacms/pull/11) [`5e3fbd3`](https://github.com/GenoaCMS/genoacms/commit/5e3fbd3f21e41d61ebd847097591a8fca0498e70) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Brings the AWS adapter to its Specification (RFC-0026): the missing storage methods, merging DynamoDB updates and paged collections, a Secrets Manager secrets provider, and a Lambda deploy behind the Lambda Web Adapter and a function URL. The `aws` target no longer takes `accountId`, and `role` must be an IAM role ARN.
