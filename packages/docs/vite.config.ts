import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { defaultTheme } from '@sveltepress/theme-default'
import { sveltepress } from '@sveltepress/vite'
import { defineConfig, type Plugin } from 'vite'

const INCLUDE_LINE = /^@include (\S+)$/gm

function fencedFile (path: string, page: string): string {
  const file = resolve(dirname(page), path)
  if (!existsSync(file)) throw new Error(`include: ${path} not found (in ${relative(process.cwd(), page)})`)
  const contents = readFileSync(file, 'utf-8').replace(/\n$/, '')
  return `\`\`\`${extname(file).slice(1)}\n${contents}\n\`\`\``
}

/** Replaces each `@include <path>` line of a page with the file, as a fenced code block. */
function include (): Plugin {
  return {
    name: 'genoacms-docs-include',
    enforce: 'pre',
    transform (src, id) {
      if (!id.endsWith('+page.md')) return
      return src.replace(INCLUDE_LINE, (_line, path: string) => fencedFile(path, id))
    }
  }
}

const config = defineConfig({
  plugins: [
    include(),
    sveltepress({
      theme: defaultTheme({
        navbar: [
          {
            title: 'Guide',
            to: '/guide/introduction'
          },
          {
            title: 'Reference',
            to: '/reference/config/'
          }
        ],
        sidebar: {
          '/guide/': [
            {
              title: 'Introduction',
              items: [
                {
                  title: 'What is GenoaCMS?',
                  to: '/guide/introduction/'
                },
                {
                  title: 'Getting Started',
                  to: '/guide/getting-started/'
                }
              ]
            },
            {
              title: 'Configuration',
              items: [
                {
                  title: 'Config structure',
                  to: '/guide/config/structure/'
                },
                {
                  title: 'Providers',
                  to: '/guide/config/providers/'
                },
                {
                  title: 'Services',
                  to: '/guide/config/services/'
                },
                {
                  title: 'Secrets',
                  to: '/guide/config/secrets/'
                },
                {
                  title: 'Examples',
                  to: '/guide/config/examples/'
                },
                {
                  title: 'Adapters',
                  to: '/guide/adapters/'
                }
              ]
            },
            {
              title: 'Operations',
              items: [
                {
                  title: 'Roles and permissions',
                  to: '/guide/authorization/'
                },
                {
                  title: 'Identity and sessions',
                  to: '/guide/sessions/'
                },
                {
                  title: 'Signing keys',
                  to: '/guide/signing-keys/'
                },
                {
                  title: 'What GenoaCMS stores',
                  to: '/guide/storage-layout/'
                },
                {
                  title: 'CLI',
                  to: '/guide/cli/'
                }
              ]
            },
            {
              title: 'Consumers',
              items: [
                {
                  title: 'Rendering pages in your app',
                  to: '/guide/consumer/'
                },
                {
                  title: 'Adding a language',
                  to: '/guide/language-adapters/'
                }
              ]
            }
          ],
          '/reference/': [
            {
              title: 'Client SDK',
              items: [
                {
                  title: 'Documents a consumer receives',
                  to: '/reference/sdk/documents/'
                },
                {
                  title: 'The attribute vocabulary',
                  to: '/reference/sdk/attributes/'
                }
              ]
            },
            {
              title: 'Contracts',
              items: [
                {
                  title: 'Authentication',
                  to: '/reference/contracts/authentication/'
                },
                {
                  title: 'Database',
                  to: '/reference/contracts/database/'
                },
                {
                  title: 'Deployment',
                  to: '/reference/contracts/deployment/'
                },
                {
                  title: 'Secrets',
                  to: '/reference/contracts/secrets/'
                },
                {
                  title: 'Storage',
                  to: '/reference/contracts/storage/'
                }
              ]
            },
            {
              title: 'Config',
              items: [
                {
                  title: '@genoacms/config',
                  to: '/reference/config/'
                }
              ]
            }
          ]
        },
        highlighter: {
          languages: ['svelte', 'sh', 'bash', 'js', 'html', 'ts', 'md', 'css', 'scss', 'json']
        },
        github: 'https://github.com/GenoaCMS/genoacms',
        logo: '/sail.png',
        preBuildIconifyIcons: {
          'vscode-icons': ['file-type-json', 'typescript-icon', 'file-type-vite'],
          'game-icons': ['swiss-army-knife'],
          tabler: ['cloud-network', 'code-off', 'database-edit', 'brand-typescript', 'shield-check']
        }
      }),
      siteConfig: {
        title: 'GenoaCMS',
        description: 'Platform-agnostic headless CMS'
      }
    })
  ]
})

export default config
