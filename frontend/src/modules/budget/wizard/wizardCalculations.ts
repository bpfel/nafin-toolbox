// Budget Wizard Calculation Logic
// Swiss-specific tax brackets, health insurance by age, and budget allocation

export interface WizardData {
  monthlyIncome: number
  age: number
  healthInsurance?: number // Custom health insurance, if not set uses age-based default
  rent: number
  food: number
  goal: 'invest' | 'save' | 'save_goal'
  // Goal-specific fields
  investmentRisk?: 'conservative' | 'balanced' | 'aggressive'
  savingsRate?: number
  goalName?: string
  goalTarget?: number
  goalMonths?: number
}

export interface BudgetAllocation {
  // Income
  salary: number
  // Fixed expenses
  taxes: number
  healthInsurance: number
  rent: number
  // Variable expenses
  food: number
  utilities: number
  transportation: number
  telecom: number
  clothing: number
  entertainment: number
  diningOut: number
  // Savings & investments
  savings: number
  investments: number
  // Summary
  totalExpenses: number
  totalSavingsAndInvestments: number
  remaining: number
}

export interface SavingsProjection {
  monthlyContribution: number
  yearlyTotal: number
  investmentPortion: number
  savingsPortion: number
  // For save_goal
  monthsToGoal?: number
  onTrack?: boolean
}

// --- Tax Calculation ---

export function calculateMonthlyTax(monthlyIncome: number): number {
  const yearly = monthlyIncome * 12
  let rate: number

  if (yearly <= 40000) rate = 0.08
  else if (yearly <= 80000) rate = 0.12
  else if (yearly <= 120000) rate = 0.15
  else if (yearly <= 180000) rate = 0.18
  else rate = 0.22

  return Math.round((yearly * rate) / 12)
}

// --- Health Insurance by Age ---

export function calculateHealthInsurance(age: number): number {
  if (age < 19) return 120
  if (age < 26) return 280
  if (age < 35) return 350
  if (age < 45) return 380
  if (age < 55) return 420
  if (age < 65) return 480
  return 520
}

// --- Budget Allocation ---

export function calculateBudget(data: WizardData): BudgetAllocation {
  const { monthlyIncome, age, rent, food, goal } = data

  // Fixed costs
  const taxes = calculateMonthlyTax(monthlyIncome)
  // Use custom health insurance if provided, otherwise calculate from age
  const healthInsurance = data.healthInsurance ?? calculateHealthInsurance(age)

  // Calculate remaining after fixed costs
  const afterFixed = monthlyIncome - taxes - healthInsurance - rent - food

  // Default variable expenses
  const utilities = 150
  const transportation = 300
  const telecom = 80

  // Remaining after essential variable expenses
  const afterEssentials = afterFixed - utilities - transportation - telecom

  // Discretionary allocation (percentages of remaining)
  const clothing = Math.round(afterEssentials * 0.04)
  const entertainment = Math.round(afterEssentials * 0.08)
  const diningOut = Math.round(afterEssentials * 0.06)

  // What's left for savings/investments
  const availableForSavings = afterEssentials - clothing - entertainment - diningOut

  let savings: number
  let investments: number

  if (goal === 'invest') {
    // 70% investments, 30% savings
    investments = Math.round(availableForSavings * 0.70)
    savings = availableForSavings - investments
  } else if (goal === 'save') {
    // 80% savings, 20% investments
    savings = Math.round(availableForSavings * 0.80)
    investments = availableForSavings - savings
  } else {
    // save_goal: Calculate required monthly contribution
    const { goalTarget = 0, goalMonths = 12 } = data
    const requiredMonthly = goalMonths > 0 ? Math.ceil(goalTarget / goalMonths) : 0

    if (requiredMonthly <= availableForSavings) {
      savings = requiredMonthly
      investments = availableForSavings - savings
    } else {
      // Can't reach goal in time, max out savings
      savings = availableForSavings
      investments = 0
    }
  }

  const totalExpenses = taxes + healthInsurance + rent + food +
    utilities + transportation + telecom + clothing + entertainment + diningOut

  const totalSavingsAndInvestments = savings + investments
  const remaining = monthlyIncome - totalExpenses - totalSavingsAndInvestments

  return {
    salary: monthlyIncome,
    taxes,
    healthInsurance,
    rent,
    food,
    utilities,
    transportation,
    telecom,
    clothing,
    entertainment,
    diningOut,
    savings,
    investments,
    totalExpenses,
    totalSavingsAndInvestments,
    remaining,
  }
}

