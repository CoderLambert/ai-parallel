export function normalizeResponseText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toMarkdown(element) {
  if (!element) return "";

  const clone = element.cloneNode(true);
  clone.querySelectorAll?.("button, svg, [aria-hidden='true']")?.forEach((node) => node.remove());

  return String(clone.innerText || clone.textContent || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function pickLatest(nodes) {
  if (!nodes || !nodes.length) return null;
  return nodes[nodes.length - 1] || null;
}
