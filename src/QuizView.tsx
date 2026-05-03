import { useState, useEffect } from 'react';
import { db, Word } from './db';
import { endOfDay } from 'date-fns';
import { gradeAnswers } from './aiService';
import { Loader2, ArrowLeft, CheckCircle, XCircle } from 'lucide-react';

export default function QuizView({ config, onFinish }: { config: { mode: 'daily' | 'vocab_book' }; onFinish: () => void }) {
  const [words, setWords] = useState<Word[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`quiz_draft_${config.mode}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load draft:', e);
    }
    return {};
  });
  const [isGrading, setIsGrading] = useState(false);
  const [results, setResults] = useState<{ word: Word; isCorrect: boolean }[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    localStorage.setItem(`quiz_draft_${config.mode}`, JSON.stringify(answers));
  }, [answers, config.mode]);

  useEffect(() => {
    async function loadQuiz() {
      if (config.mode === 'daily') {
        const todayEnd = endOfDay(new Date()).getTime();
        const settings = await db.settings.get('settings');
        const dailyLimit = settings?.dailyNewWordsLimit || 20;

        const reviewWords = await db.words
          .filter(w => (w.status === 'learning' || w.status === 'review') && w.nextReviewDate <= todayEnd)
          .toArray();

        const newWords = await db.words
          .filter(w => w.status === 'new')
          .limit(dailyLimit)
          .toArray();

        setWords([...reviewWords, ...newWords]);
      } else {
        const vocabWords = await db.words
          .filter(w => w.addedToVocabBook === true || (w.addedToVocabBook as any) === 'true' || (w.addedToVocabBook as any) === 1)
          .toArray();
        setWords(vocabWords);
      }
      setIsLoading(false);
    }
    loadQuiz();
  }, [config.mode]);

  const toggleVocabBookQuiz = async (id: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    setWords(words.map(w => (w.id === id ? { ...w, addedToVocabBook: newStatus } : w)));
    if (results) {
      setResults(results.map(r => (r.word.id === id ? { ...r, word: { ...r.word, addedToVocabBook: newStatus } } : r)));
    }

    try {
      await db.words.update(id, { addedToVocabBook: newStatus });
    } catch (e) {
      console.error(e);
      setWords(words.map(w => (w.id === id ? { ...w, addedToVocabBook: currentStatus } : w)));
      if (results) {
        setResults(results.map(r => (r.word.id === id ? { ...r, word: { ...r.word, addedToVocabBook: currentStatus } } : r)));
      }
    }
  };

  const handleSubmit = async () => {
    setIsGrading(true);

    const submissions = words.map(w => ({
      word: w.english,
      targetChinese: w.chinese,
      userChinese: answers[w.id] || '',
    }));

    if (submissions.every(s => !s.userChinese.trim())) {
      setResults(words.map(w => ({
        word: { ...w, addedToVocabBook: true },
        isCorrect: false,
      })));
      setIsGrading(false);
      return;
    }

    try {
      const gradingResults = await gradeAnswers(submissions);
      const mappedResults = words.map((w, i) => {
        const isCorrect = gradingResults[i] !== undefined ? gradingResults[i] : false;
        return {
          word: { ...w, addedToVocabBook: w.addedToVocabBook || !isCorrect },
          isCorrect,
        };
      });
      setResults(mappedResults);
    } catch (e) {
      console.error(e);
      alert('Failed to grade: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsGrading(false);
    }
  };

  const handleOverride = (index: number) => {
    if (!results) return;
    const newResults = [...results];
    const newIsCorrect = !newResults[index].isCorrect;
    newResults[index].isCorrect = newIsCorrect;

    if (!newIsCorrect && !newResults[index].word.addedToVocabBook) {
      newResults[index].word.addedToVocabBook = true;
      db.words.update(newResults[index].word.id, { addedToVocabBook: true }).catch(console.error);
    }

    setResults(newResults);
  };

  const handleFinish = async () => {
    if (!results) return;
    setIsLoading(true);

    const ebbinghausIntervals = [1, 2, 4, 7, 15, 30];
    const updates = results.map(({ word, isCorrect }) => {
      const now = Date.now();
      let nextReviewDate = now;
      let newInterval = word.interval;
      let newConsecutive = word.consecutiveCorrect;
      let newStatus = word.status;

      if (isCorrect) {
        newConsecutive += 1;
        const currentIntervalIndex = ebbinghausIntervals.indexOf(word.interval);

        if (currentIntervalIndex === -1 || currentIntervalIndex === ebbinghausIntervals.length - 1) {
          if (word.interval === 0) newInterval = 1;
          else if (currentIntervalIndex === ebbinghausIntervals.length - 1) {
            newStatus = 'mastered';
            newInterval = 30;
          } else {
            newInterval = 1;
          }
        } else {
          newInterval = ebbinghausIntervals[currentIntervalIndex + 1];
        }

        if (newStatus !== 'mastered') newStatus = 'review';
        nextReviewDate = now + newInterval * 24 * 60 * 60 * 1000;
      } else {
        newConsecutive = 0;
        newInterval = 1;
        newStatus = 'learning';
        nextReviewDate = now + 24 * 60 * 60 * 1000;
      }

      return {
        ...word,
        status: newStatus,
        interval: newInterval,
        consecutiveCorrect: newConsecutive,
        nextReviewDate,
      };
    });

    try {
      await db.words.bulkPut(updates);
      localStorage.removeItem(`quiz_draft_${config.mode}`);
      onFinish();
    } catch (e) {
      console.error(e);
      alert('Failed to save progress.');
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-natural-900" size={32} /></div>;
  }

  if (words.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-serif text-natural-950 mb-4">You're all caught up!</h2>
        <p className="text-natural-700 mb-8">No more words to learn or review today.</p>
        <button onClick={onFinish} className="bg-natural-900 text-white px-8 py-3 rounded-full font-medium hover:bg-natural-800 transition">
          Go Back
        </button>
      </div>
    );
  }

  if (results) {
    const score = results.filter(r => r.isCorrect).length;
    return (
      <div className="flex flex-col h-full bg-natural-50">
        <header className="p-6 pb-2 text-center">
          <h2 className="text-4xl font-serif text-natural-950">{score} / {words.length}</h2>
          <p className="text-[11px] uppercase tracking-widest text-natural-600 font-bold mt-2">Your Score</p>
          <p className="text-sm text-natural-600 mt-2">Tap the check/cross icon to override AI grading.</p>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {results.map(({ word, isCorrect }, i) => (
            <div key={word.id} className="bg-white p-5 rounded-[24px] shadow-sm border border-natural-300 flex gap-4 items-start">
              <button onClick={() => handleOverride(i)} className="mt-1 flex-shrink-0">
                {isCorrect ? (
                  <CheckCircle className="text-emerald-500" size={24} />
                ) : (
                  <XCircle className="text-rose-500" size={24} />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <p className="font-serif text-xl text-natural-950">{word.english}</p>
                  <label className="flex items-center gap-2 cursor-pointer mt-1" title="Add to vocabulary book">
                    <span className="text-xs text-natural-500 font-medium">Vocab book</span>
                    <input
                      type="checkbox"
                      checked={!!word.addedToVocabBook}
                      onChange={() => toggleVocabBookQuiz(word.id, !!word.addedToVocabBook)}
                      className="w-4 h-4 text-natural-900 bg-natural-100 border-natural-400 rounded focus:ring-natural-500 cursor-pointer accent-natural-900"
                    />
                  </label>
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-sm">
                    <span className="text-natural-600">Your answer: </span>
                    <span className={answers[word.id] ? 'text-natural-900' : 'text-natural-500 italic'}>
                      {answers[word.id] || 'Blank'}
                    </span>
                  </p>
                  <p className="text-sm">
                    <span className="text-natural-600">Correct: </span>
                    <span className="text-emerald-700 font-medium">{word.chinese}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-natural-50 border-t border-natural-300 pb-safe">
          <button
            onClick={handleFinish}
            className="w-full bg-natural-900 font-medium text-white py-4 rounded-full shadow-md shadow-natural-900/10 hover:bg-natural-800 transition"
          >
            Complete Review
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-natural-50">
      <header className="flex items-center gap-4 px-6 py-6 border-b border-natural-300">
        <button onClick={onFinish} className="p-2 -ml-2 rounded-full hover:bg-natural-200 text-natural-700">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-3xl font-serif text-natural-950 flex-1">Random Check ({words.length})</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6 bg-natural-50">
        <div className="bg-white rounded-[32px] shadow-sm border border-natural-300 p-8 flex flex-col">
          <div className="grid grid-cols-1 gap-y-1">
            <div className="border-b border-natural-300 pb-4 mb-4 flex justify-between">
              <span className="text-[11px] uppercase tracking-widest text-natural-600 font-bold">English Term</span>
              <span className="text-[11px] uppercase tracking-widest text-natural-600 font-bold">Chinese Meaning</span>
            </div>

            {words.map((w, index) => (
              <div key={w.id} className="flex items-center justify-between py-3 border-b border-natural-100 focus-within:bg-natural-100/50 transition-colors">
                <div className="flex items-center gap-3">
                  <label className="flex items-center cursor-pointer" title="Add to vocabulary book">
                    <input
                      type="checkbox"
                      checked={!!w.addedToVocabBook}
                      onChange={() => toggleVocabBookQuiz(w.id, !!w.addedToVocabBook)}
                      className="w-4 h-4 text-natural-900 bg-natural-100 border-natural-400 rounded focus:ring-natural-500 cursor-pointer accent-natural-900"
                    />
                  </label>
                  <span className="font-serif text-lg text-natural-950">{index + 1}. {w.english}</span>
                </div>
                <input
                  type="text"
                  placeholder="Meaning..."
                  value={answers[w.id] || ''}
                  onChange={e => setAnswers({ ...answers, [w.id]: e.target.value })}
                  className="w-40 border-b border-natural-400 text-sm focus:outline-none focus:border-natural-accent placeholder-natural-500 py-1 text-right bg-transparent"
                />
              </div>
            ))}
          </div>

          <div className="mt-12 bg-natural-50 border border-dashed border-natural-500 rounded-[24px] p-6 text-center">
            <p className="text-sm text-natural-700">Displaying {words.length} randomly selected words.</p>
          </div>
        </div>
      </div>

      <div className="p-6 bg-natural-50 pb-safe">
        <button
          onClick={handleSubmit}
          disabled={isGrading}
          className="w-full bg-natural-900 hover:bg-natural-800 disabled:bg-natural-400 font-medium text-white py-4 flex items-center justify-center gap-2 rounded-full shadow-md shadow-natural-900/10 transition"
        >
          {isGrading ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Grading with your AI API...
            </>
          ) : 'Finish & Grade'}
        </button>
      </div>
    </div>
  );
}
