import { error, type Diagnostic } from "@visulith/engine";

export interface CommandDefinition<Input, Output> {
  id: string;
  /** Side-effecting commands must declare the permission they require. */
  permission?: string;
  handler: (input: Input) => Promise<Output> | Output;
}

export interface CommandResult<Output> {
  correlationId: string;
  output?: Output;
  diagnostics: Diagnostic[];
}

/** Typed, correlation-tracked command routing with structured failures. */
export class CommandBus {
  private readonly commands = new Map<string, CommandDefinition<unknown, unknown>>();
  private counter = 0;

  register<Input, Output>(definition: CommandDefinition<Input, Output>): void {
    this.commands.set(definition.id, definition as CommandDefinition<unknown, unknown>);
  }

  async execute<Input, Output>(id: string, input: Input, correlationId?: string): Promise<CommandResult<Output>> {
    const command = this.commands.get(id);
    const currentCorrelationId = correlationId ?? `cmd-${++this.counter}`;
    if (command === undefined) {
      return {
        correlationId: currentCorrelationId,
        diagnostics: [error("COMMAND_UNKNOWN", `Unknown command "${id}".`)],
      };
    }
    try {
      const output = await command.handler(input);
      return { correlationId: currentCorrelationId, output: output as Output, diagnostics: [] };
    } catch (cause) {
      return {
        correlationId: currentCorrelationId,
        diagnostics: [
          error("COMMAND_FAILED", `Command "${id}" failed: ${cause instanceof Error ? cause.message : String(cause)}`),
        ],
      };
    }
  }
}
