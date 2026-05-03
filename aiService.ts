import { db } from './db';

type ExtractedWord = { english: string; chinese: string };
type Submission = { word: string; targetChinese: string; userChinese: string };

type ChatMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
      | { type: 'file'; file: { filename: string; file_data: string } }
    >;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file.'));
      }
    };
    reader.onerror = error => reject(error);
  });
}

async function getAiConfig() {
  const settings = await db.settings.get('settings');
  const endpoint = settings?.aiEndpoint?.trim() || '';
  const model = settings?.aiModel?.trim() || '';
  const apiKey = settings?.aiApiKey?.trim() || '';

  if (!endpoint || !model) {
    throw new Error('Please configure your AI API endpoint and model in Settings first.');
  }

  return { endpoint, model, apiKey };
}

async function requestJsonFromAi(content: ChatMessageContent, systemPrompt: string) {
  const { endpoint, model, apiKey } = await getAiConfig();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`AI API request failed (${response.status}): ${message || response.statusText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? data?.content ?? data?.text;

  if (typeof text !== 'string') {
    throw new Error('AI API returned an unsupported response format.');
  }

  return parseJsonText(text);
}

function parseJsonText(text: string) {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const objectStart = withoutFence.indexOf('{');
    const objectEnd = withoutFence.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
      return JSON.parse(withoutFence.slice(objectStart, objectEnd + 1));
    }

    const arrayStart = withoutFence.indexOf('[');
    const arrayEnd = withoutFence.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      return JSON.parse(withoutFence.slice(arrayStart, arrayEnd + 1));
    }
  }

  throw new Error('AI API did not return valid JSON.');
}

function firstStringValue(item: any, keys: string[]) {
  for (const key of keys) {
    const value = item?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeExtractedWord(item: any): ExtractedWord {
  if (Array.isArray(item)) {
    return {
      english: String(item[0] || '').trim(),
      chinese: String(item[1] || '').trim(),
    };
  }

  return {
    english: firstStringValue(item, [
      'english',
      'word',
      'term',
      'phrase',
      'vocabulary',
      'vocab',
      'en',
      'source',
    ]),
    chinese: firstStringValue(item, [
      'chinese',
      'meaning',
      'translation',
      'definition',
      'chineseMeaning',
      'cn',
      'zh',
      'target',
    ]),
  };
}

function extractWordsArray(result: any) {
  if (Array.isArray(result)) return result;

  for (const key of ['words', 'vocabulary', 'items', 'data', 'result', 'results']) {
    if (Array.isArray(result?.[key])) {
      return result[key];
    }
  }

  return [];
}

export async function extractWordsFromDocuments(files: File[]): Promise<ExtractedWord[]> {
  const parts: Exclude<ChatMessageContent, string> = [
    {
      type: 'text',
      text:
        'Read the attached image or document and extract every visible English vocabulary word or phrase. ' +
        'For each item, provide a concise Chinese meaning. If the image contains only English words, infer the Chinese meanings yourself. ' +
        'Return strict JSON only, with no markdown and no explanation. Use this exact shape: {"words":[{"english":"abandon","chinese":"放弃"}]}. ' +
        'The field names must be exactly "english" and "chinese". Do not return an empty list unless no English text is visible.',
    },
  ];

  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    if (file.type.startsWith('image/')) {
      parts.push({ type: 'image_url', image_url: { url: dataUrl } });
    } else {
      parts.push({ type: 'file', file: { filename: file.name, file_data: dataUrl } });
    }
  }

  const result = await requestJsonFromAi(
    parts,
    'You extract vocabulary from study materials and respond with strict JSON only.',
  );

  return extractWordsArray(result)
    .map(normalizeExtractedWord)
    .filter((word: ExtractedWord) => word.english && word.chinese);
}

export async function gradeAnswers(submissions: Submission[]): Promise<boolean[]> {
  if (submissions.length === 0) return [];

  const result = await requestJsonFromAi(
    JSON.stringify({
      instruction:
        'Grade each Chinese answer for the matching English word. Accept synonyms and minor typos. Mark false when the meaning is fundamentally wrong or blank. Return only JSON.',
      outputShape: { results: [true, false] },
      submissions,
    }),
    'You are a strict but fair English teacher. Respond with strict JSON only.',
  );

  const results = Array.isArray(result) ? result : result?.results;
  if (!Array.isArray(results)) {
    throw new Error('AI API did not return a results array.');
  }

  return submissions.map((_, index) => Boolean(results[index]));
}
