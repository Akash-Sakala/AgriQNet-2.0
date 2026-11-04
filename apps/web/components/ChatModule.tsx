
import { Trash as TrashIcon, IconChip, ChatCircleDots, Books, CheckCircle } from './ui/Icons';
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Leaf, Sparkles, Loader2, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GeminiService } from '../services/geminiService';
import { LibraryService, Book } from '../services/libraryService';
import { BookChat, requestOpenBook } from './Library';
import { ChatMessage, Language, Farmer, NavView } from '../types';
import { ScreenTitle, SpeakButton, MicButton } from './ui/Kit';
import { getTranslation, fmt } from '../utils/translations';

interface ChatModuleProps {
  lang: Language;
  user: Farmer;
  onBack: () => void;
  onNavigate?: (v: NavView) => void;
}

const STORAGE_KEY = 'agriqnet_chat_history';
const MODE_KEY = 'agriqnet_ask_mode';
type AskMode = 'general' | 'library';

/** The two ways to ask, as two big cards: a general farming helper, or the Farmer Library's books. */
const AskModePicker: React.FC<{ lang: Language; mode: AskMode; onChange: (m: AskMode) => void; bookCount: number | null }> = ({ lang, mode, onChange, bookCount }) => {
  const t = getTranslation(lang);
  const options: { id: AskMode; icon: typeof Books; tone: 'plum' | 'soil'; title: string; sub: string }[] = [
    { id: 'general', icon: ChatCircleDots, tone: 'plum', title: t.askModeGeneral, sub: t.askModeGeneralSub },
    { id: 'library', icon: Books, tone: 'soil', title: t.askModeLibrary, sub: bookCount ? fmt(t.askModeLibrarySubN, { n: bookCount }) : t.askModeLibrarySub },
  ];
  return (
    <div id="ask-mode" role="radiogroup" aria-label={t.askModeLabel} className="grid grid-cols-2 gap-2 md:gap-3 mb-3 shrink-0">
      {options.map((o) => {
        const on = mode === o.id;
        return (
          <button key={o.id} role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            className={`relative flex items-center gap-2.5 md:gap-3 text-left p-2.5 md:p-3.5 rounded-2xl border-2 transition-colors ${on ? 'bg-paper border-agri-600 shadow-soft' : 'bg-paper/60 border-gray-200 hover:border-agri-300'}`}>
            <IconChip icon={o.icon} tone={o.tone} size="sm" className="shrink-0 hidden min-[480px]:flex" />
            <span className="min-w-0 flex-1">
              <span className={`block font-semibold leading-tight ${on ? 'text-agri-900' : 'text-gray-800'}`}>{o.title}</span>
              <span className="block text-xs md:text-sm text-gray-600 leading-snug mt-0.5 line-clamp-2">{o.sub}</span>
            </span>
            {on && <CheckCircle size={22} weight="fill" className="text-agri-600 shrink-0 hidden sm:block" />}
          </button>
        );
      })}
    </div>
  );
};

/** "From Farmer Library": the same whole-library chat as in the library (one shared history). */
const LibraryAsk: React.FC<{ lang: Language; books: Book[] | null; error: string; onNavigate?: (v: NavView) => void; onRetry: () => void }> = ({ lang, books, error, onNavigate, onRetry }) => {
  const t = getTranslation(lang);
  const openLibrary = () => onNavigate?.('library');
  if (!books) {
    return error
      ? <div className="h-full rounded-3xl bg-paper border border-gray-200 p-6 flex flex-col items-center justify-center text-center gap-3">
          <p className="text-gray-700">{error}</p>
          <button onClick={onRetry} className="px-5 py-3 rounded-2xl bg-agri-700 text-white font-semibold">{t.retry}</button>
        </div>
      : <div className="h-full rounded-3xl shimmer" />;
  }
  if (!books.length) {
    return (
      <div className="h-full rounded-3xl bg-paper border border-gray-200 p-6 flex flex-col items-center justify-center text-center gap-3">
        <IconChip icon={Books} tone="soil" size="lg" />
        <p className="text-gray-700 max-w-sm">{t.askLibraryEmpty}</p>
        <button onClick={openLibrary} className="inline-flex items-center gap-1 px-5 py-3 rounded-2xl bg-agri-700 text-white font-semibold">{t.libOpenLibrary}<ChevronRight size={18} /></button>
      </div>
    );
  }
  return (
    <BookChat lang={lang} book={null} books={books} fill
      onOpenBook={(id) => { requestOpenBook(id); openLibrary(); }}
      headerAction={
        <button onClick={openLibrary} className="text-sm font-semibold text-agri-800 px-2.5 py-1.5 rounded-lg hover:bg-agri-50 inline-flex items-center gap-1 shrink-0">
          <Books size={18} weight="duotone" /><span className="hidden sm:inline">{t.askBrowseBooks}</span>
        </button>
      } />
  );
};

