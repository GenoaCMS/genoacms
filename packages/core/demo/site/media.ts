interface ObjectReference { bucket: string, name: string }

const MEDIA_BUCKET = process.env.GENOACMS_DEMO_MEDIA_BUCKET ?? 'genoacms-public'

/** The Pillars of Creation in the Eagle Nebula, already in the media bucket. Credit: NASA, ESA, CSA, STScI (CC BY 4.0). */
const PILLARS: ObjectReference = { bucket: MEDIA_BUCKET, name: 'sagittarius-line/pillars-of-creation.webp' }

export { PILLARS }
export type { ObjectReference }
