const OpenAI = require('openai');

// System prompt loaded from environment variable for privacy
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || 'You are a helpful assistant.';

/**
 * Generate a response using OpenAI GPT-4o
 *
 * @param {string} apiKey - OpenAI API key
 * @param {string} userMessage - The cast/message to respond to
 * @param {string} username - The username of the person who sent the message
 * @param {Object} [context] - Additional context
 * @returns {Promise<string>} The generated response
 */
async function generateResponse(apiKey, userMessage, username, context = {}) {
  const openai = new OpenAI({ apiKey });

  const userPrompt = `@${username} said: "${userMessage}"

${context.isReply ? 'This is a reply to one of your casts.' : 'This is a mention of you.'}

Respond as Rish trapped in @claudeagent. Keep it short and punchy for social media.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    max_completion_tokens: 150,
    temperature: 0.9
  });

  return completion.choices[0].message.content.trim();
}

module.exports = { generateResponse };
