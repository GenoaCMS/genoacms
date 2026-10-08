import { describe, it, expect } from 'vitest'
import { validator } from '@exodus/schemasafe'
import { formats } from './validators'
import { collections } from '../../../../genoa.config/collections'

const getCollection = (name: string) => {
  const collection = collections.find((c: { name: string }) => c.name === name)
  if (!collection) throw new Error(`Collection ${name} not found in genoa.config/collections`)
  return collection
}

type StorageReference = { bucket: string, name: string }

type Section = {
  type: string
  headline?: string
  subheadline?: string
  coverImage?: StorageReference | null
  cta?: { label: string, url: string, style: string }
  title?: string
  columns?: number
  images?: Array<StorageReference>
  features?: Array<{ icon: string, heading: string, body: string }>
  body?: string
  callout?: { enabled: boolean, note: string }
}

type Article = {
  id: string
  title: string
  slug: string
  isPublished: boolean
  author: string
  contributors: Array<string>
  metadata: {
    readingTimeMinutes: number
    tags: Array<string>
    seo: { metaTitle: string, metaDescription: string, socialShareImage: StorageReference | null }
  }
  sections: Array<Section>
}

describe('complex nested collections schema validation', () => {
  const articles = getCollection('articles')
  const authors = getCollection('authors')
  const validateArticle = validator(articles.schema as any, { formats })
  const validateAuthor = validator(authors.schema as any, { formats })

  const validAuthor = {
    id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    name: 'Alice Johnson',
    role: 'Lead Architect',
    avatar: {
      bucket: 'public-assets',
      name: 'avatars/alice.jpg'
    }
  }

  const createValidArticle = (): Article => ({
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    title: 'Architecting Scalable Systems',
    slug: 'architecting-scalable-systems',
    isPublished: true,
    author: validAuthor.id,
    contributors: [validAuthor.id],
    metadata: {
      readingTimeMinutes: 12,
      tags: ['architecture', 'performance', 'cloud'],
      seo: {
        metaTitle: 'Architecting Scalable Systems | GenoaCMS Guide',
        metaDescription: 'In-depth guide to modern decoupled content architectures.',
        socialShareImage: {
          bucket: 'public-assets',
          name: 'shares/scalable-systems.png'
        }
      }
    },
    sections: [
      {
        type: 'hero',
        headline: 'Next-Generation Content Platforms',
        subheadline: 'Zero-trust component isolation and declarative database schemas.',
        coverImage: {
          bucket: 'public-assets',
          name: 'hero/header.png'
        },
        cta: {
          label: 'Get Started',
          url: '/docs/quickstart',
          style: 'primary'
        }
      },
      {
        type: 'gallery',
        title: 'Platform Architecture Diagrams',
        columns: 3,
        images: [
          { bucket: 'diagrams', name: 'layer-1.png' },
          { bucket: 'diagrams', name: 'layer-2.png' }
        ]
      },
      {
        type: 'featureGrid',
        title: 'Core Architecture Pillars',
        features: [
          {
            icon: 'shield-check',
            heading: 'Cryptographic Integrity',
            body: 'Components and schemas are cryptographically signed.'
          },
          {
            icon: 'speedometer2',
            heading: 'Zero Blocking Time',
            body: 'Streamed promises ensure sub-50ms initial page responses.'
          }
        ]
      },
      {
        type: 'richText',
        body: 'Detailed technical analysis of declarative schemas and runtime guards.',
        callout: {
          enabled: true,
          note: 'This section is rendered through the markdown pipeline.'
        }
      }
    ]
  })

  it('validates a complete article with all nested polymorphic sections', () => {
    const article = createValidArticle()
    const isValid = validateArticle(article)
    expect(validateArticle.errors).toBeUndefined()
    expect(isValid).toBe(true)
  })

  it('validates an author with nullable avatar resource', () => {
    const withAvatar = { ...validAuthor }
    expect(validateAuthor(withAvatar)).toBe(true)

    const withNullAvatar = { ...validAuthor, avatar: null }
    expect(validateAuthor(withNullAvatar)).toBe(true)
  })

  it('allows optional deep properties to be omitted or null', () => {
    const article = createValidArticle()
    article.metadata.seo.socialShareImage = null
    article.sections[0].coverImage = null
    article.sections = []

    expect(validateArticle(article)).toBe(true)
  })

  it('accepts valid enum values for button style and rejects unknown options', () => {
    const article = createValidArticle()
    const cta = (article.sections[0] as any).cta

    cta.style = 'secondary'
    expect(validateArticle(article)).toBe(true)

    cta.style = 'outline'
    expect(validateArticle(article)).toBe(true)

    cta.style = 'nonexistent-style'
    expect(validateArticle(article)).toBe(false)
  })

  it('defines enum options on the button style schema', () => {
    const hero = (articles.schema as any).properties.sections.items.oneOf.find(
      (v: any) => v.properties?.type?.const === 'hero'
    )
    expect(hero).toBeDefined()
    expect(hero.properties.cta.properties.style.enum).toEqual(['primary', 'secondary', 'outline'])
  })

  it('rejects an unknown polymorphic discriminator type in sections', () => {
    const article = createValidArticle()
    article.sections.push({
      type: 'unsupportedType',
      data: 'sample'
    } as any)

    expect(validateArticle(article)).toBe(false)
  })

  it('rejects a section missing the required type discriminator', () => {
    const article = createValidArticle()
    article.sections.push({
      headline: 'Missing type discriminator'
    } as any)

    expect(validateArticle(article)).toBe(false)
  })

  it('rejects invalid types in deeply nested sub-arrays', () => {
    const article = createValidArticle()
    const featureGrid = article.sections[2] as any
    expect(featureGrid.type).toBe('featureGrid')

    featureGrid.features[0].icon = 12345
    expect(validateArticle(article)).toBe(false)
  })

  it('rejects malformed storage resources with invalid property types', () => {
    const article = createValidArticle()
    const gallery = article.sections[1] as any
    expect(gallery.type).toBe('gallery')

    // bucket must be a string, not a number
    gallery.images[0] = { bucket: 12345, name: 'orphaned-file.png' }
    expect(validateArticle(article)).toBe(false)

    // image must be an object, not a string
    gallery.images[0] = 'not-an-object'
    expect(validateArticle(article)).toBe(false)
  })
})
