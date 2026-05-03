import { useState, useEffect } from 'react';
import { db } from './db';

export default function SettingsView() {
  const [dailyLimit, setDailyLimit] = useState(20);
  const [aiEndpoint, setAiEndpoint] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const settings = await db.settings.get('settings');
      if (!settings) return;
      setDailyLimit(settings.dailyNewWordsLimit);
      setAiEndpoint(settings.aiEndpoint || '');
      setAiApiKey(settings.aiApiKey || '');
      setAiModel(settings.aiModel || '');
    }
    load();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    await db.settings.put({
      id: 'settings',
      dailyNewWordsLimit: dailyLimit,
      aiEndpoint: aiEndpoint.trim(),
      aiApiKey: aiApiKey.trim(),
      aiModel: aiModel.trim(),
    });
    setIsSaving(false);
    alert('Settings saved!');
  };

  const handleClearDb = async () => {
    if (confirm('Are you sure you want to delete ALL your words and progress? This cannot be undone!')) {
      await db.words.clear();
      alert('Database cleared.');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col h-full bg-natural-50">
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-serif text-natural-950">Settings</h1>
      </header>

      <div className="bg-white p-6 rounded-[32px] border border-natural-300 shadow-sm space-y-8">
        <section>
          <label className="block text-lg font-serif text-natural-950 mb-1">Daily New Words Limit</label>
          <p className="text-sm text-natural-600 mb-4">How many new words to introduce each day.</p>

          <div className="flex items-center gap-4">
            <input
              type="number"
              value={dailyLimit}
              onChange={e => setDailyLimit(Number(e.target.value))}
              min={1}
              max={100}
              className="w-24 px-4 py-3 bg-natural-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-natural-400 text-natural-950"
            />
            <span className="text-[11px] uppercase tracking-widest text-natural-600 font-bold">words</span>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-serif text-natural-950">AI API</h2>
            <p className="text-sm text-natural-600 mt-1">Use any OpenAI-compatible chat completions endpoint.</p>
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-natural-800 mb-2">Endpoint</span>
            <input
              type="url"
              value={aiEndpoint}
              onChange={e => setAiEndpoint(e.target.value)}
              placeholder="https://api.example.com/v1/chat/completions"
              className="w-full px-4 py-3 bg-natural-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-natural-400 text-natural-950"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-natural-800 mb-2">API Key</span>
            <input
              type="password"
              value={aiApiKey}
              onChange={e => setAiApiKey(e.target.value)}
              placeholder="Optional for local APIs"
              className="w-full px-4 py-3 bg-natural-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-natural-400 text-natural-950"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-natural-800 mb-2">Model</span>
            <input
              type="text"
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              placeholder="gpt-4.1-mini"
              className="w-full px-4 py-3 bg-natural-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-natural-400 text-natural-950"
            />
          </label>
        </section>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-natural-900 text-natural-50 font-medium py-3 px-8 rounded-full hover:bg-natural-800 transition-colors shadow-sm"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div className="mt-8 bg-rose-50 p-6 rounded-[32px] border border-rose-100">
        <h2 className="text-lg font-serif text-rose-900 mb-2">Danger Zone</h2>
        <p className="text-sm text-rose-700/80 mb-4">Resetting your database will permanently delete all your progress and downloaded words.</p>

        <button
          onClick={handleClearDb}
          className="bg-white text-rose-600 font-medium py-3 px-6 rounded-full hover:bg-rose-50 transition-colors border border-rose-200 shadow-sm"
        >
          Erase All Data
        </button>
      </div>
    </div>
  );
}
