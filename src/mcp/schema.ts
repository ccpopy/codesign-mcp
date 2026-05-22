export type JsonSchemaType = 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';

export interface JsonSchema {
  type?: JsonSchemaType;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minLength?: number;
  minimum?: number;
  maximum?: number;
}

export type ObjectJsonSchema = JsonSchema & {
  type: 'object';
  properties: Record<string, JsonSchema>;
};

export function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): ObjectJsonSchema {
  const schema: ObjectJsonSchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) schema.required = required;
  return schema;
}

export function validateArgs<T extends Record<string, unknown>>(
  schema: ObjectJsonSchema,
  args: unknown,
  label: string,
): T {
  return validateValue(schema, args ?? {}, label) as T;
}

function validateValue(schema: JsonSchema, value: unknown, path: string): unknown {
  if (schema.anyOf) {
    const errors: string[] = [];
    for (const option of schema.anyOf) {
      try {
        return validateValue(option, value, path);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    throw new Error(`${path} does not match any allowed type: ${errors.join('; ')}`);
  }

  if ('const' in schema && value !== schema.const) {
    throw new Error(`${path} must be ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw new Error(`${path} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  }

  switch (schema.type) {
    case 'object':
      return validateObject(schema, value, path);
    case 'string':
      return validateString(schema, value, path);
    case 'number':
      return validateNumber(schema, value, path, false);
    case 'integer':
      return validateNumber(schema, value, path, true);
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
      return value;
    case 'array':
      return validateArray(schema, value, path);
    default:
      return value;
  }
}

function validateObject(schema: JsonSchema, value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const input = value as Record<string, unknown>;
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const output: Record<string, unknown> = {};

  for (const name of required) {
    if (!(name in input) || input[name] === undefined) {
      throw new Error(`${path}.${name} is required`);
    }
  }

  if (schema.additionalProperties === false) {
    for (const name of Object.keys(input)) {
      if (!(name in properties)) {
        throw new Error(`${path}.${name} is not a supported argument`);
      }
    }
  }

  for (const [name, propertySchema] of Object.entries(properties)) {
    const childPath = `${path}.${name}`;
    const raw = input[name];
    if (raw === undefined) {
      if ('default' in propertySchema) {
        output[name] = cloneDefault(propertySchema.default);
      }
      continue;
    }
    output[name] = validateValue(propertySchema, raw, childPath);
  }

  return output;
}

function validateString(schema: JsonSchema, value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  if (schema.minLength != null && value.length < schema.minLength) {
    throw new Error(`${path} must contain at least ${schema.minLength} character(s)`);
  }
  return value;
}

function validateNumber(schema: JsonSchema, value: unknown, path: string, integer: boolean): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a ${integer ? 'integer' : 'number'}`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${path} must be an integer`);
  }
  if (schema.minimum != null && value < schema.minimum) {
    throw new Error(`${path} must be >= ${schema.minimum}`);
  }
  if (schema.maximum != null && value > schema.maximum) {
    throw new Error(`${path} must be <= ${schema.maximum}`);
  }
  return value;
}

function validateArray(schema: JsonSchema, value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const itemSchema = schema.items;
  if (!itemSchema) return value;
  return value.map((item, index) => validateValue(itemSchema, item, `${path}[${index}]`));
}

function cloneDefault(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return { ...(value as Record<string, unknown>) };
  return value;
}
