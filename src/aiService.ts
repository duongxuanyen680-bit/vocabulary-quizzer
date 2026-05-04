import { db } from './db';

type ExtractedWord = { english: string; chinese: string };
type Submission = { word: string; targetChinese: string; userChinese: string };
type ImageMode = 'object-url' | 'string-url';

type ChatMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
      | { type: 'image_url'; image_url: string }
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

async function requestTextFromAi(content: ChatMessageContent, systemPrompt: string) {
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
      max_tokens: 4096,
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

  return text;
}

async function requestJsonFromAi(content: ChatMessageContent, systemPrompt: string) {
  const rawText = await requestTextFromAi(content, systemPrompt);
  return { rawText, result: parseJsonText(rawText) };
}

function tryParseJsonText(text: string) {
  try {
    return parseJsonText(text);
  } catch {
    return null;
  }
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

function normalizeStringWord(item: string): ExtractedWord {
  const text = item.trim();
  const separator = [' - ', ' -- ', ': ', ' = ', ' | '].find(token => text.includes(token));
  if (!separator) return { english: text, chinese: '' };

  const [english, ...rest] = text.split(separator);
  return {
    english: english.trim(),
    chinese: rest.join(separator).trim(),
  };
}

function normalizeExtractedWord(item: any): ExtractedWord {
  if (typeof item === 'string') {
    return normalizeStringWord(item);
  }

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

function normalizeWords(result: any) {
  return extractWordsArray(result)
    .map(normalizeExtractedWord)
    .filter((word: ExtractedWord) => word.english && word.chinese);
}

function cleanWordLine(line: string) {
  return line
    .replace(/^\s*[-*]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/\*\*/g, '')
    .trim();
}

function hasEnglishLetters(text: string) {
  return /[A-Za-z]/.test(text);
}

function hasMeaningText(text: string) {
  return /[\u4e00-\u9fffA-Za-z]/.test(text);
}

function findWordSeparator(line: string) {
  const tokens = [' -- ', ' - ', ': ', ' = ', ' | ', '--', ' -', '- ', ':', '=', '|'];
  let bestIndex = -1;
  let bestLength = 0;

  for (const token of tokens) {
    const index = line.indexOf(token);
    if (index > 0 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
      bestLength = token.length;
    }
  }

  for (let index = 1; index < line.length; index += 1) {
    const code = line.charCodeAt(index);
    const isWideSeparator = code === 0xff1a || code === 0xff1d || code === 0x2013 || code === 0x2014;
    if (isWideSeparator && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
      bestLength = 1;
    }
  }

  return bestIndex === -1 ? null : { index: bestIndex, length: bestLength };
}

function parsePlainTextWords(text: string): ExtractedWord[] {
  const words: ExtractedWord[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanWordLine(rawLine);
    if (!line || line.length > 220) continue;

    const separator = findWordSeparator(line);
    if (!separator) continue;

    const english = line.slice(0, separator.index).trim().replace(/^["'`]|["'`]$/g, '');
    const chinese = line
      .slice(separator.index + separator.length)
      .trim()
      .replace(/^["'`]|["'`]$/g, '');

    const key = english.toLowerCase();
    if (!hasEnglishLetters(english) || !hasMeaningText(chinese) || seen.has(key)) continue;

    seen.add(key);
    words.push({ english, chinese });
  }

  return words;
}

function normalizeWordsFromAiText(rawText: string) {
  const result = tryParseJsonText(rawText);
  if (result !== null) {
    const words = normalizeWords(result);
    if (words.length > 0) return words;
  }

  return parsePlainTextWords(rawText);
}

async function buildExtractionParts(files: File[], imageMode: ImageMode): Promise<Exclude<ChatMessageContent, string>> {
  const parts: Exclude<ChatMessageContent, string> = [
    {
      type: 'text',
      text:
        'Read the attached image or document and extract every visible English vocabulary word or phrase. ' +
        'For each item, provide a concise Chinese meaning. If the image contains only English words, infer the Chinese meanings yourself. ' +
        'Return strict JSON only, with no markdown and no explanation. Use this exact shape: {"words":[{"english":"abandon","chinese":"give up"}]}. ' +
        'The field names must be exactly "english" and "chinese". Do not return an empty list unless no English text is visible.',
    },
  ];

  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    if (file.type.startsWith('image/')) {
      if (imageMode === 'string-url') {
        parts.push({ type: 'image_url', image_url: dataUrl });
      } else {
        parts.push({ type: 'image_url', image_url: { url: dataUrl } });
      }
    } else {
      parts.push({ type: 'file', file: { filename: file.name, file_data: dataUrl } });
    }
  }

  return parts;
}

function truncateForMessage(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 280 ? `${cleaned.slice(0, 280)}...` : cleaned;
}

export async function extractWordsFromDocuments(files: File[]): Promise<ExtractedWord[]> {
  let lastRawText = '';
  let lastError: unknown = null;

  for (const imageMode of ['object-url', 'string-url'] as const) {
    try {
      const parts = await buildExtractionParts(files, imageMode);
      const { rawText, result } = await requestJsonFromAi(
        parts,
        'You extract vocabulary from study materials and respond with strict JSON only.',
      );

      lastRawText = rawText;
      const words = normalizeWords(result);
      if (words.length > 0) return words;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastRawText) {
    throw new Error(`AI returned no extractable words. Raw response: ${truncateForMessage(lastRawText)}`);
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  return [];
}

export async function extractWordsFromText(inputText: string): Promise<ExtractedWord[]> {
  const text = inputText.trim();
  if (!text) return [];

  const rawText = await requestTextFromAi(
    JSON.stringify({
      instruction:
        'Extract every English vocabulary word or phrase from the pasted study text. ' +
        'For each item, provide a concise Chinese meaning. If meanings already exist in the text, use them. ' +
        'If the pasted text contains only English words, infer the Chinese meanings yourself. ' +
        'Prefer strict JSON with this exact shape: {"words":[{"english":"abandon","chinese":"give up"}]}. ' +
        'If you cannot return JSON, return one vocabulary item per line in the format "english - meaning". ' +
        'The field names must be exactly "english" and "chinese". Do not return an empty list unless no English words are present.',
      text,
    }),
    'You extract vocabulary from pasted study text and respond with strict JSON only.',
  );

  const words = normalizeWordsFromAiText(rawText);
  if (words.length > 0) return words;

  throw new Error(`AI returned no extractable words. Raw response: ${truncateForMessage(rawText)}`);
}

export async function gradeAnswers(submissions: Submission[]): Promise<boolean[]> {
  if (submissions.length === 0) return [];

  const { result } = await requestJsonFromAi(
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
