import type { JsonSchema, JsonValue } from "./json-schema";

export const TEMPLATE_KIND = "ai-parallel.prompt-template" as const;
export const PACKAGE_KIND = "ai-parallel.prompt-template-package" as const;
export const TEMPLATE_SCHEMA_VERSION = 1 as const;

export type TemplateKind = typeof TEMPLATE_KIND;
export type TemplatePackageKind = typeof PACKAGE_KIND;
export type TemplateSchemaVersion = typeof TEMPLATE_SCHEMA_VERSION;

export type TemplateCategoryId =
  | "translation"
  | "code"
  | "http"
  | "extraction"
  | "classification"
  | "summarization"
  | "rewrite"
  | "analysis"
  | "custom"
  | (string & {});

export interface PromptTemplateCategory {
  id: TemplateCategoryId;
  name: string;
  description: string;
}

export interface PromptTemplateInputSchema extends JsonSchema {
  type: "object";
  properties: Record<string, JsonSchema>;
  required?: string[];
}

export interface TextTemplateOutput {
  mode: "text";
  schema?: never;
}

export interface JsonTemplateOutput {
  mode: "json";
  schema: JsonSchema;
}

export type PromptTemplateOutput = TextTemplateOutput | JsonTemplateOutput;

export interface PromptTemplateMetadata {
  source?: string;
  importedAt?: string;
  copiedFrom?: string;
  [key: string]: JsonValue | undefined;
}

export interface PromptTemplate {
  $schema?: string;
  kind: TemplateKind;
  schemaVersion: TemplateSchemaVersion;
  id: string;
  version: number;
  name: string;
  categoryId: TemplateCategoryId;
  description: string;
  tags?: string[];
  promptTemplate: string;
  inputSchema: PromptTemplateInputSchema;
  output: PromptTemplateOutput;
  metadata?: PromptTemplateMetadata;
}

export interface PromptTemplatePackage {
  kind: TemplatePackageKind;
  schemaVersion: TemplateSchemaVersion;
  templates: PromptTemplate[];
}

export interface TemplateValidationError {
  path: string;
  message: string;
}

export interface TemplateValidationResult {
  ok: boolean;
  errors: TemplateValidationError[];
  warnings: TemplateValidationError[];
}