// --- Savings Projection ---

export function calculateProjection(data: WizardData, budget: BudgetAllocation): SavingsProjection {
  const monthlyContribution = budget.savings + budget.investments
  const yearlyTotal = monthlyContribution * 12

  const projection: SavingsProjection = {
    monthlyContribution,
    yearlyTotal,
    investmentPortion: budget.investments * 12,
    savingsPortion: budget.savings * 12,
  }

  if (data.goal === 'save_goal' && data.goalTarget) {
    const monthsToGoal = budget.savings > 0
      ? Math.ceil(data.goalTarget / budget.savings)
      : Infinity

    projection.monthsToGoal = monthsToGoal
    projection.onTrack = data.goalMonths ? monthsToGoal <= data.goalMonths : true
  }

  return projection
}

// --- Default Values ---

export const DEFAULTS = {
  food: 650,
  utilities: 150,
  transportation: 300,
  telecom: 80,
}

// --- Category Structure for seeding ---

export interface WizardCategory {
  name: string
  type: 'income' | 'expense'
  groupName: string
  fixed: boolean
  amount: number
}

export function generateCategories(budget: BudgetAllocation, data: WizardData): WizardCategory[] {
  const categories: WizardCategory[] = [
    // Income
    { name: 'Salary (net)', type: 'income', groupName: 'Employment', fixed: true, amount: budget.salary },

    // Housing
    { name: 'Rent', type: 'expense', groupName: 'Housing', fixed: true, amount: budget.rent },
    { name: 'Utilities', type: 'expense', groupName: 'Housing', fixed: false, amount: budget.utilities },

    // Insurance & Taxes
    { name: 'Health Insurance', type: 'expense', groupName: 'Insurance & Taxes', fixed: true, amount: budget.healthInsurance },
    { name: 'Taxes', type: 'expense', groupName: 'Insurance & Taxes', fixed: true, amount: budget.taxes },

    // Living
    { name: 'Food & Groceries', type: 'expense', groupName: 'Living', fixed: false, amount: budget.food },
    { name: 'Transportation', type: 'expense', groupName: 'Living', fixed: false, amount: budget.transportation },
    { name: 'Telecommunications', type: 'expense', groupName: 'Living', fixed: true, amount: budget.telecom },

    // Lifestyle
    { name: 'Clothing & Footwear', type: 'expense', groupName: 'Lifestyle', fixed: false, amount: budget.clothing },
    { name: 'Entertainment & Recreation', type: 'expense', groupName: 'Lifestyle', fixed: false, amount: budget.entertainment },
    { name: 'Dining Out', type: 'expense', groupName: 'Lifestyle', fixed: false, amount: budget.diningOut },
  ]

  // Add savings categories based on goal
  if (budget.savings > 0) {
    const savingsName = data.goal === 'save_goal' && data.goalName
      ? `Savings: ${data.goalName}`
      : 'Savings'
    categories.push({
      name: savingsName,
      type: 'expense',
      groupName: 'Savings & Investments',
      fixed: false,
      amount: budget.savings,
    })
  }

  if (budget.investments > 0) {
    categories.push({
      name: 'Investments',
      type: 'expense',
      groupName: 'Savings & Investments',
      fixed: false,
      amount: budget.investments,
    })
  }

  return categories
}

// --- Formatting helpers ---

export function formatCHF(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
