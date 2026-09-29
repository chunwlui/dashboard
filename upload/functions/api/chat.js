const MAX_QUESTION_LENGTH = 50000;
const MAX_CONVERSATION_MESSAGES = 12;
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function cleanConversation(conversation) {
  if (!Array.isArray(conversation)) return [];

  return conversation
    .slice(-MAX_CONVERSATION_MESSAGES)
    .filter(message => (
      message &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string'
    ))
    .map(message => ({
      role: message.role,
      content: message.content.slice(0, 1000)
    }));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DEEPSEEK_API_KEY) {
    return json({ error: 'DeepSeek API key is not configured.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const question = typeof body.question === 'string'
    ? body.question.trim()
    : '';

  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return json({
      error: `Question must contain 1-${MAX_QUESTION_LENGTH} characters.`
    }, 400);
  }

  const farmData = body.farmData && typeof body.farmData === 'object'
    ? body.farmData
    : {};

  const weatherForecast = Array.isArray(body.farmData?.hkoForecast)
    ? body.farmData.hkoForecast.slice(0, 7)
    : [];

  const messages = [
    {
      role: 'system',
      content: [
        'You are DeepSeek, the AgroSense smart-farm assistant.',
        'Answer briefly and clearly for a small-scale farmer.',
        'Use the current dashboard readings supplied below when relevant.',
        'These readings are currently MOCK DATA, not verified farm measurements.',
        'Do not claim that you have switched a pump, fan, light, or other device.',
        'Give practical suggestions, mention uncertainty, and recommend checking real sensors before taking action.',
        `Current dashboard readings: ${JSON.stringify(farmData)}`,
        `Hong Kong Observatory seven-day forecast: ${JSON.stringify(weatherForecast)}`,
        'Use the HKO forecast when answering questions about watering, rain, temperature, or farm planning. The forecast is for Hong Kong outdoor weather, not a guaranteed greenhouse measurement.' 
      ].join(' ')
    },
    ...cleanConversation(body.conversation),
    { role: 'user', content: question }
  ];

  let deepseekResponse;
  try {
    deepseekResponse = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-flash',
        messages,
        stream: false,
        max_tokens: 35000,
        temperature: 0.4
      })
    });
  } catch (error) {
    console.error('DeepSeek network error:', error);
    return json({ error: 'Unable to reach DeepSeek.' }, 502);
  }

  if (!deepseekResponse.ok) {
    console.error('DeepSeek returned:', deepseekResponse.status);
    return json({ error: 'DeepSeek could not answer this request.' }, 502);
  }

  const result = await deepseekResponse.json();
  const answer = result.choices?.[0]?.message?.content;

  if (typeof answer !== 'string' || !answer.trim()) {
    return json({ error: 'DeepSeek returned an empty answer.' }, 502);
  }

  return json({ answer: answer.trim() });
}

export function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  return json({ error: 'Method not allowed.' }, 405);
}
