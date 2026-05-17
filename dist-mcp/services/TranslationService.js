"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateSegments = void 0;
const ConfigService_1 = require("./ConfigService");
const utils_1 = require("../lib/utils");
const BATCH_SEPARATOR = "\n---\n";
const buildSystemPrompt = (targetLang, promptId) => {
    const langName = utils_1.TARGET_LANGUAGES.find((lang) => lang.code === targetLang)?.name || targetLang;
    const prompts = (0, ConfigService_1.getPrompts)();
    const selectedPromptId = promptId || (0, ConfigService_1.getActivePromptId)();
    const promptConfig = prompts.find((prompt) => prompt.id === selectedPromptId) || prompts[0];
    return `Translate subtitle segments to ${langName}.

FORMAT RULES:
- Each segment is separated by "---"
- Return ONLY the translated segments separated by "---", nothing else
- Preserve the same number of segments
- Do NOT add any extra text, explanation, or numbering

${promptConfig?.systemPrompt || ""}`.trim();
};
const translateSegments = async (options) => {
    const apiKey = (0, ConfigService_1.getApiKey)("deepseek");
    if (!apiKey)
        throw new Error("Thiếu DeepSeek API key trong config");
    if (!Array.isArray(options.texts) || options.texts.length === 0)
        return [];
    const systemPrompt = buildSystemPrompt(options.targetLang, options.promptId);
    const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: options.texts.join(BATCH_SEPARATOR) },
            ],
            temperature: 0.3,
        }),
    });
    if (!response.ok) {
        throw new Error(await response.text());
    }
    const data = await response.json();
    const translatedParts = (data.choices?.[0]?.message?.content || "").split(/\n?---\n?/);
    return options.texts.map((text, index) => translatedParts[index]?.trim() || text);
};
exports.translateSegments = translateSegments;
//# sourceMappingURL=TranslationService.js.map