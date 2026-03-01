export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export type PricingTable = Record<string, ModelPricing>;

export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface StepCostReport {
  stepId: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface CostReport {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byStep: Record<string, StepCostReport>;
  byModel: Record<string, { inputTokens: number; outputTokens: number; cost: number; calls: number }>;
}

export interface BudgetConfig {
  hardLimit?: number;
  softLimit?: number;
  onSoftLimit?: (report: CostReport) => void;
}

export interface CostTrackerOptions {
  pricing: PricingTable;
  budget?: BudgetConfig;
  unknownModelPolicy?: 'zero' | 'error';
}

export interface WrapLLMMethodConfig {
  extractUsage: (result: unknown) => TokenUsage;
  getModel?: (...args: unknown[]) => string;
}

export interface WrapLLMServiceOptions<T> {
  service: T;
  tracker: CostTracker;
  methods: { [K in keyof T]?: WrapLLMMethodConfig };
}

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED' as const;
  readonly report: CostReport;

  constructor(report: CostReport, hardLimit: number) {
    super(`Budget exceeded: $${report.totalCost.toFixed(4)} >= hard limit $${hardLimit.toFixed(4)}`);
    this.name = 'BudgetExceededError';
    this.report = report;
  }
}

interface Accumulator {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export class CostTracker {
  private readonly pricing: PricingTable;
  private readonly budget?: BudgetConfig;
  private readonly unknownModelPolicy: 'zero' | 'error';
  private readonly stepData = new Map<string, Accumulator>();
  private readonly modelData = new Map<string, Accumulator>();
  private totalCost = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCalls = 0;
  private softLimitFired = false;

  // Mutable so wrapLLMService proxies can attribute cost without threading stepId through user code.
  currentStepId: string | undefined;

  constructor(options: CostTrackerOptions) {
    this.pricing = options.pricing;
    this.budget = options.budget;
    this.unknownModelPolicy = options.unknownModelPolicy ?? 'zero';
  }

  private accumulate(map: Map<string, Accumulator>, key: string, usage: TokenUsage, cost: number): void {
    const existing = map.get(key);
    if (existing) {
      existing.calls++;
      existing.inputTokens += usage.inputTokens;
      existing.outputTokens += usage.outputTokens;
      existing.cost += cost;
    } else {
      map.set(key, { calls: 1, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cost });
    }
  }

  recordUsage(usage: TokenUsage): void {
    const rates = this.pricing[usage.model];
    if (!rates) {
      if (this.unknownModelPolicy === 'error') {
        throw new Error(`Unknown model "${usage.model}" not in pricing table`);
      }
    }

    const inputCost = rates ? (usage.inputTokens / 1_000_000) * rates.inputPerMillion : 0;
    const outputCost = rates ? (usage.outputTokens / 1_000_000) * rates.outputPerMillion : 0;
    const callCost = inputCost + outputCost;

    this.totalCost += callCost;
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;
    this.totalCalls++;

    if (this.currentStepId) this.accumulate(this.stepData, this.currentStepId, usage, callCost);
    this.accumulate(this.modelData, usage.model, usage, callCost);

    if (
      this.budget?.softLimit !== undefined &&
      !this.softLimitFired &&
      this.totalCost >= this.budget.softLimit
    ) {
      this.softLimitFired = true;
      this.budget.onSoftLimit?.(this.report());
    }
  }

  checkBudget(): void {
    if (this.budget?.hardLimit !== undefined && this.totalCost >= this.budget.hardLimit) {
      throw new BudgetExceededError(this.report(), this.budget.hardLimit);
    }
  }

  stepReport(stepId: string): StepCostReport | undefined {
    const data = this.stepData.get(stepId);
    if (!data) return undefined;
    return { stepId, ...data };
  }

  report(): CostReport {
    const byStep: CostReport['byStep'] = {};
    for (const [stepId, data] of this.stepData) {
      byStep[stepId] = { stepId, ...data };
    }

    const byModel: CostReport['byModel'] = {};
    for (const [model, data] of this.modelData) {
      byModel[model] = { ...data };
    }

    return {
      totalCost: this.totalCost,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCalls: this.totalCalls,
      byStep,
      byModel,
    };
  }
}

export function createCostTracker(options: CostTrackerOptions): CostTracker {
  return new CostTracker(options);
}

export function wrapLLMService<T extends Record<string, unknown>>(
  options: WrapLLMServiceOptions<T>
): T {
  const { service, tracker, methods } = options;
  const wrapped = { ...service } as T;

  for (const key of Object.keys(methods) as Array<keyof T>) {
    const config = methods[key];
    if (!config) continue;

    const originalFn = service[key];
    if (typeof originalFn !== 'function') continue;

    const { extractUsage, getModel } = config;

    (wrapped as Record<string, unknown>)[key as string] = async (...args: unknown[]) => {
      tracker.checkBudget();
      const result = await (originalFn as (...a: unknown[]) => Promise<unknown>).apply(service, args);
      const usage = extractUsage(result);
      if (getModel) usage.model = getModel(...args);
      tracker.recordUsage(usage);
      return result;
    };
  }

  return wrapped;
}
