const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';
const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const XAI_DEFAULT_MODEL = 'grok-3-latest';
const XAI_DEFAULT_BASE_URL = 'https://api.x.ai/v1';

function extractErrorMessage(errorText, fallback) {
  try {
    const parsed = JSON.parse(errorText);
    return parsed?.error?.message || parsed?.message || fallback;
  } catch {
    return errorText || fallback;
  }
}

function buildGeminiUrl(baseUrl, model, apiKey) {
  const normalizedBaseUrl = String(baseUrl || GEMINI_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const normalizedModel = String(model || GEMINI_DEFAULT_MODEL)
    .trim()
    .replace(/^models\//, '');

  return `${normalizedBaseUrl}/models/${normalizedModel}:generateContent?key=${apiKey}`;
}

function buildXaiUrl(baseUrl) {
  return `${String(baseUrl || XAI_DEFAULT_BASE_URL).replace(/\/+$/, '')}/chat/completions`;
}

function resolveProviderConfig(options = {}) {
  const xaiApiKey = options.xaiApiKey ?? import.meta.env.VITE_XAI_API_KEY;
  if (xaiApiKey) {
    return {
      provider: 'xai',
      apiKey: xaiApiKey,
      model: (options.xaiModel ?? import.meta.env.VITE_XAI_MODEL ?? XAI_DEFAULT_MODEL).trim(),
      baseUrl: options.xaiBaseUrl ?? import.meta.env.VITE_XAI_BASE_URL ?? XAI_DEFAULT_BASE_URL,
    };
  }

  const geminiApiKey = options.geminiApiKey ?? options.apiKey ?? import.meta.env.VITE_GEMINI_API_KEY;
  return {
    provider: 'gemini',
    apiKey: geminiApiKey,
    model: (options.geminiModel ?? options.model ?? import.meta.env.VITE_GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL).trim(),
    baseUrl: options.geminiBaseUrl ?? options.baseUrl ?? import.meta.env.VITE_GEMINI_BASE_URL ?? GEMINI_DEFAULT_BASE_URL,
  };
}

export function createAIClient(options = {}) {
  const config = resolveProviderConfig(options);
  const hasApiKey = Boolean(config.apiKey);

  async function sendRequest(prompt, history = [], systemPrompt = 'You are GestureOS Assistant. Keep answers concise.') {
    if (window.electronAPI?.assistantRequest) {
      return window.electronAPI.assistantRequest({
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        prompt,
        history,
        systemPrompt
      });
    }

    if (config.provider === 'xai') {
      const response = await fetch(buildXaiUrl(config.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.map(item => ({
              role: item.role === 'assistant' ? 'assistant' : 'user',
              content: item.content
            })),
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const errorMessage = extractErrorMessage(errorBody, 'Unknown xAI error.');
        throw new Error(`xAI request failed (${response.status}): ${errorMessage}`);
      }

      const data = await response.json();
      return data?.choices?.[0]?.message?.content || 'No response from xAI.';
    }

    const response = await fetch(buildGeminiUrl(config.baseUrl, config.model, config.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          ...history.map(item => ({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }]
          })),
          { role: 'user', parts: [{ text: prompt }] }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 404) {
        throw new Error(`Gemini model "${config.model}" was not found. Set VITE_GEMINI_MODEL to a supported model such as "${GEMINI_DEFAULT_MODEL}".`);
      }
      throw new Error(`Gemini request failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
  }

  async function askAssistant({
    message,
    history = [],
    systemPrompt = 'You are GestureOS Assistant. Keep answers concise.'
  }) {
    if (!message || !message.trim()) return 'Please ask a question.';
    if (!hasApiKey) {
      return config.provider === 'xai'
        ? 'xAI API key is missing. Set VITE_XAI_API_KEY.'
        : 'Gemini API key is missing. Set VITE_GEMINI_API_KEY.';
    }

    try {
      const prompt = message.trim();
      return await sendRequest(prompt, history, systemPrompt);
    } catch (error) {
      console.error('AI Error:', error);
      if (error.message.includes('429')) {
        if (config.provider === 'gemini') {
          return 'Gemini quota exceeded (429). Check billing or switch to xAI.';
        }
        return 'xAI rate limit or credit limit reached (429). Check your xAI billing.';
      }
      if (error.message.includes('403')) {
        return error.message;
      }
      return `Error: ${error.message}`;
    }
  }

  return {
    hasApiKey,
    provider: config.provider,
    askAssistant
  };
}
