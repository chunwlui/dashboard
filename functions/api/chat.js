const MAX_QUESTION_LENGTH = 1000;
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
  if (!Array.isArray(conversation)) {
    return [];
  }

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
    return json(
      { error: 'DeepSeek API key is not configured.' },
      500
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      { error: 'Request body must be valid JSON.' },
      400
    );
  }

  const question = typeof body.question === 'string'
    ? body.question.trim()
    : '';

  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return json(
      {
        error: `Question must contain 1-${MAX_QUESTION_LENGTH} characters.`
      },
      400
    );
  }

  const farmData =
    body.farmData && typeof body.farmData === 'object'
      ? body.farmData
      : {};

  const hkoForecast = Array.isArray(farmData.hkoForecast)
    ? farmData.hkoForecast.slice(0, 7)
    : [];

  const messages = [
    {
      role: 'system',
      content: [
        'You are DeepSeek, the AgroSense smart-farm assistant.',
        'Answer briefly and clearly for a small-scale farmer.',
        'Use the current dashboard readings supplied below when relevant.',
        'The farm sensor readings are currently MOCK DATA, not verified farm measurements.',
        'Hong Kong Observatory weather data is real outdoor forecast data for Hong Kong.',
        'The HKO forecast is not a guaranteed measurement inside the farm or greenhouse.',
        'Use the HKO forecast when answering questions about rain, irrigation, temperature, or farm planning.',
        'Do not claim that you have switched a pump, fan, light, or other device.',
        'Give practical suggestions and mention uncertainty when appropriate.',
        'Recommend checking real sensors before taking action.',
        'Answer in clear, natural English unless the user writes in Chinese or Cantonese.',
        'Use a short direct answer first.',
        'For longer answers, use short sections with simple headings and bullet points.',
        'Use numbered steps only when explaining a process.',
        'Keep paragraphs short.',
        'Give practical examples when useful.',
        'Do not use Markdown symbols such as **, #, or ``` because the website displays plain text.',
        'If you are uncertain, clearly say what you are unsure about.',
        `Current dashboard readings: ${JSON.stringify(farmData)}`,
        `Hong Kong Observatory seven-day forecast: ${JSON.stringify(hkoForecast)}`
      ].join(' ')
    },
    ...cleanConversation(body.conversation),
    {
      role: 'user',
      content: question
    }
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
        model: 'deepseek-v4-pro',
        messages,
        stream: false,
        max_tokens: 10000,
        temperature: 0.7
      })
    });
  } catch (error) {
    console.error('DeepSeek network error:', error);

    return json(
      { error: 'Unable to reach DeepSeek.' },
      502
    );
  }

  if (!deepseekResponse.ok) {
    const errorBody = await deepseekResponse.text();

    console.error(
      'DeepSeek returned:',
      deepseekResponse.status,
      errorBody
    );

    return json(
      { error: 'DeepSeek could not answer this request.' },
      502
    );
  }

  let result;

  try {
    result = await deepseekResponse.json();
  } catch {
    return json(
      { error: 'DeepSeek returned invalid JSON.' },
      502
    );
  }

  const answer = result.choices?.[0]?.message?.content;

  if (typeof answer !== 'string' || !answer.trim()) {
    return json(
      { error: 'DeepSeek returned an empty answer.' },
      502
    );
  }

  return json({
    answer: answer.trim()
  });
}

export function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204
    });
  }

  return json(
    { error: 'Method not allowed.' },
    405
  );
}