const ChatModule: React.FC<ChatModuleProps> = ({ lang, user, onBack, onNavigate }) => {
  const t = getTranslation(lang);
  // Initialize messages from localStorage
  const savedMessages = (() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  })();

  // Only the welcome message so far? Show it in the current language.
  const isOnlyWelcome = Array.isArray(savedMessages) && savedMessages.length === 1 && savedMessages[0].id === '1';
  const [messages, setMessages] = useState<ChatMessage[]>((!isOnlyWelcome && savedMessages) || [
    { id: '1', role: 'model', text: t.chatWelcome, timestamp: Date.now() }
  ]);
  // The welcome message follows the language switch
  useEffect(() => { setMessages((m) => m.map((x) => (x.id === '1' ? { ...x, text: t.chatWelcome } : x))); }, [lang]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // Who answers: the general farming helper, or the Farmer Library's books (remembered)
  const [mode, setModeState] = useState<AskMode>(() => (localStorage.getItem(MODE_KEY) === 'library' ? 'library' : 'general'));
  const setMode = (m: AskMode) => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
  const [books, setBooks] = useState<Book[] | null>(null);
  const [libError, setLibError] = useState('');
  const loadBooks = () => { setLibError(''); LibraryService.list().then((r) => setBooks(r.books)).catch((e) => setLibError(e.status === 503 ? t.libUnavailable : (e.message || t.chatError))); };
  useEffect(() => { loadBooks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);

  // scroll the message list only (not the whole page)
  const scrollToBottom = () => {
    const box = scrollBoxRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  };

  // Save messages to localStorage and scroll to bottom on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Prepare history for context
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      // NOTE: We pass 'lang' to GeminiService, but if the user explicitly spoke in English via toggle,
      // the input text is English. Gemini handles this gracefully.
      const responseText = await GeminiService.chat(userMsg.text, history, lang, { districtId: user.districtId, crops: user.crops });

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, botMsg]);

    } catch (error) {
      console.error("Chat error", error);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'model', text: t.chatError, timestamp: Date.now() }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => () => { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }, []);

  const getDailyTip = () => {
    const tips = (t as any).tipsList;
    if (!tips || tips.length === 0) return "Farming is life.";
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    return tips[dayIndex % tips.length];
  };

  const dailyTip = getDailyTip();

  const MarkdownComponents = {
    p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
    ul: ({ ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
    ol: ({ ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
    li: ({ ...props }) => <li className="pl-1" {...props} />,
    h1: ({ ...props }) => <h1 className="text-xl font-bold mb-2 text-agri-800" {...props} />,
    h2: ({ ...props }) => <h2 className="text-lg font-bold mb-2 text-agri-700" {...props} />,
    h3: ({ ...props }) => <h3 className="text-md font-bold mb-1 text-agri-700" {...props} />,
    strong: ({ ...props }) => <strong className="font-semibold text-gray-900" {...props} />,
    blockquote: ({ ...props }) => <blockquote className="border-l-4 border-agri-300 pl-4 italic bg-agri-50 py-1 rounded-r mb-2" {...props} />,
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-170px)] lg:h-[calc(100vh-112px)]">
    <ScreenTitle lang={lang} icon="chat" title={t.tileAsk} desc={t.tileAskSub} onBack={onBack} />
    <AskModePicker lang={lang} mode={mode} onChange={setMode} bookCount={books?.length || null} />
    {mode === 'library' ? (
      <div className="flex-1 min-h-0"><LibraryAsk lang={lang} books={books} error={libError} onNavigate={onNavigate} onRetry={loadBooks} /></div>
    ) : (
    <div className="flex-1 min-h-0 flex gap-6">
      {/* Main Chat Area */}
      <div className="flex-1 bg-paper rounded-3xl shadow-soft border border-gray-100 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-3 md:p-4 border-b border-gray-100 bg-white/50 backdrop-blur-sm flex items-center justify-between gap-2">
          <div className="hidden md:flex items-center gap-3">
             <div className="w-10 h-10 bg-agri-700 rounded-full flex items-center justify-center text-white shadow-md">
               <Bot size={20} />
             </div>
             <div>
               <h3 className="font-bold text-gray-800">{t.chatTitle}</h3>
               <div className="flex items-center gap-1.5">
                 <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                 <span className="text-xs text-green-600 font-medium">{t.online}</span>
               </div>
             </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4 flex-1 md:flex-none justify-between md:justify-end">
             <button 
                onClick={() => {
                    const initialMsg = { id: '1', role: 'model', text: t.chatWelcome, timestamp: Date.now() } as ChatMessage;
                    setMessages([initialMsg]);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify([initialMsg]));
                }} 
                className="text-sm text-gray-500 hover:text-red-500 transition-colors px-2 py-2 rounded-lg hover:bg-red-50 shrink-0"
                title={t.clearChat}
             >
                <span className="inline-flex items-center gap-1.5"><TrashIcon size={18} weight="duotone" /><span className="hidden md:inline">{t.clearChat}</span></span>
             </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollBoxRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-cream">
          {messages.map((msg) => {
            return (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex gap-3 max-w-[90%] md:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-agri-100 text-agri-700' : 'bg-agri-100 text-agri-600'}`}>
                    {msg.role === 'user' ? <User size={16} /> : <Leaf size={16} />}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className={`p-4 rounded-2xl shadow-soft relative group ${msg.role === 'user' ? 'bg-agri-700 text-white rounded-tr-none' : 'bg-paper text-gray-700 rounded-tl-none border border-gray-100'}`}>
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap text-base leading-relaxed">{msg.text}</p>
                      ) : (
                        <div className="text-base leading-relaxed markdown-content">
                          <ReactMarkdown components={MarkdownComponents}>{msg.text}</ReactMarkdown>
                        </div>
                      )}

                    </div>
                    {msg.role === 'model' && <SpeakButton text={msg.text} lang={lang} size="sm" label />}
                  </div>
                </div>
              </div>
            );
          })}
          {isTyping && (
             <div className="flex justify-start">
               <div className="flex gap-3 max-w-[80%]">
                 <div className="w-8 h-8 rounded-full bg-agri-100 text-agri-600 flex items-center justify-center shrink-0">
                   <Leaf size={16} />
                 </div>
                 <div className="bg-paper p-4 rounded-2xl rounded-tl-none border border-gray-100 shadow-soft">
                   <div className="flex gap-1">
                     <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></span>
                     <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-75"></span>
                     <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-150"></span>
                   </div>
                 </div>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 md:p-4 bg-paper border-t border-gray-100">
          {messages.length <= 1 && (
            <div className="flex gap-2 overflow-x-auto pb-3 lg:hidden">
              {(t.topicsList as string[]).slice(0, 4).map((topic, i) => (
                <button key={i} onClick={() => setInput(topic)} className="shrink-0 px-3 py-2 rounded-full bg-agri-50 border border-agri-100 text-agri-800 text-sm">{topic}</button>
              ))}
            </div>
          )}
          <div className="relative flex items-center bg-gray-50 rounded-full border border-gray-200 focus-within:ring-2 focus-within:ring-agri-200 focus-within:border-agri-400 transition-all">
            
            <div className="pl-1.5"><MicButton lang={lang} onText={(txt) => setInput(txt)} /></div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={t.typeOrSpeak}
              className="flex-1 bg-transparent px-3 py-4 outline-none text-lg text-gray-800 placeholder-gray-400 min-w-0"
            />
            
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="mr-2 p-3 bg-agri-700 text-white rounded-full hover:bg-agri-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-md hover:shadow-soft flex-shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar Knowledge Panel */}
      <div className="hidden lg:block w-80 space-y-4">
        <div className="bg-gradient-to-b from-agri-50 to-white p-6 rounded-3xl border border-agri-100 h-full">
           <h4 className="font-bold text-agri-900 mb-4 flex items-center gap-2">
             <Sparkles size={18} className="text-yellow-500" />
             {t.suggested}
           </h4>
           <div className="space-y-3">
             {(t.topicsList as string[]).map((topic, i) => (
               <button 
                key={i}
                onClick={() => setInput(topic)} 
                className="w-full text-left p-3 rounded-xl bg-paper border border-agri-100 hover:border-agri-300 hover:shadow-md transition-all text-sm text-gray-600 hover:text-agri-700"
               >
                 {topic}
               </button>
             ))}
           </div>

           <div className="mt-8 pt-6 border-t border-agri-100">
             <h4 className="font-bold text-gray-800 text-sm mb-3">{t.tip}</h4>
             <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
               <p className="text-xs text-orange-800 italic">"{dailyTip}"</p>
             </div>
           </div>
           
        </div>
      </div>
    </div>
    )}
    </div>
  );
};

export default ChatModule;
