# Drift audit: `docs/architecture/adapter-aws/` against `packages/adapter-aws`

- **Date:** 2026-10-08
- **Commit audited:** `9f43931` (branch `claude/serene-golick-869e74`, working tree clean)
- **Documents:** `README.md` (AWS-1 to AWS-4), `storage.md` (OBJ-1 to OBJ-11), `database.md` (DDB-1 to DDB-7), `secrets.md` (ASM-1 to ASM-6), `deployment.md` (LMB-1 to LMB-15): 43 current statements.
- **Code:** `packages/adapter-aws/src/**`, `packages/adapter-aws/test/**`.
- **Method:** each statement read, then the code implementing it, then every test file it names. Levels checked against `scripts/test-level.mjs` and `.github/workflows/ci.yml`: unit = everything except `test/**` and `src/deployment/stage.test.ts`; integration = `src/deployment/stage.test.ts`; contract = `test/conformance.test.ts` and `test/contract/**`.
- **Runs:**
  - `pnpm --filter @genoacms/adapter-aws test` (with `GENOACMS_TEST_AWS` unset): 10 files passed, 122 tests passed. The 5 contract files (26 tests) **skipped**: they need AWS credentials and no real AWS service was called. Contract tests were read, not run.
  - `node docs/tools/check-docs.mjs docs`: 0 errors, 5 warnings, all in non-AWS documents (`conforms: false`).
  - No mutation testing was run. The test gaps below come from reading the tests against the statements, not from a falsification audit (WORKFLOW §6.3).
- **Side effect:** `pnpm install` was needed before the tests ran. A `pnpm run build` also wrote `packages/adapter-aws/dist/`, which git ignores. Nothing tracked changed.

Doc line numbers refer to the file named. Code paths are relative to `packages/adapter-aws/` unless they start with `docs/`, `scripts/` or `.github/`.

---

## Findings

### D1 · LMB-12 · A wait that fails other than with `Failed` is not specified, and SDK errors inside a wait do not propagate unchanged

- **Doc:** `docs/architecture/adapter-aws/deployment.md:188-193` (LMB-12); `README.md:67-72` (WD2).
- **Code:** `src/deployment/functions.ts:22` (`WAIT_SECONDS = 600`), `:80-98` (`failureReason`, `awaiting`, `waitActive`, `waitUpdated`). The SDK's `waitUntilFunctionActiveV2` and `waitUntilFunctionUpdatedV2` (`@aws-sdk/client-lambda@3.1144.0`, `dist-es/waiters/waitForFunction*V2.js`) treat **any** exception of their `GetFunction` poll as `RETRY`.
- **Observable mismatch:**
  1. If the function stays `Pending`, or its update stays `InProgress`, for 600 s, the deploy throws `deploy/function-failed: <StateReason, else State, e.g. "Pending">`, although the function did not fail. LMB-12 names only `Failed`, and the 600 s limit appears in no statement.
  2. An SDK error from the poll's `GetFunction`, such as `AccessDeniedException` or throttling, is retried silently for 600 s and then reported as `deploy/function-failed: …`, or is replaced by the error of the follow-up `GetFunctionConfiguration`. WD2 says SDK errors propagate unchanged.
  3. If the `GetFunctionConfiguration` in `failureReason` fails, its error propagates instead of `deploy/function-failed`, and the waiter's error, which LMB-12 says is the `cause`, is lost.
- **Severity:** behavior.
- **Options:** (a) extend LMB-12 to state the wait limit and what a timeout and a poll error produce; (b) change the code so that a poll error propagates unchanged, and only `Failed` or a timeout map to `deploy/function-failed`; (c) both.

### D2 · LMB-9, LMB-11 (and Design "The whole configuration is written on every deploy") · An existing function URL or permission is never reconciled

