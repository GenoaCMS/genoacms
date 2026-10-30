# `@genoacms/adapter-postgres`

The GenoaCMS `database` service on PostgreSQL. Each collection is a table you already have; the
adapter reads and writes its rows, and never creates or alters a table.

## Configuration

```ts
import { defineConfig, databaseProvider, secret } from '@genoacms/config'
import type {} from '@genoacms/adapter-postgres'   // registers the adapter's option types; erased at runtime
import { collections } from './collections.js'

export default defineConfig({
  // … the other services …
  database: {
    providers: {
      postgres: databaseProvider('@genoacms/adapter-postgres', {
        host: 'db.example.com',
        port: 5432,
        database: 'site',
        user: 'genoacms',
        password: secret('POSTGRES_PASSWORD')
      })
    },
    databases: { site: { provider: 'postgres', collections } }
  }
})
```

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `host` | `string` | required | The server's host name or address. |
| `port` | integer | the driver's, 5432 | The server's port. |
| `database` | `string` | required | The database to connect to. |
| `user` | `string` | required | The role to connect as. |
| `password` | `secret()`, `env()` or `inline()` | required | The role's password. A bare string is refused: it would be written into the build. |

Any other option is refused when the config loads (`unknown option '<name>'`). Each provider keeps
its own connection pool. TLS and other connection settings are not configurable.

## Collections and tables

A collection's `name` is the table's name, in the connection's current schema, and
`primaryKey.key` is its primary key column:

```ts
import type { CollectionReference } from '@genoacms/contracts/database'

const authors: CollectionReference = {
  name: 'authors',
  primaryKey: { key: 'id', schema: { type: 'string' } },
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' }
    }
  }
}
```

- **New documents' IDs.** When the key's schema is `{ type: 'string' }`, the adapter generates a
  UUID for each new row. Otherwise the table must assign the key itself, with a column default such
  as `GENERATED ALWAYS AS IDENTITY`. IDs always read back as strings.
- **The key cannot change.** Updating a document with a different value in its key field throws
  `database/key-immutable: <key>`.
- **Columns are fixed.** A field the table has no column for matches no condition, and writing one
  fails with PostgreSQL's error. A column the document never set reads as `null`. Objects and
  arrays are written as JSON; store them in `json` or `jsonb` columns.
- **Values.** Strings may not contain U+0000. Values the contract does not allow (`NaN`, `Infinity`,
  `Date`, `bigint`, nested arrays and others) throw `database/unsupported-value: <path>` before any
  query.

## Queries

Listings filter in SQL. A condition compares a field only when the column holds a value of the
condition's JSON type, strings by their bytes (`COLLATE "C"`). Pages are ordered by the key and
continue after the last key of the page before; `limit` is from 1 to 1000. A malformed query or page
token throws `database/invalid-query: <reason>`.

The adapter implements the [database contract](https://genoacms.js.org/reference/contracts/database/), and
passes the `@genoacms/conformance` database suite against PostgreSQL 16 in CI.

## Permissions

The role needs `SELECT`, `INSERT`, `UPDATE` and `DELETE` on each collection's table, and read access
to `information_schema.columns`, which the adapter reads once per table to learn its columns.
