export function createResponseBundle(prompt, responses = []) {
  return {
    version: '1',
    createdAt: Date.now(),
    prompt,
    responses: responses.filter(Boolean).map((item) => ({
      provider: item.provider,
      text: item.text || item,
      markdown: item.markdown || item.text || item,
      timestamp: item.timestamp || Date.now()
    }))
  };
}

export function toMarkdown(bundle) {
  const sections = bundle.responses.map((response) => (
    `## ${response.provider}\n\n${response.markdown}`
  ));

  return [
    '# AI Parallel Context',
    '',
    '## Question',
    '',
    bundle.prompt,
    '',
    ...sections
  ].join('\n');
}
