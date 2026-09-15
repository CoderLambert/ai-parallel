import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import type { JsonSchema } from "../../contracts/json-schema";
import type { PromptTemplate, PromptTemplateCategory } from "../../contracts/template";
import "../../shared/contract-runtime.js";
import "../../shared/prompt-template-catalog.js";
import "../../shared/prompt-template-utils.js";
import "../../shared/storage-contract.js";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardContent, CardHeader } from "../components/card";
import { Input } from "../components/input";
import { Textarea } from "../components/textarea";
import "../theme.css";
import "./templates.css";

const catalog = globalThis.AIParallelPromptTemplateCatalog;
const utils = globalThis.AIParallelPromptTemplateUtils;
const contractRuntime = globalThis.AIParallelContractRuntime;
const storage = globalThis.AIParallelStorageContract.createLocalStorage();
type FieldValues = Record<string, unknown>;

function schemaType(schema: JsonSchema) {
  return Array.isArray(schema.type) ? schema.type[0] : schema.type;
}

function initialValues(template: PromptTemplate): FieldValues {
  return Object.fromEntries(Object.entries(template.inputSchema.properties || {}).map(([name, schema]) => {
    if (schema.default !== undefined) return [name, utils.clone(schema.default)];
    if (schemaType(schema) === "boolean") return [name, false];
    if (schemaType(schema) === "array") return [name, []];
    return [name, ""];
  }));
}

function normalizeUserTemplates(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    try {
      const template = utils.normalizeTemplate(entry, { source: "user" });
      return utils.validateTemplateDefinition(template).ok ? template : null;
    } catch {
      return null;
    }
  }).filter((template): template is PromptTemplate => Boolean(template));
}

function categoryName(categoryId: string, categories: readonly PromptTemplateCategory[]) {
  return categories.find((category) => category.id === categoryId)?.name || categoryId;
}

