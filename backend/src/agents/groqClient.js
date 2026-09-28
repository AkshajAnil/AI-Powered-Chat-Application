const DEFAULT_TIMEOUT_MS = 25000;
const MAX_REPLY_CHARS = 1500;
const DEFAULT_MAX_TOKENS = 2048;
const EMPTY_REPLY_RETRIES = 1;

class GroqError extends Error {
  constructor(message, code = 'GROQ_ERROR', status = 0) {
    super(message);
    this.name = 'GroqError';
    this.code = code;
    this.status = status;
  }
}

const createGroqClient = ({ apiKey, model, temperature = 0.7, logger, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  const isConfigured = () => Boolean(apiKey);

  const chat = async ({ system, messages = [], temperature: override }) => {
    if (!isConfigured()) {
      throw new GroqError('GROQ_API_KEY is not configured on the server.', 'GROQ_NOT_CONFIGURED');
    }

    const baseMessages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map(({ role, content }) => ({ role, content })),
    ];

    // Reasoning models can burn the whole token budget on internal reasoning and
    // return an empty answer; retry once with a nudge to answer directly.
    let lastError = null;
    for (let attempt = 0; attempt <= EMPTY_REPLY_RETRIES; attempt += 1) {
      const payloadMessages =
        attempt === 0
          ? baseMessages
          : [
              ...baseMessages.slice(0, 1),
              {
                role: 'system',
                content: 'Answer directly in plain text. Do not use reasoning blocks.',
              },
              ...baseMessages.slice(1),
            ];

      try {
        return await request({ payloadMessages, temperature: override });
      } catch (err) {
        if (err.code !== 'GROQ_EMPTY') throw err;
        lastError = err;
      }
    }
    throw lastError;
  };

  const request = async ({ payloadMessages, temperature: override }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: payloadMessages,
          temperature: override ?? temperature,
          max_tokens: DEFAULT_MAX_TOKENS,
        }),
      });
    } catch (err) {
      throw new GroqError(
        err.name === 'AbortError' ? 'Groq request timed out.' : `Groq unreachable: ${err.message}`,
        'GROQ_TRANSPORT'
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger?.warn(`Groq ${response.status}: ${body.slice(0, 200)}`);
      throw new GroqError(
        `Groq responded with ${response.status}`,
        response.status === 401 || response.status === 403 ? 'GROQ_AUTH' : 'GROQ_API',
        response.status
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!content) throw new GroqError('Groq returned an empty reply.', 'GROQ_EMPTY');
    return content.slice(0, MAX_REPLY_CHARS);
  };

  return { isConfigured, chat, model };
};

module.exports = { createGroqClient, GroqError };
