interface ActivityRecordBase {
  timestamp: number
}
interface StorageActivityRecord extends ActivityRecordBase {
  type: 'storage',
  sessionId: string,
  bucket: string,
  path: string
}
interface CollectionsActivityRecord extends ActivityRecordBase {
  type: 'collections',
  collection: string,
  document: string
}
interface ComponentHeaderActivityRecord extends ActivityRecordBase {
  type: 'componentHeader',
  componentId: string,
  componentName: string
}
interface ComponentCodeActivityRecord extends ActivityRecordBase {
  type: 'componentCode',
  componentId: string,
  componentName: string
}
interface PageActivityRecord extends ActivityRecordBase {
  type: 'page',
  pageId: string,
  pageName: string
}
type ActivityRecord = StorageActivityRecord
| CollectionsActivityRecord
| ComponentHeaderActivityRecord
| ComponentCodeActivityRecord
| PageActivityRecord

export type {
  StorageActivityRecord,
  CollectionsActivityRecord,
  ComponentHeaderActivityRecord,
  ComponentCodeActivityRecord,
  PageActivityRecord,
  ActivityRecord
}
