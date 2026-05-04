import { useState, useRef } from 'react';
import { extractWordsFromDocuments, extractWordsFromText } from './aiService';
import { db } from './db';
import { ArrowLeft, UploadCloud, Loader2, CheckCircle2, ClipboardList } from 'lucide-react';

export default function ImportWords({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedWords, setExtractedWords] = useState<{english: string, chinese: string}[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasPastedText = pastedText.trim().length > 0;
  const canExtract = hasPastedText || files.length > 0;

  const handleFileChange = (e: import('react').ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleExtract = async () => {
    if (!canExtract) return;
    setIsExtracting(true);
    setStatusMsg(
      hasPastedText
        ? "Extracting words from pasted text..."
        : "Extracting words using your AI API... This might take a bit for large files."
    );
    
    try {
      const words = hasPastedText
        ? await extractWordsFromText(pastedText)
        : await extractWordsFromDocuments(files);
      setExtractedWords(words);
      setStatusMsg(`Extracted ${words.length} words!`);
    } catch (e: any) {
      console.error(e);
      setStatusMsg("Failed to extract words: " + e.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    setIsExtracting(true);
    setStatusMsg("Saving words to database...");
    
    const now = Date.now();
    const newWords = extractedWords.map(w => ({
      id: crypto.randomUUID(),
      english: w.english,
      chinese: w.chinese,
      status: 'new' as const,
      nextReviewDate: 0,
      interval: 0,
      consecutiveCorrect: 0,
      addedToVocabBook: false,
      createdAt: now
    }));

    try {
      await db.words.bulkPut(newWords);
      onClose();
    } catch (e: any) {
      console.error(e);
      setStatusMsg("Failed to save: " + e.message);
      setIsExtracting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto h-full flex flex-col">
      <header className="flex items-center gap-4 mb-6 mt-4">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-natural-200 transition-colors">
          <ArrowLeft size={24} className="text-natural-700" />
        </button>
        <h1 className="text-3xl font-serif text-natural-950">Import Words</h1>
      </header>

      {extractedWords.length === 0 ? (
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            <div className="bg-white rounded-[24px] border border-natural-300 shadow-sm p-5 mb-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-natural-200 flex items-center justify-center text-natural-700 shrink-0">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <h2 className="font-medium text-natural-950">Paste recognized text</h2>
                  <p className="text-sm text-natural-600">Use this when image extraction returns 0 words.</p>
                </div>
              </div>
              <textarea
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                className="w-full min-h-36 resize-y rounded-[20px] border border-natural-300 bg-natural-100/40 px-4 py-3 text-sm text-natural-900 outline-none focus:border-natural-accent focus:bg-white transition-colors"
                placeholder={"Paste OCR text or word list here, for example:\nabandon - give up\nbrief: short\nmaintain  keep something going"}
              />
              {hasPastedText && files.length > 0 && (
                <p className="mt-2 text-xs text-natural-600">
                  Pasted text will be extracted first. Clear the text box to use uploaded files.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-natural-300" />
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-natural-500">or upload files</span>
              <div className="h-px flex-1 bg-natural-300" />
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-natural-400 hover:border-natural-accent hover:bg-natural-100/30 rounded-[32px] p-10 flex flex-col items-center justify-center cursor-pointer transition-all h-64 bg-white"
            >
              <UploadCloud size={48} className="text-natural-500 mb-4" />
              <p className="font-medium text-natural-800 text-center">
                Tap to select PDF or Images
              </p>
              <p className="text-sm text-natural-600 mt-2 text-center max-w-xs">
                We'll use AI to read your document and extract English words along with their Chinese meanings.
              </p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                multiple 
                accept=".pdf,image/*" 
              />
            </div>

            {files.length > 0 && (
              <div className="mt-6">
                <h3 className="font-medium mb-3 text-natural-950">Selected files:</h3>
                <ul className="space-y-2">
                  {files.map((f, i) => (
                    <li key={i} className="text-sm text-natural-800 bg-natural-200 px-4 py-3 rounded-2xl flex items-center justify-between">
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-natural-600">{(f.size/1024/1024).toFixed(1)}MB</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="pt-6">
            <p className="text-center text-sm mb-4 text-natural-700 font-medium">{statusMsg}</p>
            <button 
              onClick={handleExtract}
              disabled={!canExtract || isExtracting}
              className="w-full bg-natural-900 hover:bg-natural-800 disabled:bg-natural-400 text-white font-medium py-4 rounded-full flex justify-center items-center gap-2 transition-all shadow-md shadow-natural-900/10"
            >
              {isExtracting ? (
                 <>
                  <Loader2 className="animate-spin" size={20} />
                  Extracting...
                 </>
              ) : "Extract Words"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-emerald-50 text-emerald-700 p-4 rounded-[24px] flex gap-3 items-center mb-6 border border-emerald-100">
            <CheckCircle2 className="text-emerald-500 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800">Extraction Complete</p>
              <p className="text-sm opacity-90">Found {extractedWords.length} words.</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto mb-6 bg-white rounded-[32px] border border-natural-300 shadow-sm">
            <ul className="divide-y divide-natural-300">
              {extractedWords.map((w, i) => (
                <li key={i} className="p-5 flex flex-col gap-1">
                  <span className="font-serif text-lg text-natural-950">{w.english}</span>
                  <span className="text-sm text-natural-700">{w.chinese}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2">
            <button 
              onClick={handleSave}
              disabled={isExtracting}
              className="w-full bg-natural-900 hover:bg-natural-800 disabled:bg-natural-400 text-white font-medium py-4 rounded-full flex justify-center items-center gap-2 transition-all shadow-md shadow-natural-900/10"
            >
               {isExtracting ? (
                 <>
                  <Loader2 className="animate-spin" size={20} />
                  Saving...
                 </>
              ) : "Save to My Words"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
