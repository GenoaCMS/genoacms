import { chromium, type Locator, type Page } from 'playwright'

const PREFIX = 'demo'
const ORIGIN = process.env.GENOACMS_DEMO_ORIGIN ?? 'http://localhost:5173'
const SLOW_MS = 30_000

interface DemoComponent { name: string, attributes: ReadonlyArray<{ type: string, name: string }> }

const COMPONENTS = {
  page: { name: `${PREFIX}Page`, attributes: [{ type: 'components', name: 'body' }] },
  section: { name: `${PREFIX}Section`, attributes: [{ type: 'string', name: 'heading' }, { type: 'components', name: 'content' }] },
  card: { name: `${PREFIX}Card`, attributes: [{ type: 'string', name: 'title' }, { type: 'text', name: 'body' }] },
  note: { name: `${PREFIX}Note`, attributes: [{ type: 'string', name: 'text' }, { type: 'number', name: 'order' }] }
} as const satisfies Record<string, DemoComponent>

const PAGES = { home: `${PREFIX}Home`, flat: `${PREFIX}Flat`, empty: `${PREFIX}Empty` } as const

function required (name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`demo/missing-variable: set ${name}`)
  return value
}

const shown = async (locator: Locator): Promise<void> => { await locator.first().waitFor({ state: 'visible', timeout: SLOW_MS }) }

