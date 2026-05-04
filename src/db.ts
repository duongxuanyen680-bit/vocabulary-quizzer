import Dexie, { type EntityTable } from 'dexie';

export interface Word {
  id: string;
  english: string;
  chinese: string;
  status: 'new' | 'learning' | 'review' | 'mastered';
  nextReviewDate: number; // timestamp in ms
  interval: number; // current interval in days
  consecutiveCorrect: number;
  addedToVocabBook: boolean;
  createdAt: number;
}

export interface AppSettings {
  id: string;
  dailyNewWordsLimit: number;
  aiEndpoint?: string;
  aiApiKey?: string;
  aiModel?: string;
  darkMode?: boolean;
}

const db = new Dexie('vocab_app_db') as Dexie & {
  words: EntityTable<Word, 'id'>;
  settings: EntityTable<AppSettings, 'id'>;
};

db.version(1).stores({
  words: 'id, english, status, nextReviewDate, addedToVocabBook, createdAt',
  settings: 'id'
});

export { db };
