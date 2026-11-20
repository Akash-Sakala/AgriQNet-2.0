// Ask: voice-first questions in the farmer's language.
// Phones: the message list is the page scroll and the composer sits just above the bottom bar.
// Two sources, as a 2-way switch: any farming question (AI helper) or the Farmer Library's books.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { ChatCircleDots, Books, Plant, UserCircle, ArrowClockwise, NotePencil, CaretRight, Sparkle, MagnifyingGlass } from '@phosphor-icons/react';
import { GeminiService } from '../services/geminiService';
import { LibraryService, Book } from '../services/libraryService';
import { BookChat, requestOpenBook } from './Library';
import { ChatMessage, Language, Farmer, NavView } from '../types';
import { ScreenTitle, SpeakButton } from './ui/Kit';
import { IconChip } from './ui/Icons';
import { VoiceComposer } from './ui/VoiceComposer';
import { getTranslation, fmt, cropName, districtName } from '../utils/translations';
import { cn } from '../lib/utils';

interface ChatModuleProps { lang: Language; user: Farmer; onBack: () => void; onNavigate?: (v: NavView) => void }
type Msg = ChatMessage & { failed?: boolean };

const STORAGE_KEY = 'agriqnet_chat_history';
const MODE_KEY = 'agriqnet_ask_mode';
type AskMode = 'general' | 'library';

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full / private */ } };

const MD = {
  p: (p: any) => <p className="mb-2 last:mb-0" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 mb-2 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...p} />,
  li: (p: any) => <li className="pl-1" {...p} />,
  h1: (p: any) => <h3 className="text-xl font-semibold mb-2 text-agri-800" {...p} />,
  h2: (p: any) => <h3 className="text-lg font-semibold mb-2 text-agri-800" {...p} />,
  h3: (p: any) => <h4 className="font-semibold mb-1 text-agri-800" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-ink" {...p} />,
  blockquote: (p: any) => <blockquote className="border-l-4 border-agri-300 pl-4 bg-agri-50 py-1 rounded-r mb-2" {...p} />,
};

/** 2-way switch: who answers. */
const ModeSwitch: React.FC<{ lang: Language; mode: AskMode; onChange: (m: AskMode) => void }> = ({ lang, mode, onChange }) => {
  const t = getTranslation(lang) as any;
  const opts = [{ id: 'general' as const, icon: ChatCircleDots, label: t.modeGeneralShort }, { id: 'library' as const, icon: Books, label: t.modeLibraryShort }];
  return (
    <div id="ask-mode" role="radiogroup" aria-label={t.askModeLabel} className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-100 border border-gray-200 mb-4">
      {opts.map((o) => {
        const on = mode === o.id;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            className={cn('min-h-[48px] rounded-xl flex items-center justify-center gap-2 font-semibold transition-colors', on ? 'bg-paper text-agri-900 shadow-soft' : 'text-gray-700 hover:text-ink')}>
            <o.icon size={22} weight={on ? 'fill' : 'duotone'} aria-hidden />{o.label}
          </button>
        );
      })}
    </div>
  );
};

/** "Farm books" mode: the same whole-library chat as in the library (one shared history). */
const LibraryAsk: React.FC<{ lang: Language; books: Book[] | null; error: string; onNavigate?: (v: NavView) => void; onRetry: () => void }> = ({ lang, books, error, onNavigate, onRetry }) => {
  const t = getTranslation(lang) as any;
  const openLibrary = () => onNavigate?.('library');
  if (!books) {
    return error
      ? <div className="rounded-[20px] bg-paper border border-gray-200 p-6 flex flex-col items-center text-center gap-3">
          <p className="text-gray-700">{error}</p>
          <button onClick={onRetry} className="min-h-[48px] px-5 rounded-2xl bg-agri-700 text-white font-semibold">{t.retry}</button>
        </div>
      : <div className="h-64 rounded-[20px] shimmer" />;
  }
  if (!books.length) {
    return (
      <div className="rounded-[20px] bg-paper border border-gray-200 p-6 flex flex-col items-center text-center gap-3">
        <IconChip icon={Books} tone="soil" size="lg" />
        <p className="text-gray-700 max-w-sm">{t.askLibraryEmpty}</p>
        <button onClick={openLibrary} className="min-h-[48px] inline-flex items-center gap-1 px-5 rounded-2xl bg-agri-700 text-white font-semibold">{t.libOpenLibrary}<CaretRight size={18} aria-hidden /></button>
      </div>
    );
  }
  return (
    <div className="h-[calc(100dvh-300px)] min-h-[420px] lg:h-[calc(100vh-220px)]">
      <BookChat lang={lang} book={null} books={books} fill onOpenBook={(id) => { requestOpenBook(id); openLibrary(); }}
        headerAction={
          <button onClick={openLibrary} className="min-h-[44px] font-semibold text-agri-800 px-2.5 rounded-lg hover:bg-agri-50 inline-flex items-center gap-1 shrink-0">
            <Books size={20} weight="duotone" aria-hidden /><span className="hidden sm:inline">{t.askBrowseBooks}</span>
          </button>
        } />
    </div>
  );
};

