/**
 * Where a compiled component runs.
 *
 * **This file used to describe the artifact as well**, as a `ComponentExecutable` interface: the
 * whole payload a consumer verified and executed, with its own identity, publisher and timestamps.
 * That artifact no longer exists as a document of its own. A component is released as **one** signed
 * publication carrying both what it accepts and the bundles it compiled to, so the shape belongs to
 * the CMS's publication payload and to whatever a consumer restates from the published format —
 * neither of which is a contract between packages.
 *
 * What is left here is the one part that genuinely is: the platform a bundle is built for. A
 * language adapter names its own target when it compiles, and the CMS records that name inside the
 * signed payload, so the two must mean the same thing by it.
 */

/**
 * Where an artifact runs. One publication may be compiled for several.
 *
 * An open string, not a fixed list, for the reason `ComponentLanguage` is one: platforms come from
 * language adapters, and a closed union here would mean that a third-party adapter emitting
 * `android-dex` could not name its own target without the CMS being edited to permit it.
 *
 * **This value is inside the signed payload**, so it is part of what a consumer verifies. Openness
 * therefore does not mean laxity: a consumer runs the bundle built for a platform it supports, and
 * decides *after* verifying the signature — a publication compiled only for other targets is a
 * correctly signed release meant for somebody else, not a corrupted one.
 *
 * It is carried per bundle rather than per publication, which is what lets one release serve several
 * runtimes — and what keeps a page pinning a publication rather than a platform.
 */
type ExecutablePlatform = string

export type {
  ExecutablePlatform
}