async function counted (locator: Locator, expected: number): Promise<void> {
  const deadline = Date.now() + SLOW_MS
  while (await locator.count() !== expected) {
    if (Date.now() > deadline) throw new Error(`demo/timeout: expected ${expected} of ${locator.toString()}`)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

async function visit (page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

async function signIn (page: Page): Promise<void> {
  await visit(page, '/login')
  await page.getByPlaceholder('Username').fill(required('GENOACMS_DEMO_EMAIL'))
  await page.getByPlaceholder('Password').fill(required('GENOACMS_DEMO_PASSWORD'))
  await Promise.all([page.waitForURL('**/dashboard'), page.getByRole('button', { name: 'Login' }).click()])
}

const nestedCard = (page: Page, component: string): Locator => page.locator('.card')
  .filter({ has: page.getByRole('link', { name: 'Edit' }) })
  .filter({ hasNot: page.getByRole('button', { name: 'Add component' }) })
  .filter({ hasText: component })

const attributeCard = (page: Page, name: string): Locator =>
  page.locator('.card').filter({ has: page.getByRole('heading', { name, exact: true }) })

async function createComponent (page: Page, component: DemoComponent): Promise<void> {
  await visit(page, '/components/registrar')
  await page.getByRole('button', { name: 'Register component' }).click()
  const dialog = page.getByRole('dialog', { name: 'Register a new component' })
  await dialog.getByLabel('Component name:').fill(component.name)
  await dialog.getByRole('radio', { name: 'Already coded in my app' }).check()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await shown(page.getByText(`Component: ${component.name}`))
  for (const attribute of component.attributes) {
    await page.getByRole('button', { name: 'Add attribute' }).click()
    await page.getByRole('dialog', { name: 'New attribute' }).getByRole('button', { name: attribute.type, exact: true }).click()
    const field = page.getByLabel('Name:').last()
    await shown(field)
    await field.fill(attribute.name)
  }
  await page.getByRole('button', { name: 'Submit' }).click()
  await shown(page.getByText(/success|saved|updated/i))
  await page.getByRole('button', { name: 'Publish' }).click()
  const publish = page.getByRole('dialog', { name: 'Publish the component' })
  await publish.getByRole('textbox').last().fill('published for the consumer demos')
  await publish.getByRole('button', { name: /publish/i }).click()
  await shown(page.getByText('Published', { exact: true }))
}

async function createPage (page: Page, name: string, root: string): Promise<void> {
  await visit(page, '/components/pages')
  await page.getByRole('button', { name: 'Create page' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a new page' })
  await dialog.getByLabel('Name:').fill(name)
  await dialog.getByLabel('Component:').selectOption({ label: root })
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await shown(page.getByRole('heading', { name }))
}

async function openPage (page: Page, name: string): Promise<void> {
  await visit(page, `/components/pages/${encodeURIComponent(name)}`)
  await shown(page.getByRole('heading', { name }))
}

async function nest (page: Page, component: string): Promise<void> {
  const before = await nestedCard(page, component).count()
  await page.getByRole('button', { name: 'Add component' }).click()
  await page.locator('form').filter({ hasText: component }).getByRole('button').click()
  await counted(nestedCard(page, component), before + 1)
}

async function openNested (page: Page, component: string, index = 0): Promise<void> {
  const before = page.url()
  await nestedCard(page, component).nth(index).getByRole('link', { name: 'Edit' }).click()
  await page.waitForURL(url => url.href !== before, { timeout: SLOW_MS })
  await page.waitForLoadState('networkidle')
}

async function fill (page: Page, attribute: string, value: string): Promise<void> {
  const field = attributeCard(page, attribute).locator('input[type="text"], textarea, input[type="number"]').first()
  await shown(field)
  await field.fill(value)
}

async function saveNode (page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await shown(page.getByText(/saved/i))
}

async function buildPage (page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Build' }).click()
  await shown(page.getByText(/saved|built|success/i))
}

async function publishHome (page: Page): Promise<void> {
  await createPage(page, PAGES.home, COMPONENTS.page.name)
  await nest(page, COMPONENTS.section.name)
  await openNested(page, COMPONENTS.section.name)
  await fill(page, 'heading', 'Welcome')
  await saveNode(page)
  await nest(page, COMPONENTS.card.name)
  await nest(page, COMPONENTS.note.name)
  await nest(page, COMPONENTS.section.name)
  await openNested(page, COMPONENTS.card.name)
  await fill(page, 'title', 'What this is')
  await fill(page, 'body', 'One page, fetched and verified by four different frameworks.')
  await saveNode(page)
  await openPage(page, PAGES.home)
  await openNested(page, COMPONENTS.section.name)
  await openNested(page, COMPONENTS.note.name)
  await fill(page, 'text', 'Every signature was checked in the browser.')
  await fill(page, 'order', '1')
  await saveNode(page)
  await openPage(page, PAGES.home)
  await openNested(page, COMPONENTS.section.name)
  await openNested(page, COMPONENTS.section.name)
  await fill(page, 'heading', 'Going deeper')
  await saveNode(page)
  await nest(page, COMPONENTS.card.name)
  await openNested(page, COMPONENTS.card.name)
  await fill(page, 'title', 'Nested twice')
  await fill(page, 'body', 'This card is four levels below the root.')
  await saveNode(page)
  await openPage(page, PAGES.home)
  await buildPage(page)
}

async function publishFlat (page: Page): Promise<void> {
  await createPage(page, PAGES.flat, COMPONENTS.page.name)
  await nest(page, COMPONENTS.card.name)
  await nest(page, COMPONENTS.card.name)
  await nest(page, COMPONENTS.note.name)
  await openNested(page, COMPONENTS.card.name, 0)
  await fill(page, 'title', 'First')
  await fill(page, 'body', 'The first of two cards.')
  await saveNode(page)
  await openPage(page, PAGES.flat)
  await openNested(page, COMPONENTS.card.name, 1)
  await fill(page, 'title', 'Second')
  await fill(page, 'body', 'The second, which must not borrow the first\'s text.')
  await saveNode(page)
  await openPage(page, PAGES.flat)
  await openNested(page, COMPONENTS.note.name)
  await fill(page, 'text', 'A note beside them.')
  await fill(page, 'order', '2')
  await saveNode(page)
  await openPage(page, PAGES.flat)
  await buildPage(page)
}

async function publishEmpty (page: Page): Promise<void> {
  await createPage(page, PAGES.empty, COMPONENTS.page.name)
  await buildPage(page)
}

async function publish (page: Page): Promise<void> {
  for (const component of Object.values(COMPONENTS)) await createComponent(page, component)
  await publishHome(page)
  await publishFlat(page)
  await publishEmpty(page)
  console.log(`Demo pages published: ${Object.values(PAGES).join(', ')}`)
}

async function removeSelected (page: Page, path: string, name: string): Promise<void> {
  await visit(page, path)
  const box = page.getByRole('button', { name: `select-${name}`, exact: true })
  if (await box.count() === 0) return
  await box.click()
  await page.getByRole('button', { name: 'Delete selected' }).click()
  await page.locator('input[name="confirmation"]').fill((await page.locator('code').innerText()).trim())
  await page.getByRole('button', { name: /^Yes, delete/ }).click()
  await counted(page.getByRole('button', { name: `select-${name}`, exact: true }), 0)
}

// CMP-10
async function clean (page: Page): Promise<void> {
  for (const name of Object.values(PAGES)) await removeSelected(page, '/components/pages', name)
  for (const component of Object.values(COMPONENTS)) await removeSelected(page, '/components/registrar', component.name)
  console.log('Demo content removed')
}

const COMMANDS: Record<string, (page: Page) => Promise<void>> = { publish, clean }

async function main (): Promise<void> {
  const command = COMMANDS[process.argv[2] ?? '']
  if (command === undefined) throw new Error(`demo/usage: node demo/demo.ts ${Object.keys(COMMANDS).join('|')}`)
  const browser = await chromium.launch()
  try {
    const page = await (await browser.newContext({ baseURL: ORIGIN })).newPage()
    await signIn(page)
    await command(page)
  } finally {
    await browser.close()
  }
}

await main()