function newTemplateId(prefix = "custom.template") {
  const suffix = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID().replace(/[^a-z0-9-]/gi, "")
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}.${suffix}`.slice(0, 96);
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fieldValue(schema: JsonSchema, raw: string, checked?: boolean): unknown {
  const type = schemaType(schema);
  if (type === "boolean") return Boolean(checked);
  if (type === "integer") return raw === "" ? "" : Number.parseInt(raw, 10);
  if (type === "number") return raw === "" ? "" : Number(raw);
  return raw;
}

function TemplateForm({
  template,
  values,
  onChange,
  onClose,
  onApply
}: {
  template: PromptTemplate;
  values: FieldValues;
  onChange: (name: string, value: unknown) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const preview = utils.renderPromptTemplate(template, values);
  const properties = Object.entries(template.inputSchema.properties || {});
  const required = new Set(template.inputSchema.required || []);

  return (
    <div className="template-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-form-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="template-modal-header">
          <div>
            <div className="template-eyebrow">USE TEMPLATE</div>
            <h2 id="template-form-title">{template.name}</h2>
            <p>{template.description}</p>
          </div>
          <Button variant="ghost" size="sm" autoFocus onClick={onClose} aria-label="关闭模板表单">关闭</Button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onApply(); }}>
          <div className="template-form-fields">
            {properties.map(([name, schema]) => {
              const type = schemaType(schema);
              const value = values[name];
              const label = schema.title || name;
              if (type === "boolean") {
                return (
                  <label className="template-checkbox" key={name}>
                    <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(name, fieldValue(schema, "", event.target.checked))} />
                    <span>{label}{required.has(name) ? " *" : ""}</span>
                  </label>
                );
              }
              const isLong = type === "string" && (name.toLowerCase().includes("text") || name.toLowerCase().includes("code") || name.toLowerCase().includes("context") || (schema.maxLength || 0) > 240);
              const control = schema.enum?.length ? (
                <select value={String(value ?? "")} required={required.has(name)} onChange={(event) => onChange(name, fieldValue(schema, event.target.value))}>
                  <option value="">请选择…</option>
                  {schema.enum.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
                </select>
              ) : isLong ? (
                <Textarea value={String(value ?? "")} required={required.has(name)} placeholder={schema.description || label} onChange={(event) => onChange(name, fieldValue(schema, event.target.value))} />
              ) : (
                <Input
                  type={type === "integer" || type === "number" ? "number" : "text"}
                  min={schema.minimum}
                  max={schema.maximum}
                  step={type === "integer" ? 1 : "any"}
                  value={String(value ?? "")}
                  required={required.has(name)}
                  placeholder={schema.description || label}
                  onChange={(event) => onChange(name, fieldValue(schema, event.target.value))}
                />
              );
              return <label className="template-field" key={name}><span>{label}{required.has(name) ? " *" : ""}</span>{control}</label>;
            })}
          </div>
          <details className="schema-details">
            <summary>查看输出 Schema</summary>
            <pre>{template.output.mode === "json" ? JSON.stringify(template.output.schema, null, 2) : "文本输出，不附加 JSON Schema"}</pre>
          </details>
          <div className="template-preview">
            <div className="template-preview-title">Prompt 预览</div>
            <pre>{preview.ok ? preview.prompt : preview.errors.map((error) => `${error.path}: ${error.message}`).join("\n")}</pre>
          </div>
          <div className="template-modal-actions">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">写入 Workspace</Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TemplateLibraryApp() {
  const [userTemplates, setUserTemplates] = useState<PromptTemplate[]>([]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<PromptTemplate | null>(null);
  const [templateValues, setTemplateValues] = useState<FieldValues>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [status, setStatus] = useState("模板、输入 Schema 和输出 Schema 均保存在当前浏览器扩展中");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const categories = useMemo(() => {
    const known = new Set(catalog.categories.map((item) => item.id));
    const customCategories = userTemplates
      .filter((template) => !known.has(template.categoryId))
      .map((template) => ({ id: template.categoryId, name: template.categoryId, description: "自定义分类" }));
    return [...catalog.categories, ...customCategories];
  }, [userTemplates]);
  const templates = useMemo(() => [...catalog.templates, ...userTemplates], [userTemplates]);
  const filteredTemplates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return templates.filter((template) => {
      if (category !== "all" && template.categoryId !== category) return false;
      if (!normalized) return true;
      return [template.name, template.description, template.categoryId, ...(template.tags || [])]
        .join(" ").toLocaleLowerCase().includes(normalized);
    });
  }, [category, query, templates]);

  useEffect(() => {
    let active = true;
    storage.get(["promptTemplatesV1"]).then((data) => {
      if (active) setUserTemplates(normalizeUserTemplates(data.promptTemplatesV1));
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function persist(next: PromptTemplate[]) {
    setUserTemplates(next);
    await storage.set({ promptTemplatesV1: next });
  }

  async function importText(text: string) {
    const result = utils.parseTemplateImport(text, { source: "file" });
    if (!result.ok) {
      setError(`导入失败：${result.errors.map((item) => `${item.path} ${item.message}`).join("；")}`);
      return;
    }
    const imported = result.templates.map((template) => {
      const copy = utils.clone(template);
      copy.id = templates.some((item) => item.id === copy.id) ? newTemplateId("custom.imported") : copy.id;
      copy.metadata = { ...(copy.metadata || {}), source: "user", importedAt: new Date().toISOString() };
      return copy;
    });
    await persist([...imported, ...userTemplates]);
    setError("");
    setStatus(`已导入 ${imported.length} 个模板${result.warnings.length ? " · 有可选警告" : ""}`);
  }

  function openUseForm(template: PromptTemplate) {
    setActiveTemplate(template);
    setTemplateValues(initialValues(template));
    setError("");
  }

  async function applyTemplate() {
    if (!activeTemplate) return;
    const result = utils.renderPromptTemplate(activeTemplate, templateValues);
    if (!result.ok) {
      setError(result.errors.map((item) => `${item.path} ${item.message}`).join("；"));
      return;
    }
    try {
      await storage.set({ draftPrompt: result.prompt });
      const request = { type: "OPEN_WORKSPACE" } as const;
      if (!contractRuntime.isServiceWorkerRequest(request)) throw new Error("Invalid workspace request");
      const response = await browser.runtime.sendMessage(request) as { ok?: boolean; error?: string };
      if (!contractRuntime.isServiceWorkerResponse(response) || !response.ok) throw new Error(response?.error || "Workspace 打开失败");
      setStatus(`${activeTemplate.name} 已写入 Workspace`);
      setActiveTemplate(null);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function deleteTemplate(template: PromptTemplate) {
    if (template.metadata?.source !== "user") return;
    await persist(userTemplates.filter((entry) => entry.id !== template.id));
    setStatus(`${template.name} 已删除`);
  }

  async function duplicateTemplate(template: PromptTemplate) {
    const copy = utils.clone(template);
    copy.id = newTemplateId("custom.copy");
    copy.name = `${template.name} 副本`;
    copy.metadata = { ...(copy.metadata || {}), source: "user", copiedFrom: template.id };
    await persist([copy, ...userTemplates]);
    setStatus(`${copy.name} 已创建`);
  }

  function openEditor(template: PromptTemplate) {
    setEditingId(template.id);
    setEditorText(JSON.stringify(template, null, 2));
    setError("");
  }

  async function saveEditor() {
    if (!editingId) return;
    const result = utils.parseTemplateImport(editorText, { source: "user" });
    if (!result.ok || !result.templates[0]) {
      setError(`保存失败：${result.errors.map((item) => `${item.path} ${item.message}`).join("；")}`);
      return;
    }
    const updated = utils.clone(result.templates[0]);
    updated.id = editingId;
    updated.metadata = { ...(updated.metadata || {}), source: "user" };
    await persist(userTemplates.map((template) => template.id === editingId ? updated : template));
    setEditingId(null);
    setStatus(`${updated.name} 已更新`);
    setError("");
  }

  return (
    <main className="templates-app">
      <header className="templates-header">
        <div>
          <div className="template-eyebrow">AI PARALLEL / PROMPT TEMPLATES</div>
          <h1>Prompt Template Library</h1>
          <p>通过 JSON Schema 约束输入和输出，让其他模型生成的模板可以安全导入、复用和导出。</p>
        </div>
        <Button variant="ghost" onClick={() => window.close()}>关闭</Button>
      </header>

      <Card className="library-toolbar">
        <CardContent className="toolbar-content">
          <select value={category} aria-label="模板分类" onChange={(event) => setCategory(event.target.value)}>
            <option value="all">全部分类</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <Input type="search" value={query} maxLength={80} placeholder="搜索模板、描述或标签" aria-label="搜索模板" onChange={(event) => setQuery(event.target.value)} />
          <input id="template-import" className="visually-hidden" type="file" accept="application/json,.json" onChange={async (event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            try { await importText(await file.text()); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
          }} />
          <Button variant="outline" onClick={() => document.getElementById("template-import")?.click()}>导入 JSON</Button>
          <Button variant="outline" onClick={() => downloadJson(utils.toPackage(templates), `ai-parallel-prompt-templates-${new Date().toISOString().slice(0, 10)}.json`)}>导出全部</Button>
        </CardContent>
      </Card>

      <div className="library-status" role="status">{loading ? "正在读取模板…" : status}</div>
      {error && <div className="template-error" role="alert">{error}</div>}

      {filteredTemplates.length === 0 ? (
        <Card className="empty-card"><CardContent>没有匹配的模板；可以导入其他模型生成的 JSON。</CardContent></Card>
      ) : (
        <section className="template-grid" aria-label="模板列表">
          {filteredTemplates.map((template) => {
            const userOwned = template.metadata?.source === "user";
            return (
              <Card key={template.id} className="template-card">
                <CardHeader className="template-card-header">
                  <div>
                    <h2>{template.name}</h2>
                    <div className="template-card-meta">{categoryName(template.categoryId, categories)} · {template.output.mode === "json" ? "JSON 输出" : "文本输出"} · v{template.version}</div>
                  </div>
                  <Badge>{userOwned ? "自定义" : "内置"}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="template-description">{template.description}</p>
                  <div className="template-tags">{(template.tags || []).slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}</div>
                  <div className="template-card-actions">
                    <Button size="sm" onClick={() => openUseForm(template)}>使用</Button>
                    <Button size="sm" variant="outline" onClick={() => void duplicateTemplate(template)}>复制</Button>
                    {userOwned && <Button size="sm" variant="outline" onClick={() => openEditor(template)}>编辑</Button>}
                    <Button size="sm" variant="ghost" onClick={() => downloadJson(template, `${template.id}.json`)}>导出</Button>
                    {userOwned && <Button size="sm" variant="danger" onClick={() => void deleteTemplate(template)}>删除</Button>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {activeTemplate && <TemplateForm
        template={activeTemplate}
        values={templateValues}
        onChange={(name, value) => setTemplateValues((current) => ({ ...current, [name]: value }))}
        onClose={() => setActiveTemplate(null)}
        onApply={() => void applyTemplate()}
      />}

      {editingId && <div className="template-modal-backdrop" role="presentation" onMouseDown={() => setEditingId(null)}>
        <section className="template-modal editor-modal" role="dialog" aria-modal="true" aria-labelledby="template-editor-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="template-modal-header"><div><div className="template-eyebrow">EDIT JSON</div><h2 id="template-editor-title">编辑模板定义</h2><p>保存前会重新执行模板 Schema 校验。</p></div><Button variant="ghost" size="sm" autoFocus onClick={() => setEditingId(null)}>关闭</Button></div>
          <Textarea className="json-editor" value={editorText} onChange={(event) => setEditorText(event.target.value)} spellCheck={false} />
          <div className="template-modal-actions"><Button variant="outline" onClick={() => setEditingId(null)}>取消</Button><Button onClick={() => void saveEditor()}>校验并保存</Button></div>
        </section>
      </div>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<TemplateLibraryApp />);