const ChatModule: React.FC<ChatModuleProps> = ({ lang, user, onBack, onNavigate }) => {
  const t = getTranslation(lang) as any;
  const welcome = (): Msg => ({ id: '1', role: 'model', text: t.chatWelcome, timestamp: Date.now() });
  const [messages, setMessages] = useState<Msg[]>(() => {
    const saved = load<Msg[] | null>(STORAGE_KEY, null);
    return saved && saved.length > 1 ? saved : [welcome()];
  });
  useEffect(() => { setMessages((m) => m.map((x) => (x.id === '1' ? { ...x, text: t.chatWelcome } : x))); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [mode, setModeState] = useState<AskMode>(() => (load<string>(MODE_KEY, 'general') === 'library' ? 'library' : 'general'));
  const setMode = (m: AskMode) => { setModeState(m); save(MODE_KEY, m); };
  const [books, setBooks] = useState<Book[] | null>(null);
  const [libError, setLibError] = useState('');
  const loadBooks = () => { setLibError(''); LibraryService.list().then((r) => setBooks(r.books)).catch((e) => setLibError(e.status === 503 ? t.libUnavailable : (e.message || t.chatError))); };
  useEffect(() => { loadBooks(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const endRef = useRef<HTMLDivElement>(null);
  const count = useRef(messages.length);
  useEffect(() => {
    save(STORAGE_KEY, messages);
    // new message: show the start of it (long answers are read from the top), or the end for short ones
    if (messages.length > count.current) {
      const last = document.querySelector<HTMLElement>('[data-msg]:last-of-type');
      const longReply = last && last.offsetHeight > window.innerHeight * 0.5;
      (longReply ? last : endRef.current)?.scrollIntoView({ behavior: 'smooth', block: longReply ? 'start' : 'end' });
    }
    count.current = messages.length;
  }, [messages]);

  // stage text while waiting ("Reading your question…" → "Finding the answer…")
  useEffect(() => {
    if (!busy) { setStage(0); return; }
    const id = window.setTimeout(() => setStage(1), 2500);
    return () => window.clearTimeout(id);
  }, [busy]);

  const ask = async (text: string, history: Msg[]) => {
    setBusy(true);
    try {
      const reply = await GeminiService.chat(text, history.filter((m) => !m.failed).map((m) => ({ role: m.role, parts: [{ text: m.text }] })), lang, { districtId: user.districtId, crops: user.crops });
      setMessages((prev) => [...prev, { id: `${Date.now()}b`, role: 'model', text: reply, timestamp: Date.now() }]);
    } catch (e) {
      console.error('Chat error', e);
      setMessages((prev) => [...prev, { id: `${Date.now()}e`, role: 'model', text: t.chatError, timestamp: Date.now(), failed: true }]);
    } finally { setBusy(false); }
  };
  const send = (text: string) => {
    const userMsg: Msg = { id: `${Date.now()}u`, role: 'user', text, timestamp: Date.now() };
    const history = messages;
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    ask(text, history);
  };
  const retry = (failedId: string) => {
    const i = messages.findIndex((m) => m.id === failedId);
    const lastUser = [...messages.slice(0, i)].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const kept = messages.filter((m) => m.id !== failedId);
    setMessages(kept);
    ask(lastUser.text, kept.slice(0, kept.indexOf(lastUser)));
  };
  const newChat = () => {
    const before = messages;
    setMessages([welcome()]);
    toast(t.chatCleared, { action: { label: t.undo, onClick: () => setMessages(before) }, duration: 6000 });
  };

  // Suggestions from the farmer's own crops and district
  const suggestions = useMemo(() => {
    const crop = user.crops?.[0] ? cropName(t, user.crops[0]) : (t.topicsList?.[0] ? '' : 'ragi');
    const district = districtName(t, user.districtId || '', user.location);
    if (!crop) return (t.topicsList as string[] || []).slice(0, 4);
    return [fmt(t.sugFert, { crop }), fmt(t.sugPest, { crop }), fmt(t.sugSow, { crop }), fmt(t.sugRain, { district })];
  }, [lang, user.crops, user.districtId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onlyWelcome = messages.length === 1;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_18rem] lg:gap-6">
      <div className="min-w-0">
        <ScreenTitle lang={lang} icon="chat" title={t.tileAsk} desc={t.tileAskSub} onBack={onBack}
          right={mode === 'general' && !onlyWelcome ? (
            <button type="button" onClick={newChat} className="min-h-[48px] px-3 rounded-2xl bg-paper border border-gray-300 text-gray-800 font-semibold flex items-center gap-1.5 hover:border-agri-400">
              <NotePencil size={20} aria-hidden /><span className="hidden sm:inline">{t.newChat}</span><span className="sr-only sm:hidden">{t.newChat}</span>
            </button>
          ) : undefined} />
        <ModeSwitch lang={lang} mode={mode} onChange={setMode} />

        {mode === 'library' ? (
          <LibraryAsk lang={lang} books={books} error={libError} onNavigate={onNavigate} onRetry={loadBooks} />
        ) : (
          <>
            <ol className="space-y-4 pb-4" aria-live="polite" aria-relevant="additions">
              {messages.map((m) => (
                <li key={m.id} data-msg className={cn('flex gap-2.5 scroll-mt-24', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {m.role === 'model' && <span className="w-9 h-9 shrink-0 rounded-full bg-agri-100 text-agri-700 flex items-center justify-center mt-1" aria-hidden><Plant size={20} weight="duotone" /></span>}
                  <div className={cn('max-w-[86%] md:max-w-[75%] flex flex-col gap-2', m.role === 'user' && 'items-end')}>
                    <div className={cn('px-4 py-3 rounded-[20px] text-lg leading-relaxed',
                      m.role === 'user' ? 'bg-agri-700 text-white rounded-tr-md' : m.failed ? 'bg-clay-50 border border-clay-600/30 text-clay-700 rounded-tl-md' : 'bg-paper border border-gray-200 text-ink rounded-tl-md shadow-soft')}>
                      {m.role === 'user' ? <p className="whitespace-pre-wrap">{m.text}</p> : <div className="markdown-content"><ReactMarkdown components={MD}>{m.text}</ReactMarkdown></div>}
                    </div>
                    {m.role === 'model' && !m.failed && <SpeakButton text={m.text} lang={lang} size="sm" label />}
                    {m.failed && (
                      <button type="button" onClick={() => retry(m.id)} className="min-h-[48px] px-4 rounded-2xl bg-agri-700 text-white font-bold flex items-center gap-2 self-start">
                        <ArrowClockwise size={20} aria-hidden />{t.retry}
                      </button>
                    )}
                  </div>
                  {m.role === 'user' && <span className="w-9 h-9 shrink-0 rounded-full bg-gold-100 text-gold-700 flex items-center justify-center mt-1" aria-hidden><UserCircle size={22} weight="duotone" /></span>}
                </li>
              ))}
              {busy && (
                <li className="flex gap-2.5">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-agri-100 text-agri-700 flex items-center justify-center" aria-hidden><Plant size={20} weight="duotone" /></span>
                  <div className="px-4 py-3 rounded-[20px] rounded-tl-md bg-paper border border-agri-200 flex items-center gap-3" role="status">
                    {stage === 0 ? <MagnifyingGlass size={22} weight="duotone" className="text-agri-700" aria-hidden /> : <Sparkle size={22} weight="duotone" className="text-agri-700" aria-hidden />}
                    <span className="font-semibold text-ink">{stage === 0 ? t.stageAsk1 : t.stageAsk2}</span>
                    <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="w-2 h-2 rounded-full bg-agri-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
                  </div>
                </li>
              )}
            </ol>

            {onlyWelcome && (
              <div className="mb-4">
                <p className="font-semibold text-gray-700 mb-2">{t.suggested}</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s, i) => (
                    <button key={i} type="button" onClick={() => send(s)} className="min-h-[48px] px-4 py-2 rounded-2xl bg-agri-50 border border-agri-200 text-agri-900 font-semibold text-left hover:border-agri-400">{s}</button>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />

            {/* Composer: pinned above the phone bottom bar */}
            <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-4 z-20">
              <VoiceComposer lang={lang} value={input} onChange={setInput} onSend={send} busy={busy} placeholder={t.askPlaceholder} />
            </div>
          </>
        )}
      </div>

      {/* Desktop: suggestions beside the chat */}
      {mode === 'general' && (
        <aside className="hidden lg:block">
          <div className="sticky top-24 bg-paper p-5 rounded-[20px] border border-gray-200 shadow-soft">
            <h2 className="font-semibold text-ink mb-3 flex items-center gap-2"><Sparkle size={20} weight="duotone" className="text-gold-700" aria-hidden />{t.suggested}</h2>
            <div className="space-y-2">
              {[...suggestions, ...((t.topicsList as string[]) || []).slice(0, 3)].map((s, i) => (
                <button key={i} type="button" onClick={() => send(s)} disabled={busy}
                  className="w-full text-left p-3 rounded-2xl bg-cream border border-gray-200 hover:border-agri-300 text-gray-800">{s}</button>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};

export default ChatModule;
