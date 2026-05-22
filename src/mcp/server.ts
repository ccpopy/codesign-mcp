import process from 'node:process';
import { getLogger } from '../logger.js';
import type { ObjectJsonSchema } from './schema.js';
import { validateArgs } from './schema.js';

const LATEST_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  LATEST_PROTOCOL_VERSION,
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
]);

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: TextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface PromptResult {
  messages: Array<{
    role: 'user' | 'assistant';
    content: TextContent;
  }>;
}

export interface ResourceReadResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
  }>;
}

interface ServerInfo {
  name: string;
  version: string;
}

interface ToolConfig {
  title?: string;
  description?: string;
  inputSchema: ObjectJsonSchema;
  annotations?: Record<string, unknown>;
}

interface RegisteredTool<TArgs extends object = Record<string, unknown>> extends ToolConfig {
  handler: (args: TArgs) => ToolResult | Promise<ToolResult>;
}

interface PromptConfig {
  title?: string;
  description?: string;
  argsSchema: ObjectJsonSchema;
}

interface RegisteredPrompt<TArgs extends object = Record<string, unknown>> extends PromptConfig {
  handler: (args: TArgs) => PromptResult | Promise<PromptResult>;
}

interface ResourceConfig {
  title?: string;
  description?: string;
  mimeType?: string;
}

interface RegisteredResource extends ResourceConfig {
  name: string;
  uri: string;
  handler: () => ResourceReadResult | Promise<ResourceReadResult>;
}

export class StdioServerTransport {
  onmessage?: (message: JsonRpcRequest) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  private buffer = '';
  private started = false;

  constructor(
    private readonly stdin: NodeJS.ReadableStream = process.stdin,
    private readonly stdout: NodeJS.WritableStream = process.stdout,
  ) {}

  async start(): Promise<void> {
    if (this.started) throw new Error('StdioServerTransport already started');
    this.started = true;
    this.stdin.on('data', this.onData);
    this.stdin.on('error', this.onError);
  }

  async close(): Promise<void> {
    this.stdin.off('data', this.onData);
    this.stdin.off('error', this.onError);
    this.buffer = '';
    this.onclose?.();
  }

  async send(message: JsonRpcResponse): Promise<void> {
    await new Promise<void>((resolveWrite) => {
      const line = `${JSON.stringify(message)}\n`;
      if (this.stdout.write(line)) {
        resolveWrite();
      } else {
        this.stdout.once('drain', resolveWrite);
      }
    });
  }

  private readonly onData = (chunk: Buffer | string): void => {
    this.buffer += chunk.toString();
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '').trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) this.parseLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  };

  private readonly onError = (error: Error): void => {
    this.onerror?.(error);
  };

  private parseLine(line: string): void {
    try {
      const parsed = JSON.parse(line) as JsonRpcRequest;
      this.onmessage?.(parsed);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.onerror?.(error);
      void this.send({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: `Parse error: ${error.message}` },
      });
    }
  }
}

export class McpServer {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly prompts = new Map<string, RegisteredPrompt>();
  private readonly resources = new Map<string, RegisteredResource>();
  private readonly capabilities: Record<string, unknown>;
  private transport: StdioServerTransport | undefined;
  private readonly log = getLogger();

  constructor(private readonly serverInfo: ServerInfo, options: { capabilities?: Record<string, unknown> } = {}) {
    this.capabilities = options.capabilities ?? {};
  }

  registerTool<TArgs extends object>(
    name: string,
    config: ToolConfig,
    handler: (args: TArgs) => ToolResult | Promise<ToolResult>,
  ): void {
    assertUnique(this.tools, name, 'Tool');
    this.tools.set(name, { ...config, handler: handler as RegisteredTool['handler'] });
  }

  registerPrompt<TArgs extends object>(
    name: string,
    config: PromptConfig,
    handler: (args: TArgs) => PromptResult | Promise<PromptResult>,
  ): void {
    assertUnique(this.prompts, name, 'Prompt');
    this.prompts.set(name, { ...config, handler: handler as RegisteredPrompt['handler'] });
  }

  registerResource(
    name: string,
    uri: string,
    config: ResourceConfig,
    handler: () => ResourceReadResult | Promise<ResourceReadResult>,
  ): void {
    if (this.resources.has(uri)) throw new Error(`Resource ${uri} is already registered`);
    this.resources.set(uri, { name, uri, ...config, handler });
  }

  async connect(transport: StdioServerTransport): Promise<void> {
    this.transport = transport;
    transport.onmessage = (message) => {
      void this.handleMessage(message);
    };
    transport.onerror = (error) => {
      this.log.error({ err: error.message, stack: error.stack }, 'stdio transport error');
    };
    await transport.start();
  }

  async close(): Promise<void> {
    const transport = this.transport;
    this.transport = undefined;
    if (transport) await transport.close();
  }

