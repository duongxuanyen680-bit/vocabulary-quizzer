/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Home, BookOpen, Settings as SettingsIcon } from 'lucide-react';
import Dashboard from './Dashboard';
import QuizView from './QuizView';
import VocabBook from './VocabBook';
import SettingsView from './SettingsView';
import { db } from './db';

type View = 'dashboard' | 'quiz' | 'vocab' | 'settings';
type QuizConfig = { mode: 'daily' } | { mode: 'vocab_book' };

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [quizConfig, setQuizConfig] = useState<QuizConfig>({ mode: 'daily' });
  const [isInitializing, setIsInitializing] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    async function initSettings() {
      const settings = await db.settings.get('settings');
      if (!settings) {
        await db.settings.put({ id: 'settings', dailyNewWordsLimit: 20, darkMode: false });
      } else {
        setDarkMode(Boolean(settings.darkMode));
      }
      setIsInitializing(false);
    }
    initSettings();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  if (isInitializing) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const startQuiz = (config: QuizConfig) => {
    setQuizConfig(config);
    setCurrentView('quiz');
  };

  return (
    <div className="flex flex-col h-screen bg-natural-50 text-natural-950 font-sans">
      <main className="flex-1 overflow-y-auto">
        {currentView === 'dashboard' && <Dashboard onStartQuiz={() => startQuiz({ mode: 'daily' })} />}
        {currentView === 'quiz' && <QuizView config={quizConfig} onFinish={() => setCurrentView('dashboard')} />}
        {currentView === 'vocab' && <VocabBook onStartSpecialQuiz={() => startQuiz({ mode: 'vocab_book' })} />}
        {currentView === 'settings' && <SettingsView darkMode={darkMode} onDarkModeChange={setDarkMode} />}
      </main>

      {currentView !== 'quiz' && (
        <nav className="bg-white border-t border-natural-400 px-6 py-3 flex justify-between items-center pb-safe">
          <NavItem icon={<Home />} label="Home" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
          <NavItem icon={<BookOpen />} label="Vocabulary" active={currentView === 'vocab'} onClick={() => setCurrentView('vocab')} />
          <NavItem icon={<SettingsIcon />} label="Settings" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
        </nav>
      )}
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: import('react').ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center p-2 rounded-xl transition-colors ${active ? 'text-natural-900' : 'text-natural-700 hover:text-natural-950'}`}
    >
      <div className={`mb-1 ${active ? 'scale-110 transition-transform' : ''}`}>
        {icon}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
