type PluginContext = {
    config: Record<string, unknown>;
    registerHook: (event: string, handler: (hook: HookContext) => Promise<HookResult>, priority?: number) => void;
    logger: { warn: (message: string) => void; error: (message: string, error?: unknown) => void };
    messages: { sendText: (sessionId: string, chatId: string, text: string) => Promise<unknown> };
    net: { fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }> };
};

type HookContext = {
    sessionId?: string;
    source?: string;
    data?: Record<string, unknown>;
};

type HookResult = { continue: boolean };

type AssistantConfig = {
    trigger: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
    respondInGroups: boolean;
};

function parseConfig(raw: Record<string, unknown>): AssistantConfig {
    const apiKey = String(raw.apiKey ?? '').trim();
    if (!apiKey) {
        throw new Error('assistant-message: apiKey is required');
    }

    return {
        trigger: String(raw.trigger ?? '').trim().toLocaleLowerCase(),
        apiKey,
        model: String(raw.model ?? 'gemini-2.5-flash').trim(),
        systemPrompt: String(raw.systemPrompt ?? 'You are a helpful, concise WhatsApp assistant. Reply in the same language as the user.').trim(),
        respondInGroups: raw.respondInGroups === true,
    };
}

function isTriggered(body: string, trigger: string): boolean {
    if (!trigger) return true;
    return body.trim().toLocaleLowerCase().startsWith(trigger);
}

function removeTrigger(body: string, trigger: string): string {
    const text = body.trim();
    return trigger ? text.slice(trigger.length).trim() || text : text;
}

async function askGemini(ctx: PluginContext, config: AssistantConfig, prompt: string): Promise<string> {
    const response = await ctx.net.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
        {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-goog-api-key': config.apiKey,
            },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: config.systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
            }),
        },
    );

    const responseText = await response.text();
    if (!response.ok) throw new Error(`Gemini API returned ${response.status}: ${responseText.slice(0, 300)}`);

    const payload = JSON.parse(responseText) as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> };
    const answer = payload.candidates?.[0]?.content?.parts?.map((part) => typeof part.text === 'string' ? part.text : '').join('').trim();
    if (!answer) throw new Error('Gemini API returned no text');
    return answer;
}

export default class AssistantMessage {
    async onEnable(ctx: PluginContext): Promise<void> {
        parseConfig(ctx.config);
        ctx.registerHook('message:received', async (hook) => ({
            continue: !(await this.handleMessage(ctx, hook)),
        }), 10);
    }

    async onConfigChange(ctx: PluginContext): Promise<void> {
        parseConfig(ctx.config);
    }

    private async handleMessage(ctx: PluginContext, hook: HookContext): Promise<boolean> {
        if (hook.source !== 'Engine' || !hook.sessionId) return false;

        const message = (hook.data ?? {}) as {
            body?: unknown;
            fromMe?: boolean;
            isGroup?: boolean;
            chatId?: unknown;
        };
        if (message.fromMe || typeof message.body !== 'string' || !message.body.trim()) return false;

        let config: AssistantConfig;
        try {
            config = parseConfig(ctx.config);
        } catch (error) {
            ctx.logger.warn(`assistant-message: invalid config: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }

        if (message.isGroup && !config.respondInGroups) return false;
        if (typeof message.chatId !== 'string' || !isTriggered(message.body, config.trigger)) return false;

        try {
            const answer = await askGemini(ctx, config, removeTrigger(message.body, config.trigger));
            await ctx.messages.sendText(hook.sessionId, message.chatId, answer);
            return true;
        } catch (error) {
            ctx.logger.error('assistant-message: send failed', error);
            return false;
        }
    }
}

export { isTriggered, parseConfig };