  private async handleMessage(message: JsonRpcRequest): Promise<void> {
    const id = message.id ?? null;
    const isNotification = message.id === undefined;
    try {
      const result = await this.dispatch(message);
      if (!isNotification) await this.send({ jsonrpc: '2.0', id, result });
    } catch (err) {
      const protocolError = toProtocolError(err);
      if (!isNotification) {
        await this.send({
          jsonrpc: '2.0',
          id,
          error: protocolError,
        });
      } else {
        this.log.warn({ err: protocolError.message, method: message.method }, 'notification failed');
      }
    }
  }

  private async dispatch(message: JsonRpcRequest): Promise<unknown> {
    switch (message.method) {
      case 'initialize':
        return this.handleInitialize(message.params);
      case 'notifications/initialized':
        return {};
      case 'ping':
        return {};
      case 'logging/setLevel':
        return {};
      case 'tools/list':
        return { tools: this.listTools() };
      case 'tools/call':
        return this.callTool(message.params);
      case 'prompts/list':
        return { prompts: this.listPrompts() };
      case 'prompts/get':
        return this.getPrompt(message.params);
      case 'resources/list':
        return { resources: this.listResources() };
      case 'resources/templates/list':
        return { resourceTemplates: [] };
      case 'resources/read':
        return this.readResource(message.params);
      default:
        throw new ProtocolError(-32601, `Method not found: ${message.method}`);
    }
  }

  private handleInitialize(params: unknown): Record<string, unknown> {
    const input = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
    const requested = typeof input.protocolVersion === 'string' ? input.protocolVersion : undefined;
    return {
      protocolVersion: requested && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
        ? requested
        : LATEST_PROTOCOL_VERSION,
      capabilities: this.getCapabilities(),
      serverInfo: this.serverInfo,
    };
  }

  private getCapabilities(): Record<string, unknown> {
    return {
      ...this.capabilities,
      tools: { listChanged: true },
      prompts: { listChanged: true },
      resources: { listChanged: true },
      logging: this.capabilities.logging ?? {},
    };
  }

  private listTools(): Array<Record<string, unknown>> {
    return Array.from(this.tools.entries()).map(([name, tool]) => ({
      name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    }));
  }

  private async callTool(params: unknown): Promise<ToolResult> {
    const input = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
    const name = input.name;
    if (typeof name !== 'string') {
      throw new ProtocolError(-32602, 'tools/call params.name must be a string');
    }
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ProtocolError(-32602, `Tool ${name} not found`);
    }
    try {
      const args = validateArgs(tool.inputSchema, input.arguments, `tools.${name}`);
      return await tool.handler(args);
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err));
    }
  }

  private listPrompts(): Array<Record<string, unknown>> {
    return Array.from(this.prompts.entries()).map(([name, prompt]) => ({
      name,
      title: prompt.title,
      description: prompt.description,
      arguments: promptArgumentsFromSchema(prompt.argsSchema),
    }));
  }

  private async getPrompt(params: unknown): Promise<PromptResult> {
    const input = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
    const name = input.name;
    if (typeof name !== 'string') {
      throw new ProtocolError(-32602, 'prompts/get params.name must be a string');
    }
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw new ProtocolError(-32602, `Prompt ${name} not found`);
    }
    let args: Record<string, unknown>;
    try {
      args = validateArgs(prompt.argsSchema, input.arguments, `prompts.${name}`);
    } catch (err) {
      throw new ProtocolError(-32602, err instanceof Error ? err.message : String(err));
    }
    return prompt.handler(args);
  }

  private listResources(): Array<Record<string, unknown>> {
    return Array.from(this.resources.values()).map((resource) => ({
      name: resource.name,
      uri: resource.uri,
      title: resource.title,
      description: resource.description,
      mimeType: resource.mimeType,
    }));
  }

  private async readResource(params: unknown): Promise<ResourceReadResult> {
    const input = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
    const uri = input.uri;
    if (typeof uri !== 'string') {
      throw new ProtocolError(-32602, 'resources/read params.uri must be a string');
    }
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new ProtocolError(-32602, `Resource ${uri} not found`);
    }
    return resource.handler();
  }

  private async send(message: JsonRpcResponse): Promise<void> {
    const transport = this.transport;
    if (!transport) throw new Error('MCP server is not connected');
    await transport.send(message);
  }
}

function assertUnique(map: Map<string, unknown>, name: string, kind: string): void {
  if (map.has(name)) throw new Error(`${kind} ${name} is already registered`);
}

function promptArgumentsFromSchema(schema: ObjectJsonSchema): Array<{
  name: string;
  description?: string;
  required: boolean;
}> {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, field]) => ({
    name,
    description: field.description,
    required: required.has(name),
  }));
}

function toolError(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

class ProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}

function toProtocolError(err: unknown): NonNullable<JsonRpcResponse['error']> {
  if (err instanceof ProtocolError) {
    const out: NonNullable<JsonRpcResponse['error']> = {
      code: err.code,
      message: err.message,
    };
    if (err.data !== undefined) out.data = err.data;
    return out;
  }
  return {
    code: -32603,
    message: err instanceof Error ? err.message : String(err),
  };
}

export type { JsonSchema } from './schema.js';
