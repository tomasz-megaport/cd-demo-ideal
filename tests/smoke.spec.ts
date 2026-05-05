import { expect, test } from '@playwright/test'

test.describe('cd-demo smoke', () => {
  test('page loads and version banner is populated', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('#sha-display')).not.toHaveText('—')
    await expect(page.locator('#sha-display')).not.toBeEmpty()
    await expect(page.locator('#ts-display')).not.toHaveText('—')
    await expect(page.locator('#ts-display')).not.toBeEmpty()
  })

  test('[Next] advances the step counter', async ({ page }) => {
    await page.goto('/')

    const counter = page.locator('#step-num')
    await expect(counter).toHaveText('1')

    await page.locator('#btn-next').click()
    await expect(counter).toHaveText('2')

    await page.locator('#btn-next').click()
    await expect(counter).toHaveText('3')

    await page.locator('#btn-prev').click()
    await expect(counter).toHaveText('2')
  })

  test('mermaid diagram updates when stepping', async ({ page }) => {
    await page.goto('/')

    // Different demos host the diagram under different IDs
    // (#mermaid-container, #diagram-container, or just an unwrapped svg).
    const svg = page.locator('svg').first()
    if ((await svg.count()) === 0) {
      test.skip(true, 'no svg present in this demo (placeholder)')
    }
    await svg.waitFor({ state: 'attached' })

    // Capture a stable fingerprint of the first svg + its node classes +
    // any inline shape styles. Demos signal "active" via either an "active"
    // class or inline shape styling; this catches both.
    const fingerprint = async () => {
      const svgHtml = await page.locator('svg').first().innerHTML()
      const classBag = await page
        .locator('svg .node')
        .evaluateAll(nodes => nodes.map(n => `${n.id}:${n.getAttribute('class') ?? ''}`).join('|'))
      const inlineBag = await page
        .locator('svg .node rect, svg .node polygon, svg .node circle')
        .evaluateAll(shapes =>
          shapes
            .map(s => `${(s as SVGElement).style.stroke || ''}/${(s as SVGElement).style.filter || ''}`)
            .join('|'),
        )
      return { classBag, inlineBag, svgLen: svgHtml.length }
    }

    const before = await fingerprint()
    await page.locator('#btn-next').click()
    await page.waitForTimeout(250)
    const after = await fingerprint()

    expect(after).not.toEqual(before)
  })
})
