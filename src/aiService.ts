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

export async function extractWordsFromDocuments(files: File[]): Promise<ExtractedWord[]> {
  const parts: Exclude<ChatMessageContent, string> = [
    {
      type: 'text',
      text:
        'Extract all English words or phrases and their corresponding Chinese meanings from the attached documents. ' +
        'Return only JSON in this exact shape: {"words":[{"english":"word","chinese":"Chinese meaning"}]}. ' +
        'If a word has multiple meanings, provide the primary meaning or a concise combined meaning.',
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

  const words = Array.isArray(result) ? result : result?.words;
  if (!Array.isArray(words)) return [];

  return words
    .map((item: any) => ({
      english: String(item?.english || '').trim(),
      chinese: String(item?.chinese || '').trim(),
    }))
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
