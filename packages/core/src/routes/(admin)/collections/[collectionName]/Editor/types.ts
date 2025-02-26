import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

type BooleanValue = boolean
type NumberValue = number
type StringValue = string
type TextValue = string
type MarkdownValue = string
type ResourceValue = ObjectReference | null
type ResourcesValue = Array<ObjectReference>
type ArrayValue = Array<InputValue>
type ObjectValue = Record<string, InputValue>
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

type Constraints = Record<string, Constraints> | Record<string, string> | undefined
type Errors = Record<string, Errors> | Array<string> | undefined

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