- **Doc:** `deployment.md:50-51` (Design: "a setting changed in the console is reverted by the next deploy"), `:167-170` (LMB-9: "`ResourceConflictException` … because the URL or the statement already exists, is not an error"), `:181-183` (LMB-11: "ensured as in LMB-9").
- **Code:** `src/deployment/functions.ts:71-77` (`ignoringConflict` swallows every `ResourceConflictException`), `:116-132` (`ensurePublicUrl`).
- **Observable mismatch:**
  1. A function URL whose `AuthType` was changed to `AWS_IAM`, whose `InvokeMode` was changed to `RESPONSE_STREAM`, or whose CORS was edited in the console keeps those settings after a deploy, because `CreateFunctionUrlConfig` conflicts and nothing updates the URL. The same holds for a policy statement with the ID `FunctionURLAllowPublicAccess` or `FunctionURLInvokeAllowPublicAccess` but a different condition or principal. The Design decision says console changes are reverted.
  2. `ResourceConflictException` is also Lambda's error for "an update is in progress". The code swallows it for any reason, while LMB-9 gives only "already exists" as the reason. Whether a conflict for another reason is tolerated is therefore undefined in the document.
- **Severity:** behavior.
- **Options:** (a) qualify the Design decision and LMB-9/LMB-11: the URL and statements are created if absent and otherwise left as they are; (b) change the code to reconcile them, for example with `UpdateFunctionUrlConfig`, or `RemovePermission` followed by `AddPermission`; (c) tolerate only the "already exists" conflict, and state how it is recognized.

### D3 · DDB-3 · Reading an unsupported attribute type is unspecified

