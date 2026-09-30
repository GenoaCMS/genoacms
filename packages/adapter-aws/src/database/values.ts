import type { AttributeValue } from '@aws-sdk/client-dynamodb'

export function toItem (_document: Record<string, unknown>, _path?: string): Record<string, AttributeValue> {
  throw new Error('not implemented')
}

export function toAttribute (_value: unknown, _path: string): AttributeValue {
  throw new Error('not implemented')
}

export function fromItem (_item: Record<string, AttributeValue>): Record<string, unknown> {
  throw new Error('not implemented')
}

export function fromAttribute (_value: AttributeValue): unknown {
  throw new Error('not implemented')
}
