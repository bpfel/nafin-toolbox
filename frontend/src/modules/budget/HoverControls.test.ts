import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { PlanEntryView } from '../../lib/budget/budgetEngine'
import type { VaultData } from '../../lib/crypto/vault'
import { toggleEditing, clearEditing } from '../../lib/util/editMode.svelte'

vi.mock('../../lib/crypto/vaultStore.svelte', () => ({
  markDirty: vi.fn(),
}))

import BudgetTable from './BudgetTable.svelte'
import BudgetEntryRow from './BudgetEntryRow.svelte'
import budgetTableSource from './BudgetTable.svelte?raw'
import budgetEntryRowSource from './BudgetEntryRow.svelte?raw'

afterEach(() => {
  cleanup()
  clearEditing()
})

// Component styles are compiled to a separate stylesheet that vitest never
// injects into jsdom, so getComputedStyle would report the same thing whatever
// the CSS said. The rules are therefore read from source: the claim under test
// is about the stylesheet, not about one rendered instance.
const sources: Record<string, string> = {
  'BudgetTable.svelte': budgetTableSource,
  'BudgetEntryRow.svelte': budgetEntryRowSource,
}

function styleBlock(file: string): string {
  const match = sources[file].match(/<style>([\s\S]*)<\/style>/)
  if (!match) throw new Error(`${file} has no <style> block`)
  return match[1].replace(/\/\*[\s\S]*?\*\//g, '')
}

interface Rule {
  selector: string
  body: string
}

// Innermost rules only — an @media prelude has a brace-bearing body, so it never
// matches and its nested rules are picked up individually instead.
function rules(css: string): Rule[] {
  const out: Rule[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim(), body: m[2] })
  }
  return out
}

function rulesTouching(css: string, cls: string): Rule[] {
  return rules(css).filter(r => r.selector.includes(cls))
}

describe('edit-mode controls do not hide behind hover', () => {
  // The controls only exist inside edit mode, so nothing is left for a
  // hover-reveal to protect — and on a touchscreen there is no hover, which made
  // them unusable exactly when they had just been unlocked.
  const controls: [string, string][] = [
    ['BudgetTable.svelte', '.group-drag-handle'],
    ['BudgetTable.svelte', '.group-add'],
    ['BudgetEntryRow.svelte', '.drag-handle'],
    ['BudgetEntryRow.svelte', '.trash-btn'],
  ]

  for (const [file, cls] of controls) {
    test(`${cls} in ${file} is never faded out or hidden by a rule`, () => {
      const css = styleBlock(file)
      const touching = rulesTouching(css, cls)

      expect(touching.length).toBeGreaterThan(0)
      for (const rule of touching) {
        expect(rule.body).not.toMatch(/opacity\s*:/)
        expect(rule.body).not.toMatch(/visibility\s*:/)
      }
    })

    test(`${cls} in ${file} has no hover-gated appearance rule`, () => {
      const css = styleBlock(file)
      const hoverRules = rulesTouching(css, cls).filter(r => r.selector.includes(':hover'))

      // Hover may still shift the colour; it must not decide whether you can
      // see the control at all.
      for (const rule of hoverRules) {
        expect(rule.body).not.toMatch(/opacity\s*:|visibility\s*:|display\s*:/)
      }
    })
  }

  test('focus styling survived the hover removal', () => {
    for (const file of ['BudgetTable.svelte', 'BudgetEntryRow.svelte']) {
      const focusRules = rules(styleBlock(file)).filter(r => r.selector.includes(':focus-visible'))
      expect(focusRules.length).toBeGreaterThan(0)
      for (const rule of focusRules) {
        expect(rule.body).toMatch(/outline\s*:/)
      }
    }
  })
})

describe('the controls are in the DOM the moment edit mode is on', () => {
  function vault(): VaultData {
    return {
      version: 4,
      accounts: [{
        id: 'main', name: 'Main', kind: 'transactional', currency: 'CHF',
        currentAmount: '0.00', lastCorrectedAt: '2026-01-01',
      }],
      budget: {
        categoryGroups: [
          { id: 'g1', name: 'Housing', type: 'expense', sortOrder: 10 },
          { id: 'g2', name: 'Living', type: 'expense', sortOrder: 20 },
        ],
        categories: [],
        plan: [],
        archives: [],
      },
    }
  }

  function row(id: string, name: string, groupId: string, groupName: string): PlanEntryView {
    return {
      categoryId: id,
      categoryName: name,
      categoryType: 'expense',
      categoryGroupId: groupId,
      categoryGroupName: groupName,
      plannedAmount: '100.00',
    }
  }

  function renderTable() {
    return render(BudgetTable, {
      props: {
        vault: vault(),
        entries: [row('e1', 'Rent', 'g1', 'Housing'), row('e2', 'Food', 'g2', 'Living')],
        onsave: vi.fn(),
        oncategorycreated: vi.fn(),
        oncategorydeleted: vi.fn(),
      },
    })
  }

  // No hover is simulated anywhere in this test — that is the point of it.
  test('group handles and per-group add buttons render for every group', () => {
    toggleEditing('budget')
    const { container } = renderTable()

    expect(container.querySelectorAll('.group-drag-handle').length).toBe(2)
    expect(screen.getByLabelText('Add a category to Housing')).toBeTruthy()
    expect(screen.getByLabelText('Add a category to Living')).toBeTruthy()
  })

  test('outside edit mode neither is rendered at all', () => {
    const { container } = renderTable()

    expect(container.querySelectorAll('.group-drag-handle').length).toBe(0)
    expect(screen.queryByLabelText('Add a category to Housing')).toBeNull()
  })

  test('the row handle and trash button need no hover either', () => {
    toggleEditing('budget')
    const { container } = render(BudgetEntryRow, {
      props: {
        entry: row('e1', 'Rent', 'g1', 'Housing'),
        onsave: vi.fn(),
        ondelete: vi.fn(),
        onedit: vi.fn(),
      },
    })

    expect(container.querySelector('.drag-handle')).toBeTruthy()
    expect(container.querySelector('.trash-btn')).toBeTruthy()
  })
})
