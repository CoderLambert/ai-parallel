(() => {
  function getResult(responses, providerId) {
    return typeof responses?.get === "function" ? responses.get(providerId) : responses?.[providerId];
  }

  function buildComparisonMarkdown(question, providers, responses) {
    const sections = ["# AI Parallel Context", "", "## Question", "", question || "（未提供）"];
    for (const provider of providers) {
      const result = getResult(responses, provider.id);
      sections.push(
        "",
        `## ${provider.name}`,
        "",
        result?.response?.markdown || result?.response?.content || "（未收集到回答）"
      );
    }
    return `${sections.join("\n")}\n`;
  }

  function buildComparisonJson(question, providers, responses) {
    return JSON.stringify({
      question: question || "",
      responses: providers.map((provider) => {
        const result = getResult(responses, provider.id);
        return result?.response
          ? result.response
          : {
              provider: provider.id,
              content: "",
              markdown: "",
              timestamp: null,
              error: result?.error || "未收集到回答"
            };
      })
    }, null, 2);
  }

  function buildHandoffPrompt(question, providers, responses) {
    return [
      "You are the target agent in an AI Parallel workflow.",
      "Review the question and the collected model responses below. Synthesize a reliable answer, call out disagreements, and improve the result instead of blindly concatenating responses.",
      "",
      buildComparisonMarkdown(question, providers, responses)
    ].join("\n");
  }

  globalThis.AIParallelWorkspaceUtils = Object.freeze({
    buildComparisonMarkdown,
    buildComparisonJson,
    buildHandoffPrompt
  });
})();
