import type { ObjectReference } from '@genoacms/contracts/storage'

type BooleanValue = boolean
type NumberValue = number
type StringValue = string
type TextValue = string
type MarkdownValue = string
type ResourceValue = ObjectReference | null
type ResourcesValue = Array<ObjectReference>
type ArrayValue = Array<InputValue>
type ObjectValue = { [key: string]: InputValue }
type InputValue = undefined
| BooleanValue
| NumberValue
| StringValue
| TextValue
| MarkdownValue
| ResourceValue
| ResourcesValue
| ArrayValue
| ObjectValue

type Constraints = { [key: string]: Constraints } | Record<string, string> | undefined
type Errors = { [key: string]: Errors } | Array<string> | undefined

export type {
  BooleanValue,
  NumberValue,
  StringValue,
  TextValue,
  MarkdownValue,
  ResourceValue,
  ResourcesValue,
  ArrayValue,
  ObjectValue,
  InputValue,
  Constraints,
  Errors
}
