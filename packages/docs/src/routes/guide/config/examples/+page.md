---
title: Example configs
---

Three complete configs, one per way of running GenoaCMS. They are files in GenoaCMS's own repository,
beside the configs core runs with, and CI type-checks each one and loads it through the config
loader, so what this page shows is what the current release accepts. Read them on GitHub in
[`packages/core/genoa.config/`](https://github.com/GenoaCMS/genoacms/tree/main/packages/core/genoa.config).

Each imports the modules `genoa init` writes beside it: `collections`, `authorization`, `security`
and `languages`. Replace the placeholder names — `my-project`, `my-company`, the bucket names — with
your own resources: GenoaCMS works on buckets and databases that already exist.

## Google Cloud

Users sign in through Firebase Authentication or Identity Platform; content lives in Cloud Storage and
Firestore; GenoaCMS runs as a Cloud Run function. Every provider authenticates as the function's
service account, so the config holds no credential.

@include ../../../../../../core/genoa.config/gcp.ts

Before the first deploy:

- **Authentication.** Enable Firebase Authentication (or Identity Platform) with email and password sign-in in `my-project`, and create the users there. The first administrator's `authorization.assignments` key is that user's UID.
- **Runtime service account** (`serviceAccount` above): `roles/storage.objectAdmin` on each bucket, `roles/datastore.user`, `roles/secretmanager.admin` or a narrower custom role, `roles/iam.serviceAccountTokenCreator` on itself (for signed URLs), and `roles/firebaseauth.viewer`.
- **You, deploying:** `roles/cloudfunctions.developer`, and `roles/iam.serviceAccountUser` on the runtime service account. `genoa deploy` uses your Application Default Credentials (`gcloud auth application-default login`), since the target sets no `credentials`.

```bash
genoa deploy gcp --config genoa.config/gcp.ts
```

## AWS

Content lives in S3 and DynamoDB, secrets in Secrets Manager, and GenoaCMS runs as a Lambda function.
Every provider takes the SDK's default credentials, which in Lambda are the function's execution role.
AWS has no authentication adapter yet, so administrators sign in from a list kept in Secrets Manager.

@include ../../../../../../core/genoa.config/aws.ts

Before the first deploy:

- **Tables.** Each collection is a DynamoDB table of the same name, with a string partition key named after its `primaryKey.key`.
- **Administrators.** Store `GENOACMS_ADMIN_CREDENTIALS` in Secrets Manager as a JSON array of `{ "email", "password", "subject" }`. The first administrator's `authorization.assignments` key is its `subject`.
- **Execution role** (`role` above): `s3:GetObject`, `PutObject`, `DeleteObject` and `ListBucket` on each bucket; `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem` and `Scan` on each table; `secretsmanager:GetSecretValue`, `DescribeSecret`, `PutSecretValue`, `CreateSecret` and `DeleteSecret`; and `AWSLambdaBasicExecutionRole` for logs.
- **You, deploying:** create, read and update the function and its URL, `iam:PassRole` on the execution role, and `s3:PutObject` on `artifactBucket`.

```bash
genoa deploy aws --config genoa.config/aws.ts
```

## Self-hosted

Content lives in MinIO and PostgreSQL on machines you run, and Node serves GenoaCMS. No cloud account
is involved.

@include ../../../../../../core/genoa.config/self-hosted.ts

:::caution[A development config]
Every secret here lives in `.genoacms/secrets.env`, the development store, and a production build
refuses it. GenoaCMS has no secrets store yet that runs in production without a cloud account. To run
self-hosted in production, keep MinIO, Postgres and Node, and point `secrets` at a cloud secret
manager.
:::

Before the first start:

- **MinIO:** the buckets `cms` and `public` exist.
- **PostgreSQL:** the database `genoacms`, a user `genoacms` that can read and write it, and one table per collection.
- **Secrets:** `.genoacms/secrets.env` holds `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `POSTGRES_PASSWORD` and `GENOACMS_ADMIN_CREDENTIALS`, the last as one line of JSON.

```bash
genoa dev --config genoa.config/self-hosted.ts
```

To serve it without the dev server, `genoa deploy node --mode development --config genoa.config/self-hosted.ts`
builds it and copies the artifact to `build/`; run `npm install --omit=dev` there, and start it with
`node build`.
