import { defaultTheme } from '@sveltepress/theme-default'
import { sveltepress } from '@sveltepress/vite'
import { defineConfig } from 'vite'

const config = defineConfig({
	plugins: [
		sveltepress({
			theme: defaultTheme({
				navbar: [
          {
            title: 'Guide',
            to: '/guide/introduction',
          },
          {
            title: 'Reference',
            to: '/reference/cloudabstraction/config/',
          }
				],
				sidebar: {
          '/guide/': [
            {
              title: 'Introduction',
              items: [
                {
                  title: 'What is GenoaCMS?',
                  to: '/guide/introduction/',
                },
                {
                  title: 'Getting Started',
                  to: '/guide/getting-started/',
                },
              ]
            },
            {
              title: 'Configuration',
              items: [
                {
                  title: 'Config structure',
                  to: '/guide/config/structure/',
                },
                {
                  title: 'Providers API',
                  to: '/guide/config/providers/',
                },
                {
                  title: 'Services',
                  to: '/guide/config/services/',
                }]
            }
          ],
          '/reference/': [
            {
              title: 'Cloud Abstraction',
              items: [
                {
                  title: 'Config',
                  to: '/reference/cloudabstraction/config/',
                },
                {
                  title: 'Authentication',
                  to: '/reference/cloudabstraction/authentication/',
                },
                {
                  title: 'Authorization',
                  to: '/reference/cloudabstraction/authorization/',
                },
                {
                  title: 'Database',
                  to: '/reference/cloudabstraction/database/',
                },
                {
                  title: 'Deployment',
                  to: '/reference/cloudabstraction/deployment/',
                },
                {
                  title: 'Storage',
                  to: '/reference/cloudabstraction/storage/',
                }
              ]
            }
          ]
				},
				github: 'https://github.com/GenoaCMS/core',
        logo: '/sail.png',
        preBuildIconifyIcons: {
          'bi': ['boxes'],
          'vscode-icons': ['file-type-json', 'typescript-icon', 'file-type-vite'],
          'game-icons': ['swiss-army-knife'],
          'tabler': ['cloud-network', 'code-off'],
          'si': ['json-fill'],
        },
      },
      ),
      siteConfig: {
        title: 'GenoaCMS',
				description: 'Platform-agnostic headless CMS',
      },
    }),
	],
})

export default config
