import type { NodeDefinition, NodeMetadata, NodeCategory, NodeResult, ExecutionContext } from './types.js';

export class NodeRegistry {
  private defs = new Map<string, NodeDefinition>();

  register(def: NodeDefinition): void {
    if (this.defs.has(def.type)) {
      throw new Error(`Node type "${def.type}" is already registered`);
    }
    this.defs.set(def.type, def);
  }

  registerAll(defs: readonly NodeDefinition[]): void {
    for (const def of defs) {
      this.register(def);
    }
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }

  unregister(type: string): boolean {
    return this.defs.delete(type);
  }

  async execute(
    type: string,
    rawInput: unknown,
    context: ExecutionContext
  ): Promise<NodeResult> {
    const def = this.defs.get(type);
    if (!def) {
      throw new Error(`Node type "${type}" is not registered`);
    }

    const validatedInput = def.inputSchema.parse(rawInput);
    const result = await def.executor(validatedInput, context);

    if (result.success && result.output !== undefined) {
      def.outputSchema.parse(result.output);
    }

    return result;
  }

  getMetadata(type: string): NodeMetadata | undefined {
    const def = this.defs.get(type);
    if (!def) return undefined;
    const { executor: _executor, inputSchema: _in, outputSchema: _out, ...metadata } = def;
    return metadata;
  }

  getByCategory(category: NodeCategory): NodeDefinition[] {
    return Array.from(this.defs.values()).filter((d) => d.category === category);
  }

  getTypes(): string[] {
    return Array.from(this.defs.keys());
  }
}

export function createRegistry(): NodeRegistry {
  return new NodeRegistry();
}
