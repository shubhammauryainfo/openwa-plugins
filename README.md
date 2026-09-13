# Assistant Message for OpenWA

This OpenWA extension sends inbound text to Google Gemini and sends Gemini's answer back to WhatsApp.

## Default behavior

- Trigger: empty, so every direct text message is sent to Gemini
- Model: `gemini-2.5-flash`
- Group chats: disabled
- Own messages: ignored

The assistant uses hook priority `10`, so it runs before menu and auto-reply plugins such as `chat-flow`. Disable those plugins if you want them to handle messages instead.

Leave `trigger` empty to send every direct text message to Gemini. Set it to `assistant` if you want command-style activation. The plugin reads `ctx.config` for each event, so per-session configuration overrides work. Create a Gemini API key at [Google AI Studio](https://aistudio.google.com/apikey) and enter it in the plugin configuration; it is stored as a secret.

## Package

The folder already contains the required `dist/index.js`. Zip these items at the root of the archive:

```text
manifest.json
dist/index.js
dist/package.json
```

Install the resulting zip through the OpenWA dashboard or API, configure it, then explicitly enable it. The plugin needs an ADMIN API key for the management calls and `messages:send` permission at runtime.

## API example

```powershell
curl.exe -X POST "http://localhost:2785/api/plugins/install" -H "X-API-Key: YOUR_API_KEY" -F "file=@assistant-message.zip"
curl.exe -X PUT "http://localhost:2785/api/plugins/assistant-message/config" -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -d '{"config":{"apiKey":"YOUR_GEMINI_API_KEY","trigger":"","model":"gemini-2.5-flash","systemPrompt":"You are a helpful WhatsApp assistant. Reply concisely.","respondInGroups":false}}'
curl.exe -X POST "http://localhost:2785/api/plugins/assistant-message/enable" -H "X-API-Key: YOUR_API_KEY"
```