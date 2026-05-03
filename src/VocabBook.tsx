import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Word } from './db';
import { Search, Star, Trash2 } from 'lucide-react';

export default function VocabBook({ onStartSpecialQuiz }: { onStartSpecialQuiz: () => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'vocab_book' | 'mastered'>('vocab_book');

  const words = useLiveQuery(
    () => db.words.toArray(),
    []
  );

  const filteredWords = (words || [])
    .filter(w => {
      const isVocab = w.addedToVocabBook === true || (w.addedToVocabBook as any) === 'true' || (w.addedToVocabBook as any) === 1;
      if (filter === 'vocab_book' && !isVocab) return false;
      if (filter === 'mastered' && w.status !== 'mastered') return false;
      
      if (searchTerm) {
        return w.english.toLowerCase().includes(searchTerm.toLowerCase()) || 
               w.chinese.includes(searchTerm);
      }
      return true;
    })
    .sort((a, b) => a.english.localeCompare(b.english));

  const toggleVocabBook = async (word: Word) => {
    await db.words.update(word.id, { addedToVocabBook: !word.addedToVocabBook });
  };

  const deleteWord = async (id: string) => {
    if (confirm("Are you sure you want to delete this word?")) {
      await db.words.delete(id);
    }
  };

  const hasStarredWords = (words || []).some(w => w.addedToVocabBook === true || (w.addedToVocabBook as any) === 'true' || (w.addedToVocabBook as any) === 1);

  return (
    <div className="flex flex-col h-full bg-natural-50">
      <header className="pt-8 px-6 pb-4 bg-white border-b border-natural-300">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-serif text-natural-950">Vocabulary</h1>
          {hasStarredWords && (
            <button 
              onClick={onStartSpecialQuiz}
              className="bg-natural-50 border border-natural-400 text-natural-900 hover:bg-natural-100 px-4 py-2 rounded-full font-medium text-sm transition-colors shadow-sm"
            >
              Review Starred
            </button>
          )}
        </div>
        
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-500" size={20} />
          <input 
            type="text" 
            placeholder="Search words..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-natural-50 border-natural-300 border rounded-[24px] focus:outline-none focus:border-natural-accent transition-colors text-natural-950 placeholder-natural-500"
          />
        </div>

        <div className="flex gap-2">
          {([{id:'vocab_book', label:'Starred'}, {id:'all', label:'All Words'}, {id:'mastered', label:'Mastered'}] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 rounded-full text-[11px] uppercase tracking-widest font-bold transition-colors ${filter === tab.id ? 'bg-natural-900 text-natural-50' : 'bg-natural-100 text-natural-700 hover:bg-natural-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredWords.map(w => (
          <div key={w.id} className="bg-white p-5 rounded-[24px] shadow-sm border border-natural-300 flex items-center justify-between">
            <div>
              <p className="font-serif text-lg text-natural-950 flex items-center gap-2">
                {w.english}
                {w.status === 'mastered' && <span className="text-[10px] bg-natural-200 text-natural-800 px-2 flex items-center h-5 rounded-full uppercase tracking-wider font-bold">mastered</span>}
              </p>
              <p className="text-natural-600 mt-1">{w.chinese}</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => toggleVocabBook(w)}
                className={`p-2 rounded-full transition-colors ${w.addedToVocabBook ? 'text-amber-500 hover:bg-amber-50' : 'text-natural-400 hover:bg-natural-100 hover:text-natural-800'}`}
              >
                <Star size={24} fill={w.addedToVocabBook ? "currentColor" : "none"} />
              </button>
              <button 
                onClick={() => deleteWord(w.id)}
                className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-full transition-colors"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        ))}

        {filteredWords.length === 0 && (
          <div className="text-center py-20 text-natural-500">
            <BookOpenIconOutline size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium">No words found in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BookOpenIconOutline(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  );
}
