import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { PlusCircle, PlayCircle } from 'lucide-react';
import ImportWords from './ImportWords';
import { endOfDay } from 'date-fns';

export default function Dashboard({ onStartQuiz }: { onStartQuiz: () => void }) {
  const [showImport, setShowImport] = useState(false);

  const settings = useLiveQuery(() => db.settings.get('settings'));
  const dailyLimit = settings?.dailyNewWordsLimit || 20;

  const stats = useLiveQuery(async () => {
    const todayEnd = endOfDay(new Date()).getTime();

    const reviewWords = await db.words
      .filter(w => (w.status === 'learning' || w.status === 'review') && w.nextReviewDate <= todayEnd)
      .toArray();

    const newWords = await db.words
      .filter(w => w.status === 'new')
      .limit(dailyLimit)
      .toArray();

    const totalMastered = await db.words.where('status').equals('mastered').count();
    const totalWords = await db.words.count();

    return {
      reviewCount: reviewWords.length,
      newCount: newWords.length,
      readyCount: reviewWords.length + newWords.length,
      totalMastered,
      totalWords,
    };
  }, [dailyLimit]);

  if (showImport) {
    return <ImportWords onClose={() => setShowImport(false)} />;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-serif text-natural-950">Hello!</h1>
        <p className="text-natural-700 mt-1">Ready to learn some new words?</p>
      </header>

      {stats ? (
        <div className="space-y-6">
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-natural-300 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-natural-600 font-bold">Today's Mission</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-serif text-natural-950">{stats.readyCount}</span>
                <span className="text-natural-700 font-medium">words</span>
              </div>
              <p className="text-sm text-natural-600 mt-1">
                {stats.newCount} new / {stats.reviewCount} to review
              </p>
            </div>

            <button
              onClick={onStartQuiz}
              disabled={stats.readyCount === 0}
              className={`h-16 w-16 rounded-full flex items-center justify-center text-white transition-all shadow-md focus:outline-none focus:ring-4 focus:ring-natural-300 ${stats.readyCount > 0 ? 'bg-natural-900 hover:bg-natural-800 hover:scale-105 active:scale-95 shadow-natural-900/10' : 'bg-natural-400 cursor-not-allowed'}`}
            >
              <PlayCircle size={32} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-natural-200 rounded-[24px] p-5 border border-natural-300 relative group cursor-help">
              <p className="text-natural-700 font-bold uppercase tracking-widest text-[11px]">Mastered</p>
              <p className="text-2xl font-serif text-natural-950 mt-1">{stats.totalMastered}</p>
              <div className="absolute top-full left-0 mt-2 w-48 bg-natural-900 text-white text-xs p-3 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 shadow-lg">
                Words become "Mastered" only after 6 consecutive correct reviews (approx. 30 days of spaced repetition).
              </div>
            </div>
            <div className="bg-natural-200 rounded-[24px] p-5 border border-natural-300">
              <p className="text-natural-700 font-bold uppercase tracking-widest text-[11px]">Total Words</p>
              <p className="text-2xl font-serif text-natural-950 mt-1">{stats.totalWords}</p>
            </div>
          </div>

          <button
            onClick={() => setShowImport(true)}
            className="w-full mt-4 bg-natural-50 border-2 border-dashed border-natural-500 text-natural-700 hover:border-natural-accent hover:text-natural-900 hover:bg-natural-100 rounded-[24px] p-4 flex flex-col items-center justify-center gap-2 transition-all group"
          >
            <div className="bg-white group-hover:bg-natural-200 p-3 rounded-full transition-colors">
              <PlusCircle className="text-natural-500 group-hover:text-natural-900 transition-colors" />
            </div>
            <span className="font-medium">Import Words (PDF/Images)</span>
          </button>
        </div>
      ) : (
        <div className="animate-pulse space-y-6">
          <div className="bg-natural-300 h-32 rounded-[32px]"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-natural-300 h-24 rounded-[24px]"></div>
            <div className="bg-natural-300 h-24 rounded-[24px]"></div>
          </div>
        </div>
      )}
    </div>
  );
}
