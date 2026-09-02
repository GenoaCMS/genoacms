/**
 * Which paths this application will serve out of the instance's bucket.
 *
 * ## The reason this file exists
 *
 * The bucket is **private**, and it holds far more than the signed documents a consumer needs: page
 * drafts, component source, user records, the authorization manifests. The route beside this reads
 * paths on the browser's behalf, and a route that read *whatever path it was given* would be an
 * unauthenticated window onto all of it — a directory traversal where the traversal is simply the
 * URL.
 *
 * So the answer is an allowlist, and it is written as **shapes rather than a prefix check**. A prefix
 * is the tempting version and it is not enough: `.genoacms/` also contains the drafts and the
 * manifests, and `startsWith` would hand them over just as happily.
 *
 * ## What a consumer is allowed to read
 *
 * Exactly the three things the SDK fetches, and nothing else:
 *
 * - the **key registry**, at one fixed path;
 * - a **published page tree**, by name;
 * - a **publication**, by component and release.
 *
 * Every one of them is a signed, published document. Publishing is the act that makes a document
 * public, so serving these is not a leak — it is the thing the signing exists for. Everything else in
 * the bucket has never been published and is refused here.
 *
 * ## This whole file is temporary, and says so
 *
 * A consumer should be reading published documents from somewhere public, not asking an application
 * to fetch them out of a private bucket with a service account. Publish mirrors — copying the
 * published directory to a bucket and path an instance nominates — are what replace it, and when they
 * land this route goes away and the SDK is pointed straight at the mirror with `httpSource`.
 *
 * Until then this exists so the demo can run against the instance as it is configured today, and it
 * is deliberately the narrowest thing that works.
 */

/** Fixed by the specification. The one document verified against the root key. */
const REGISTRY = '.genoacms/keys/public.json'

/**
 * One path segment: no separators, no traversal, and not empty.
 *
 * `..` is excluded by the character class rather than by looking for it, because looking for it is
 * the check people write and then miss an encoding of. A name here is a page name or a uid, and
 * neither has any business containing a dot-dot or a slash.
 */
const SEGMENT = '[A-Za-z0-9][A-Za-z0-9._-]*'

const PAGE_TREE = new RegExp(`^\\.genoacms/pages/readables/${SEGMENT}$`)
const PUBLICATION = new RegExp(`^\\.genoacms/components/public/${SEGMENT}/${SEGMENT}\\.json$`)

/**
 * Whether a path names a published document this application will serve.
 *
 * Refuses before anything reaches storage, so a path that is not allowed is never even looked up —
 * a lookup would otherwise tell an asker, through its timing and its status, whether an object they
 * may not read exists.
 *
 * ## The anchors do all of it, and that is worth saying
 *
 * There was a guard here rejecting leading slashes, doubled separators and surrounding whitespace.
 * It was **dead code**: `^` and `$` with segments that cannot contain a separator already refuse
 * every one of them. It was removed rather than kept as belt-and-braces, because a check that looks
 * like it is protecting something and is not gets trusted by the next person to change this.
 *
 * The subtle half is the trailing newline, which is why the tests pin it: JavaScript's `$` — without
 * the `m` flag — matches only at the very end of the input, and **not** before a final newline the
 * way Perl's does. If that were not true, `…/home\n` would be a second spelling of a path only one
 * spelling of which was ever considered.
 */
const isPublishedDocument = (path: string): boolean => {
  if (path === REGISTRY) return true
  return PAGE_TREE.test(path) || PUBLICATION.test(path)
}

export { isPublishedDocument, REGISTRY }
