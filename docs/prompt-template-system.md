# Prompt Template System

## Goal

AI Parallel provides a local prompt-template registry for reusable, typed
prompt workflows. A template combines a human-facing category, an input JSON
Schema, a prompt body with `{{fieldName}}` placeholders, and an optional output
JSON Schema.

The system is local-only. Template definitions are stored in
`chrome.storage.local`; provider credentials and collected response snapshots
are not stored. Templates are sent through the existing user-triggered
Provider Adapter flow and do not introduce a new provider or message boundary.

The first implementation wave covers the catalog, typed template form, local
import/export, generation instructions, and on-demand output validation.

## Contract

The portable schemas are:

- `apps/browser-extension/schemas/prompt-template.schema.json`
- `apps/browser-extension/schemas/prompt-template-package.schema.json`

The canonical dialect is JSON Schema Draft 2020-12. The extension supports the
common subset needed for template forms and response validation, including
objects, arrays, strings, numbers, integers, booleans, enums, required fields,
additional properties, local `$ref`, and the basic composition keywords.
External `$ref` URLs are not fetched by the extension.

The distinction between category and schema is intentional:

```text
categoryId     human-facing use-case classification
inputSchema    fields rendered into the template form
promptTemplate prompt content sent to providers
output.schema  structure expected from the provider response
```

## Built-in templates

The first catalog includes:

- English translation
- Code formatting
- HTTP status-code semantics

Built-in templates are shipped in `shared/prompt-template-catalog.js` and are
read-only. Users can copy them into their local library before editing or
exporting them.

## Import and generation flow

The Templates drawer accepts a single template, a template package, or a JSON
code fence copied from another model. Invalid documents are rejected with a
JSON path and validation message; they are not persisted.

The drawer also copies a generation instruction containing the canonical
template Schema. A user can send that instruction to multiple providers,
Compare their responses, and use “尝试导入模板” on a collected response.

For JSON-output templates, the workspace appends a plain-text output contract
to the rendered prompt. Compare then parses the visible response on demand and
validates it against the template output Schema. Raw response text remains
available when parsing or validation fails.

## Storage and compatibility

User templates use the `promptTemplatesV1` storage key and are capped at 100
entries. Existing `promptLibrary` entries remain supported as plain prompts;
they are not silently deleted or converted in this phase.

## Follow-up work

- JSON editor for creating and editing templates without importing JSON
- Revision history, diff, labels, and rollback
- Explicit sample input/output test cases
- Schema-aware repair prompt as a user-triggered action
- Template quality comparison across selected providers