- **Doc:** `database.md:93-95` (DDB-3: "Read attributes convert back the same way"); Design `:44-47` ("sets and binary values are not supported").
- **Code:** `src/database/values.ts:45-52` (`fromAttribute` throws `database/unsupported-value: <attribute type names>`).
- **Observable mismatch:** an item written by another tool with an `SS`, `NS`, `BS` or `B` attribute makes `getDocument` reject, and makes `getCollection` reject for the whole collection. The message is `database/unsupported-value: SS` (the type's name), not the `<path>` that DDB-3 defines for this message on writes. No statement says that a read throws, what the message is, or that one such item fails the whole scan.
- **Severity:** behavior (uncovered).
- **Options:** (a) add the read behavior and its message to DDB-3; (b) change the message to carry the field's path; (c) convert sets to arrays, or skip the field, on read.

### D4 · DDB-3 · "its decimal string" vs. JavaScript's `String(n)`

- **Doc:** `database.md:95` ("a finite number as `N` (its decimal string)").
- **Code:** `src/database/values.ts:27-30` (`{ N: String(value) }`).
- **Observable mismatch:** for |n| ≥ 1e21 or 0 < |n| < 1e-6, the request carries exponent notation (`"1e+21"`, `"1e-7"`), not a decimal string. No test establishes whether DynamoDB accepts that form: the unit test (`src/database/values.test.ts:15-35`) and the contract test (`test/contract/database.test.ts:14-22`) use only 42, 0.5, -3 and 1.
- **Severity:** editorial. It becomes behavior if DynamoDB rejects exponent notation.
- **Options:** (a) reword DDB-3 to "`String(n)`"; (b) change the code to always emit a plain decimal; (c) add a contract case with such numbers to settle it.

### D5 · LMB-5 · Install failures the statement does not describe

- **Doc:** `deployment.md:139-144` (LMB-5).
- **Code:** `src/deployment/stage.ts:63-68`.
- **Observable mismatch:**
  1. `execFile`'s default `maxBuffer` (1 MiB) applies. If npm writes more than that to stdout or stderr, npm is killed and the deploy throws `deploy/install-failed: …`, although the install might have succeeded.
  2. If `npm` cannot be started (ENOENT), or exits without stderr output, the message is `deploy/install-failed: ` with an empty reason.
  3. The error carries the original error as `cause`. LMB-5 does not say so; LMB-7 says it for its own error.
- **Severity:** behavior (uncovered).
- **Options:** (a) state the output limit, the empty-reason case and `cause` in LMB-5; (b) lift the buffer limit, for example by streaming, and/or fall back to the error's message when stderr is empty.

### D6 · LMB-6 · A write error on the archive file is not handled

- **Doc:** `deployment.md:146-150` (LMB-6).
- **Code:** `src/deployment/stage.ts:72-83`. The promise rejects on the archiver's `error` and resolves on the output's `close`. No listener handles the output stream's `error`.
- **Observable mismatch:** a failure writing `<workDir>/build.zip` (ENOSPC, EACCES) raises an unhandled `error` event, which crashes the CLI process or leaves the deploy hanging, instead of rejecting with an error. No statement covers an archive failure.
- **Severity:** behavior (uncovered).
- **Options:** (a) add a statement for archive failures (message, propagation); (b) reject on the output stream's `error`.

### D7 · LMB-13 · A missing URL, or a failed URL read, after a successful deploy

- **Doc:** `deployment.md:195-200` (LMB-13).
- **Code:** `src/deployment/procedure.ts:38-39`, `src/deployment/functions.ts:156-157`.
- **Observable mismatch:**
  1. If `GetFunctionUrlConfig` returns no `FunctionUrl`, the deploy succeeds and prints nothing.
  2. If `GetFunctionUrlConfig` fails, its error propagates and the deploy reports failure, although the function was already created or updated.

  Neither case is stated.
- **Severity:** behavior (uncovered).
- **Options:** (a) state both cases in LMB-13; (b) throw on a missing URL; (c) treat a failed URL read as a warning.

### D8 · LMB-4 · A `run.sh` in the build is overwritten

- **Doc:** `deployment.md:127` (the entry is written "replacing a file of that name"; `run.sh` gets no such clause), `:134` ("The copied files … are not changed").
- **Code:** `src/deployment/stage.ts:56-58` (`writeFile(runScript, …)` overwrites).
- **Observable mismatch:** a build directory containing `run.sh` is staged with that file replaced by the launcher, which contradicts "the copied files are not changed" as written.
- **Severity:** editorial.
- **Options:** (a) add "replacing a file of that name" for `run.sh` too; (b) refuse a build that contains `run.sh`.

### D9 · README IAM table · The operator needs `lambda:GetFunctionConfiguration`

- **Doc:** `README.md:110` (operator Lambda grants).
- **Code:** `src/deployment/functions.ts:80-81` (`GetFunctionConfigurationCommand` on the failure path of every wait).
- **Observable mismatch:** an operator granted exactly the listed actions gets `AccessDeniedException` instead of `deploy/function-failed: <reason>` when a wait fails (this compounds D1.3).
- **Severity:** editorial (Design), with a behavioral consequence.
- **Options:** (a) add `lambda:GetFunctionConfiguration` to the table; (b) read the reason from `GetFunction`, which is already granted, and keep the table.

### D10 · Conformance suite described as it was

- **Doc:** `README.md:20`, `README.md:134`, `database.md:69`.
- **Code/CI:** `test/conformance.test.ts:7, 38-49` (creates its own run table `genoacms-contract-<runId>` through `createRunTable`, `test/contract/aws.ts:76-85`); `scripts/test-level.mjs` (`contract` runs `test/conformance.test.ts`); `.github/workflows/ci.yml` (contract step sets `GENOACMS_TEST_AWS`, no `GENOACMS_TEST_AWS_TABLE`).
- **Mismatch:** the documents name `test/conformance.test.js`, but the file is `.ts`. They say the suite uses `GENOACMS_TEST_AWS_TABLE`, but it creates and deletes a table per run. They say it "has never run in CI", but CI runs it at the `contract` level on every push. DDB-4 to DDB-7 and OBJ-3 rely on it at `contract`.
- **Severity:** editorial.
- **Options:** update both paragraphs and the file name. Whether the suite has actually passed in CI would need a CI record; this audit did not check one.

### D11 · Stale wording

- **Doc:** `README.md:206` (heading `Shared (src/shared.js)`, but the file is `src/shared.ts`); `README.md:131` ("The contract tests … **will** run", but they exist and CI runs them); `secrets.md:16` ("`@genoacms/adapter-aws/secrets` **will** serve", but the provider is implemented).
- **Severity:** editorial.
- **Options:** update the path and the tense.

### T1 · LMB-5 · At its declared level, the install arguments and "no shell" are not checked

- **Doc:** `deployment.md:139-144` (`- Level: integration`).
- **Tests:** `src/deployment/stage.test.ts:224-230` (integration). Its title says "installs for Linux x64 without a shell", but it asserts only that a broken `package.json` yields `deploy/install-failed: …EJSONPARSE…`. `src/deployment/procedure.test.ts:196-203` does assert the arguments and the absence of `shell`, but it mocks `node:child_process` (the subject of the statement) and runs at `unit`, a level LMB-5 does not declare.
- **Mismatch:** at `integration`, a version without `--os=linux`, `--cpu=x64` or `--libc=glibc`, or one that runs through a shell, passes. `check-results.mjs` is still satisfied, because the integration test carries the ID.
- **Severity:** test gap.
- **Options:** (a) assert the arguments at integration, for example with a fake `npm` first on `PATH` that records its argv and environment; (b) add `unit` to LMB-5's Level and accept the mocked check for the arguments; (c) mark the arguments part `(unverified: …)` at integration.

### T2 · LMB-12 · "The previous code keeps serving after a failed update" is untested, and so is the timeout path

- **Doc:** `deployment.md:190-193` (`- Level: unit`).
- **Tests:** `src/deployment/procedure.test.ts:309-325, 428-433` test only `Failed` reasons, with the waiters mocked.
- **Mismatch:** the clause about the previous code describes Lambda, which a unit test cannot observe, and no contract test exists for LMB-12. The timeout and poll-error behavior of D1 has no test at all.
- **Severity:** test gap.
- **Options:** (a) a contract case (deploy a version that fails to start, then check the URL still serves the old one); (b) mark the clause `(unverified: …)`; (c) once D1 is settled, unit cases for a timeout and a poll error.

### T3 · OBJ-10 · Error paths and "the first key" are weakly tested

- **Doc:** `storage.md:131-136`.
- **Tests:** `src/storage/runtime.test.ts:260-284, 399-405`.
- **Mismatch:** these versions pass every test: (a) one that reports the *last* key of `Errors`, since the test returns a single error; (b) one that catches and swallows a rejected `ListObjectsV2` or `DeleteObjects`, since neither failure is injected; (c) one that keeps deleting the remaining batches after a reported error. Whether (c) is allowed is itself open, since OBJ-10 only says the directory is left "partly deleted".
- **Severity:** test gap.
- **Options:** add fault-injection cases (two `Errors` entries; a rejected list and a rejected delete; a failure in the first of several batches); state in OBJ-10 whether later batches are sent.

### T4 · OBJ-11 · Paging and "lists them first" are untested for a move

- **Doc:** `storage.md:138-143`.
- **Tests:** `src/storage/runtime.test.ts:286-309, 407-420`. Every move test answers with a single, untruncated page.
- **Mismatch:** a `moveDirectory` that reads only the first listing page, or that interleaves copies with the listing, passes. A rejected `ListObjectsV2` is not tested either. In the code, paging is shared with OBJ-10 through `keysUnder` (`src/storage/runtime.ts:57-66`), so it is correct today, but nothing pins it for OBJ-11.
- **Severity:** test gap.
- **Options:** add a two-page move case that asserts all list calls come before the first `CopyObject`, plus a listing-failure case.

### T5 · OBJ-7, ASM-2 · Clauses about the external service have no contract test

- **Doc:** `storage.md:112` ("deleting a missing object is not an error, as S3 answers it with success"); `secrets.md:96` ("A key Secrets Manager does not accept fails with its error").
- **Tests:** `test/contract/storage.test.ts:208-215` deletes only an existing object; `test/contract/secrets.test.ts` uses only valid keys. The unit tests cannot observe either clause.
- **Severity:** test gap.
- **Options:** add contract cases (`deleteObject` of a missing key resolves; `getSecret`/`setSecret` of an invalid name, for example one over 512 characters, rejects with AWS's error); or mark the clauses `(unverified: …)`.

### T6 · OBJ-1, DDB-1, ASM-1, LMB-1 · Parts of the descriptor statements are untested

- **Doc:** `storage.md:64-69`, `database.md:75-80`, `secrets.md:82-87`, `deployment.md:99-104`.
- **Tests:** `src/storage/descriptor.test.ts:8`, `src/database/descriptor.test.ts:8`, `src/secrets/descriptor.test.ts:8`, `src/deployment/descriptor.test.ts:15`.
- **Mismatch:**
  - The *specifiers* (`@genoacms/adapter-aws/storage`, `…/database`, `…/secrets`, `…/deployment`), which `package.json` `exports` maps to `dist/…`, are checked by no test: every test imports `./descriptor.js` from `src`.
  - ASM-1's `BootstrapSecret` restriction (`env()` or `inline()` only) is a type and is not tested.
  - LMB-1's "Kind `deployment`" and "It imports no SDK" are not asserted. `descriptor.kind` is checked for the three runtimes but not for deployment.
- **Severity:** test gap.
- **Options:** add a test importing through the package specifiers against the built `dist`; assert `kind`; add an import-graph test showing that the deployment descriptor loads no `@aws-sdk/*` module; or mark these parts `(unverified: a type)` and similar.

### T7 · DDB-3, LMB-10 · A mislabeled test title, and "exactly" unverified at contract

- **Tests:** `src/database/runtime.test.ts:166` is titled `DDB-3, DDB-7: propagates SDK errors unchanged`, but it asserts nothing about value conversion. The DDB-3 ID is mislabeled there. Separately, `test/contract/artifact/handler.js:1-2` echoes only six chosen variables, so LMB-10's "exactly" (no extra variables, `AWS_LAMBDA_EXEC_WRAPPER` present) is checked only at `unit` (`src/deployment/procedure.test.ts:228-241`), although LMB-10 declares `unit, contract`.
- **Severity:** test gap (editorial for the title).
- **Options:** drop `DDB-3` from that title; have the contract handler echo the full `process.env` minus Lambda's reserved variables, or reduce LMB-10's contract claim.

---

## Existing findings

All 27 `W` findings (WF1 to WF27) are marked fixed. Each was checked against the code and tests at `9f43931`, and each fix still holds:

| Finding | Evidence |
| :-- | :-- |
| WF1 | `moveObject`, `deleteDirectory`, `moveDirectory` implemented (`src/storage/runtime.ts:126-175`) |
| WF2 | `getObject` propagates (`src/storage/runtime.ts:94-98`; test `runtime.test.ts:107-114`) |
| WF3 | no adapter message replaces an SDK error; the only own messages are those named by statements |
| WF4 | directories as references, also with no files, name not normalized (`src/storage/runtime.ts:138-155`) |
| WF5 | placeholder written with no prior read (`src/storage/runtime.ts:158-161`) |
| WF6 | every method calls `requireRegistered` (test `runtime.test.ts:76-95`) |
| WF7 | `ifAbsent` wins (`src/storage/runtime.ts:83`) |
| WF8 | Scan follows `LastEvaluatedKey` (`src/database/runtime.ts:67-80`) |
| WF9 | missing item resolves `undefined` (`src/database/runtime.ts:86`) |
| WF10 | `UpdateItem` + `attribute_exists` (`src/database/runtime.ts:97-103`) |
| WF11 | key overridden after conversion, `attribute_not_exists` (`src/database/runtime.ts:57-62`) |
| WF12 | both reads strip the key (`withoutKey`) |
| WF13 | non-string key refused; NaN/Infinity refused; `undefined` omitted (`src/database/values.ts`) |
| WF14 | secrets provider exists (`src/secrets/`) |
| WF15, WF16, WF17, WF18 | function URL deploy, waits, configuration update, `nodejs22.x`, printed URL, per-function key, Linux install flags (`src/deployment/`) |
| WF19 | IDs in test titles; `files: ["dist"]`; `tsconfig.json` excludes `*.test.ts`, and the built `dist/` holds no test file |
| WF20 | empty and non-string settings refused with one reason (`descriptor.test.ts`, LMB-3 tests) |
| WF21 | empty update still sends the conditional `UpdateItem` (test `runtime.test.ts:135-144`) |
| WF22 | key field removed before conversion (test `runtime.test.ts:146-151`) |
| WF23 | each listed mutation now has a test that fails (sampled: OBJ-11 placeholders, ASM-4/5/6 error paths, LMB-9 non-conflict errors, LMB-2 settings, LMB-3 patterns, LMB-6 dotfiles and level, AWS-4 database/secrets, OBJ-8 name, OBJ-9 no read) |
| WF24 | `DeletedDate` → absent; `DescribeSecret` before delete (`src/secrets/runtime.ts:31-39, 86-95`) |
| WF25 | entry sets the address from `http.sourceIp` only (`src/deployment/stage.ts:15-40`) |
| WF26 | stage tests cover no context, repeated context, empty `sourceIp`, other property; ASM-3 test uses a future `DeletedDate` |
| WF27 | ASM-6 now states the stale read; the contract test retries until the delete is visible (`test/contract/secrets.test.ts:101-108`) |

None is marked open, so there is no open finding to recheck.

---

## Other observations (not drift)

- **LMB-3 vs. LMB-9 partitions.** LMB-3 accepts role ARNs of every partition (`arn:aws-cn`, `arn:aws-us-gov`; test `src/deployment/descriptor.test.ts:98-102`), but LMB-9 fixes the layer ARN to `arn:aws:lambda:…:753240598075:…`, which does not exist outside the `aws` partition. Code and documents agree, so this is not drift. A deploy to China or GovCloud passes validation and then fails at `CreateFunction`.

---

## Summary

| Label | Statement | Severity | Doc | Code / test |
| :-- | :-- | :-- | :-- | :-- |
| D1 | LMB-12 (WD2) | behavior | `deployment.md:188` | `src/deployment/functions.ts:22, 80-98` |
| D2 | LMB-9, LMB-11, Design | behavior | `deployment.md:50, 167, 181` | `src/deployment/functions.ts:71-77, 116-132` |
| D3 | DDB-3 | behavior (uncovered) | `database.md:93` | `src/database/values.ts:45-52` |
| D4 | DDB-3 | editorial (possibly behavior) | `database.md:95` | `src/database/values.ts:27-30` |
| D5 | LMB-5 | behavior (uncovered) | `deployment.md:139` | `src/deployment/stage.ts:63-68` |
| D6 | LMB-6 | behavior (uncovered) | `deployment.md:146` | `src/deployment/stage.ts:72-83` |
| D7 | LMB-13 | behavior (uncovered) | `deployment.md:195` | `src/deployment/procedure.ts:38-39` |
| D8 | LMB-4 | editorial | `deployment.md:127, 134` | `src/deployment/stage.ts:56-58` |
| D9 | — (README IAM) | editorial | `README.md:110` | `src/deployment/functions.ts:80-81` |
| D10 | — (Verification text) | editorial | `README.md:20, 134`; `database.md:69` | `test/conformance.test.ts`; CI |
| D11 | — (wording) | editorial | `README.md:131, 206`; `secrets.md:16` | — |
| T1 | LMB-5 | test gap | `deployment.md:139` | `src/deployment/stage.test.ts:224` |
| T2 | LMB-12 | test gap | `deployment.md:190` | `src/deployment/procedure.test.ts:309` |
| T3 | OBJ-10 | test gap | `storage.md:131` | `src/storage/runtime.test.ts:260-284` |
| T4 | OBJ-11 | test gap | `storage.md:138` | `src/storage/runtime.test.ts:286-309` |
| T5 | OBJ-7, ASM-2 | test gap | `storage.md:112`; `secrets.md:96` | `test/contract/*.test.ts` |
| T6 | OBJ-1, DDB-1, ASM-1, LMB-1 | test gap | the four descriptor statements | `src/*/descriptor.test.ts` |
| T7 | DDB-3, LMB-10 | test gap / editorial | `database.md:93`; `deployment.md:174` | `src/database/runtime.test.ts:166`; `test/contract/artifact/handler.js` |

Totals: 6 behavior (D1 to D3, D5 to D7), 5 editorial (D4, which becomes behavior if DynamoDB rejects exponent notation, and D8 to D11), 7 test gaps (T1 to T7).

## Statements checked with no drift

These 26 statements' code matches the text, and their named tests exist, carry the ID, and check the statement at the declared level, apart from the contract runs, which were skipped:

AWS-1 (unverified, a type, as declared), AWS-2, AWS-3, AWS-4, OBJ-2, OBJ-3, OBJ-4, OBJ-5, OBJ-6, OBJ-8, OBJ-9, DDB-2, DDB-4, DDB-5, DDB-6, DDB-7, ASM-3, ASM-4, ASM-5, ASM-6, LMB-2, LMB-3, LMB-7, LMB-8, LMB-14, LMB-15.

The remaining 17 have at least one finding above: OBJ-1, OBJ-7, OBJ-10, OBJ-11, DDB-1, DDB-3, ASM-1, ASM-2, LMB-1, LMB-4, LMB-5, LMB-6, LMB-9, LMB-10, LMB-11, LMB-12, LMB-13. LMB-10's is only T7's contract-level note. Clauses that cannot be observed and were already recorded in WS5 (DDB-5's order, OBJ-5's expiry with the role's session) are not repeated.
