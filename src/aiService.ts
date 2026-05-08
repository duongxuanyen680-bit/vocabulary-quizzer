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
      stream: false,
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
  return extractResponseText(data);
}

function textFromMessageContent(content: any): string | null {
  if (typeof content === 'string') return content;
  if (!content) return null;

  if (typeof content?.text === 'string') return content.text;
  if (typeof content?.content === 'string') return content.content;
  if (typeof content?.value === 'string') return content.value;
  if (typeof content?.text?.value === 'string') return content.text.value;
  if (!Array.isArray(content)) return null;

  return content
    .map(part => {
      if (typeof part === 'string') return part;
      if (typeof part?.text === 'string') return part.text;
      if (typeof part?.content === 'string') return part.content;
      if (typeof part?.value === 'string') return part.value;
      if (typeof part?.text?.value === 'string') return part.text.value;
      if (Array.isArray(part?.content)) return textFromMessageContent(part.content) || '';
      return '';
    })
    .join('\n')
    .trim();
}

function extractResponseText(data: any) {
  const choice = data?.choices?.[0];
  const candidates = [
    choice?.message?.content,
    choice?.message?.reasoning_content,
    choice?.text,
    data?.output_text,
    data?.response,
    data?.result,
    data?.message,
    data?.content,
    data?.text,
    data?.output,
    data,
  ];

  for (const candidate of candidates) {
    const text = textFromMessageContent(candidate);
    if (typeof text === 'string' && text.trim()) return text;
  }

  return '';
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

function extractEnglishCandidates(text: string) {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanWordLine(rawLine);
    if (!line || line.length > 120) continue;

    const separator = findWordSeparator(line);
    const value = (separator ? line.slice(0, separator.index) : line)
      .trim()
      .replace(/^["'`]|["'`]$/g, '');

    if (!hasEnglishLetters(value) || /[\u4e00-\u9fff]/.test(value)) continue;
    if (!/^[A-Za-z][A-Za-z\s.'-]*$/.test(value)) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(value);
  }

  return candidates;
}

function normalizeWordsFromAiText(rawText: string) {
  const result = tryParseJsonText(rawText);
  if (result !== null) {
    const words = normalizeWords(result);
    if (words.length > 0) return words;
  }

  return parsePlainTextWords(rawText);
}

function booleanFromValue(value: any): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value !== 'string') return null;
  return booleanFromText(value);
}

function booleanFromText(text: string): boolean | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  const compact = normalized.replace(/\s+/g, '');

  if (/\b(false|incorrect|wrong|no|reject|rejected|0|f)\b/.test(normalized)) return false;
  if (/[\u2717\u274c]/.test(normalized)) return false;
  if (
    compact.includes('\u9519') ||
    compact.includes('\u9519\u8bef') ||
    compact.includes('\u4e0d\u6b63\u786e') ||
    compact.includes('\u4e0d\u5bf9')
  ) {
    return false;
  }

  if (/\b(true|correct|right|yes|accept|accepted|1|t)\b/.test(normalized)) return true;
  if (/[\u2713\u2714\u2705]/.test(normalized)) return true;
  if (
    compact.includes('\u6b63\u786e') ||
    compact.includes('\u7b54\u5bf9') ||
    compact === '\u5bf9'
  ) {
    return true;
  }

  return null;
}

function booleanFromObject(item: any): boolean | null {
  if (!item || typeof item !== 'object') return null;

  for (const key of ['isCorrect', 'correct', 'result', 'grade', 'valid', 'accepted', 'answer']) {
    const parsed = booleanFromValue(item[key]);
    if (parsed !== null) return parsed;
  }

  return null;
}

function normalizeBooleanArray(result: any): Array<boolean | null> {
  const source =
    Array.isArray(result)
      ? result
      : result?.results ?? result?.grades ?? result?.answers ?? result?.data ?? result?.items;

  if (!Array.isArray(source)) return [];

  return source.map(item => {
    const direct = booleanFromValue(item);
    if (direct !== null) return direct;
    return booleanFromObject(item);
  });
}

function parsePlainTextBooleans(text: string, expectedLength: number): boolean[] {
  const values: boolean[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine
      .replace(/^\s*[-*]\s*/, '')
      .replace(/^\s*\d+[.)]\s*/, '')
      .trim();
    const parsed = booleanFromText(line);
    if (parsed !== null) values.push(parsed);
  }

  if (values.length === 0) {
    const tokens =
      text.match(
        /\b(?:true|false|correct|incorrect|wrong|right|yes|no|1|0|t|f)\b|[\u2713\u2714\u2705\u2717\u274c]|\u4e0d\u6b63\u786e|\u4e0d\u5bf9|\u9519\u8bef|\u6b63\u786e|\u7b54\u5bf9|\u5bf9|\u9519/gi,
      ) || [];

    for (const token of tokens) {
      const parsed = booleanFromText(token);
      if (parsed !== null) values.push(parsed);
    }
  }

  if (values.length === 0 && expectedLength === 1) {
    const parsed = booleanFromText(text);
    if (parsed !== null) values.push(parsed);
  }

  return values;
}

