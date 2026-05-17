import { getActivePromptId, getApiKey, getPrompts } from "./ConfigService";
import { TARGET_LANGUAGES } from "../lib/utils";

export interface TranslateSegmentsOptions {
    targetLang: string;
    texts: string[];
    promptId?: string;
}

const BATCH_SEPARATOR = "\n---\n";

const buildSystemPrompt = (targetLang: string, promptId?: string): string => {
    const langName = TARGET_LANGUAGES.find((lang) => lang.code === targetLang)?.name || targetLang;
    const prompts = getPrompts();
    const selectedPromptId = promptId || getActivePromptId();
    const promptConfig = prompts.find((prompt) => prompt.id === selectedPromptId) || prompts[0];

    return `Translate subtitle segments to ${langName}.

FORMAT RULES:
- Each segment is separated by "---"
- Return ONLY the translated segments separated by "---", nothing else
- Preserve the same number of segments
- Do NOT add any extra text, explanation, or numbering

${promptConfig?.systemPrompt || ""}`.trim();
};

export const translateSegments = async (options: TranslateSegmentsOptions): Promise<string[]> => {
    const apiKey = getApiKey("deepseek");
    if (!apiKey) throw new Error("Thiếu DeepSeek API key trong config");
    if (!Array.isArray(options.texts) || options.texts.length === 0) return [];

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

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const translatedParts = (data.choices?.[0]?.message?.content || "").split(/\n?---\n?/);
    return options.texts.map((text, index) => translatedParts[index]?.trim() || text);
};
