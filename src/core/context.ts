import type { NodeServices, ExecutionContext as IExecutionContext } from './types.js';

export class ExecutionContext implements IExecutionContext {
  readonly services: NodeServices;
  private vars: Record<string, unknown>;

  constructor(services: NodeServices = {}, initialVars: Record<string, unknown> = {}) {
    this.services = services;
    this.vars = { ...initialVars };
  }

  setNodeOutput(nodeType: string, output: unknown): void {
    this.vars[nodeType] = output;
    if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
      for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
        this.vars[k] = v;
      }
    }
  }

  get(path: string): unknown {
    const parts = path.split('.');
    let current: unknown = this.vars;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      const bracketMatch = /^([^[]+)\[(\d+)\]$/.exec(part);
      if (bracketMatch) {
        const [, key, indexStr] = bracketMatch;
        current = (current as Record<string, unknown>)[key];
        if (!Array.isArray(current)) return undefined;
        current = current[Number(indexStr)];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }
    return current;
  }

  set(key: string, value: unknown): void {
    this.vars[key] = value;
  }

  interpolate(template: string): unknown {
    const singleRef = /^\{\{([^}]+)\}\}$/.exec(template);
    if (singleRef) {
      const value = this.get(singleRef[1].trim());
      return value !== undefined ? value : template;
    }
    return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
      const value = this.get(path.trim());
      if (value === undefined || value === null) return _match;
      return formatValue(value);
    });
  }

  /**
   * Recursively interpolate {{path}} references in an object's string values.
   *
   * NOTE: This is a runtime transform, not a type-safe operation. String values
   * like '{{ref}}' may become arrays, objects, or numbers after interpolation
   * (via single-var resolution). The returned type `T` matches the input shape
   * at compile time, but runtime types may differ. Zod schema validation in
   * registry.execute() catches mismatches at the boundary.
   */
  interpolateObject<T extends Record<string, unknown>>(obj: T): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.interpolateValue(value);
    }
    return result as T;
  }

  private interpolateValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.interpolate(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.interpolateValue(item));
    }
    if (value !== null && typeof value === 'object') {
      return this.interpolateObject(value as Record<string, unknown>);
    }
    return value;
  }

  snapshot(): Record<string, unknown> {
    return { ...this.vars };
  }

  static fromJSON(
    data: Record<string, unknown>,
    services?: NodeServices
  ): ExecutionContext {
    return new ExecutionContext(services ?? {}, data);
  }
}

export function createExecutionContext(
  services?: NodeServices,
  initialVars?: Record<string, unknown>
): ExecutionContext {
  return new ExecutionContext(services, initialVars);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}