function normalizeGradingResultsFromAiText(rawText: string, expectedLength: number): boolean[] {
  const parsedJson = tryParseJsonText(rawText);
  if (parsedJson !== null) {
    const values = normalizeBooleanArray(parsedJson).filter((value): value is boolean => value !== null);
    if (values.length > 0) return values.slice(0, expectedLength);
  }

  return parsePlainTextBooleans(rawText, expectedLength).slice(0, expectedLength);
}

function isIgnoredMeaningPunctuation(char: string) {
  if (/[\s;,.:'"`!?()[\]{}<>/\\|-]/.test(char)) return true;

  const code = char.charCodeAt(0);
  return [
    0x3001,
    0x3002,
    0xff0c,
    0xff0e,
    0xff1a,
    0xff1b,
    0xff01,
    0xff1f,
    0xff08,
    0xff09,
    0x300a,
    0x300b,
  ].includes(code);
}

function normalizeForLocalGrade(text: string) {
  return Array.from(text.toLowerCase())
    .filter(char => !isIgnoredMeaningPunctuation(char))
    .join('')
    .trim();
}

function splitMeaningParts(text: string) {
  const parts: string[] = [];
  let current = '';

  for (const char of text) {
    if (isIgnoredMeaningPunctuation(char)) {
      if (current.trim()) parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current);

  return parts.map(normalizeForLocalGrade).filter(part => part.length >= 2);
}

function localGradeSubmission(submission: Submission) {
  const user = normalizeForLocalGrade(submission.userChinese);
  const target = normalizeForLocalGrade(submission.targetChinese);
  if (!user || !target) return false;

  if (user === target) return true;
  if (user.length >= 2 && target.includes(user)) return true;
  if (target.length >= 2 && user.includes(target)) return true;

  return splitMeaningParts(submission.targetChinese).some(part => user.includes(part) || part.includes(user));
}

function localGradeAnswers(submissions: Submission[]) {
  return submissions.map(localGradeSubmission);
}

function mergeWithLocalFallback(aiResults: boolean[], submissions: Submission[]) {
  const localResults = localGradeAnswers(submissions);
  return submissions.map((_, index) => aiResults[index] ?? localResults[index] ?? false);
}

function buildLineGradingPrompt(submissions: Submission[]) {
  return [
    'Grade each Chinese answer for the matching English word.',
    'Accept synonyms and minor typos.',
    'Return exactly one result per line, in the same order as the questions.',
    'Use only true or false. Do not add numbering, markdown, explanations, or extra text.',
    '',
    'Questions:',
    ...submissions.map((submission, index) =>
      [
        `${index + 1}.`,
        `English: ${submission.word}`,
        `Correct Chinese meaning: ${submission.targetChinese}`,
        `User answer: ${submission.userChinese || '(blank)'}`,
      ].join('\n'),
    ),
  ].join('\n\n');
}

function buildJsonGradingPrompt(submissions: Submission[]) {
  return JSON.stringify({
    instruction:
      'Grade each Chinese answer for the matching English word. Accept synonyms and minor typos. Return JSON only with this exact shape: {"results":[true,false]}.',
    submissions,
  });
}

async function requestGradingResults(prompt: string, systemPrompt: string, expectedLength: number) {
  const rawText = await requestTextFromAi(prompt, systemPrompt);
  return normalizeGradingResultsFromAiText(rawText, expectedLength);
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

  const wordsWithMeanings = parsePlainTextWords(text);
  if (wordsWithMeanings.length > 0) return wordsWithMeanings;

  const candidates = extractEnglishCandidates(text);
  if (candidates.length === 0) {
    throw new Error('No English vocabulary words were found in the pasted text.');
  }

  const rawText = await requestTextFromAi(
    [
      'Translate these English vocabulary items into concise Chinese meanings.',
      'Return only one item per line in this exact format:',
      'english - Chinese meaning',
      'Do not add numbering, markdown, explanations, or extra text.',
      '',
      'Words:',
      candidates.join('\n'),
    ].join('\n'),
    'You are a concise English-Chinese vocabulary dictionary.',
  );

  const words = normalizeWordsFromAiText(rawText);
  if (words.length > 0) return words;

  throw new Error(`AI returned no extractable words. Raw response: ${truncateForMessage(rawText)}`);
}

export async function gradeAnswers(submissions: Submission[]): Promise<boolean[]> {
  if (submissions.length === 0) return [];

  try {
    const lineResults = await requestGradingResults(
      buildLineGradingPrompt(submissions),
      'You are a strict but fair English teacher.',
      submissions.length,
    );

    if (lineResults.length === submissions.length) return lineResults;
    if (lineResults.length > 0) return mergeWithLocalFallback(lineResults, submissions);
  } catch (error) {
    console.warn('Primary AI grading failed. Trying fallback grading prompt.', error);
  }

  try {
    const jsonResults = await requestGradingResults(
      buildJsonGradingPrompt(submissions),
      'You are a strict but fair English teacher. Respond with JSON only.',
      submissions.length,
    );

    if (jsonResults.length === submissions.length) return jsonResults;
    if (jsonResults.length > 0) return mergeWithLocalFallback(jsonResults, submissions);
  } catch (error) {
    console.warn('Fallback AI grading failed. Using local grading fallback.', error);
  }

  return localGradeAnswers(submissions);
}
