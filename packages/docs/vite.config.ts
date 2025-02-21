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
            to: '/guide',
          }
				],
				sidebar: {
          '/guide': [
            {
              title: 'Introduction',
              items: [
                {
                  title: 'What is GenoaCMS?',
                  to: '/guide/introduction',
                },
                {
                  title: 'Getting Started',
                  to: '/guide/getting-started',
                }
              ]
            }
          ]
				},
				github: 'https://github.com/GenoaCMS/core',
        logo: '/favicon.png',
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
