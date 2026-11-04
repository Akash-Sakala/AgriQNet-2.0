// Farmer Library — an "OTT for farm knowledge": shelves of book covers (ICAR, UAS, the Ministry
// and farmers' own uploads). Tap a book to read it or ask it questions in your language; answers
// cite the page. "Ask the whole library" searches every book at once.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Send, X, Loader2, RefreshCw } from 'lucide-react';
import type { Icon as PhIcon } from '@phosphor-icons/react';
import { Farmer, Language } from '../types';
import { getTranslation, fmt, LOCALES } from '../utils/translations';
import { ScreenTitle, SpeakButton, MicButton, VoiceField } from './ui/Kit';
import {
  IconChip, Ico, TONES, Tone, Books, BookOpenText, FilePdf, UploadSimple, LinkSimple, Eye, EyeSlash, ArrowsClockwise,
  Sparkle, CaretLeft, CaretRight, Plus, Copy, Cow, Carrot, Lightbulb, Scroll, Megaphone, Plant, Mountains, Bug, Barn, CloudSun,
  CheckCircle, XCircle, Warning, Leaf, MagnifyingGlassIcon, Trash, UserCircle,
} from './ui/Icons';
import { Book, Job, LastCheck, LibraryService, Source, pick, pickList } from '../services/libraryService';

const MAX_MB = 80;

// ---------- categories: icon + colour (same colour language as the rest of the app) ----------
export const CATEGORY: Record<string, { icon: PhIcon; tone: Tone }> = {
  reports: { icon: Scroll, tone: 'forest' },
  advisories: { icon: Megaphone, tone: 'gold' },
  crop_guides: { icon: Plant, tone: 'leaf' },
  soil_water: { icon: Mountains, tone: 'soil' },
  pests_diseases: { icon: Bug, tone: 'rust' },
  livestock: { icon: Cow, tone: 'plum' },
  horticulture: { icon: Carrot, tone: 'leaf' },
  technology: { icon: Lightbulb, tone: 'sky' },
  schemes_markets: { icon: Barn, tone: 'stone' },
  climate: { icon: CloudSun, tone: 'sky' },
  other: { icon: BookOpenText, tone: 'stone' },
};
const CATEGORY_ORDER = ['advisories', 'crop_guides', 'pests_diseases', 'soil_water', 'horticulture', 'livestock', 'technology', 'climate', 'schemes_markets', 'reports', 'other'];
const cat = (c: string) => CATEGORY[c] || CATEGORY.other;
/** deep, rich backgrounds for designed covers (tone fg -> darker) */
const SHADE: Record<Tone, [string, string]> = {
  forest: ['#2B6046', '#112C21'], sky: ['#2F7096', '#173A4F'], leaf: ['#4E7F2C', '#22381A'], gold: ['#A8841C', '#5A4508'],
  rust: ['#B0582A', '#5A2A10'], red: ['#B5372B', '#5C1610'], plum: ['#714683', '#352140'], soil: ['#7D5C44', '#3A2A1E'], stone: ['#6B6456', '#2E2A23'],
};

// Home can ask the library to open a particular book
let pendingBook: string | null = null;
export const requestOpenBook = (id: string | null) => { pendingBook = id; };

// ---------- book cover ----------
export const BookCover: React.FC<{ book: Book; lang: Language; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; caption?: boolean }> = ({ book, lang, size = 'md', onClick, caption = true }) => {
  const t = getTranslation(lang);
  const title = pick(book.title, lang);
  const c = cat(book.category);
  const [a, b] = SHADE[c.tone];
  const w = size === 'lg' ? 'w-44 md:w-56' : size === 'sm' ? 'w-[124px] md:w-36' : 'w-36 md:w-44';
  const [imgOk, setImgOk] = useState(true);
  const hasImg = Boolean(book.coverUrl) && imgOk;
  const printed = hasImg && book.cover === 'page';
  const titleSize = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-[0.95rem]' : 'text-base';
  const Body = (
    <>
      <div className={`relative aspect-[2/3] rounded-[14px] overflow-hidden shadow-soft ring-1 ring-black/10 transition-[transform,box-shadow] duration-200 ${onClick ? 'group-hover:-translate-y-1 group-hover:shadow-lift' : ''}`}
        style={{ background: `linear-gradient(160deg, ${a} 0%, ${b} 100%)` }}>
        {hasImg && <img src={book.coverUrl!} alt="" loading="lazy" onError={() => setImgOk(false)} className="absolute inset-0 w-full h-full object-cover" />}
        {!hasImg && <c.icon aria-hidden weight="duotone" className="absolute -right-6 top-6 opacity-20 text-white" size={size === 'lg' ? 190 : 140} />}
        {!hasImg && <span className="furrows absolute inset-0" aria-hidden />}
        {/* spine + page edge, so it reads as a book */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-[8px] bg-gradient-to-r from-black/35 via-white/15 to-transparent" />
        <span aria-hidden className="absolute inset-y-1 right-0 w-[3px] bg-gradient-to-l from-white/50 to-transparent" />
        {!printed && (
          <>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 pl-4">
              {book.publisher && <p className="text-[10px] uppercase tracking-[0.14em] text-gold-300 font-semibold mb-1 truncate">{book.publisher}</p>}
              <p className={`font-display font-semibold text-white leading-snug line-clamp-4 ${titleSize}`}>{title}</p>
            </div>
          </>
        )}
        <span className="absolute top-2 left-3 inline-flex items-center gap-1 rounded-full bg-paper/90 backdrop-blur px-1.5 py-1 shadow-sm" title={(t as any)[`cat_${book.category}`]}>
          <c.icon size={14} weight="duotone" style={{ color: TONES[c.tone].fg }} aria-hidden />
          {book.kind === 'article' && <span className="text-[10px] font-bold text-gray-700 pr-0.5">{t.libArticle}</span>}
        </span>
        {book.status === 'hidden' && <span className="absolute top-2 right-2 rounded-full bg-red-600 text-white text-[10px] font-bold px-2 py-1">{t.libHidden}</span>}
      </div>
      {caption && (
        <div className="mt-2 pr-1">
          <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{[book.publisher, book.year].filter(Boolean).join(' · ') || (book.uploadedBy && fmt(t.libBy, { name: book.uploadedBy }))}</p>
        </div>
      )}
    </>
  );
  if (!onClick) return <div className={`${w} shrink-0`}>{Body}</div>;
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick} className={`group ${w} shrink-0 text-left snap-start`} aria-label={title}>
      {Body}
    </motion.button>
  );
};

// ---------- a horizontal shelf ----------
const Shelf: React.FC<{ title: string; icon: PhIcon; tone: Tone; count?: number; action?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, tone, count, action, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: 'smooth' });
  return (
    <section className="relative">
      <div className="flex items-center gap-3 mb-3">
        <IconChip icon={icon} tone={tone} size="sm" />
        <h2 className="text-xl md:text-[1.4rem] font-semibold text-ink flex-1 min-w-0 truncate">{title}</h2>
        {count !== undefined && <span className="text-sm text-gray-500 tabular-nums">{count}</span>}
        {action}
        <div className="hidden md:flex gap-1.5">
          <button onClick={() => scroll(-1)} aria-label="Scroll left" className="w-9 h-9 rounded-full bg-paper border border-gray-200 flex items-center justify-center hover:border-agri-300"><CaretLeft size={18} /></button>
          <button onClick={() => scroll(1)} aria-label="Scroll right" className="w-9 h-9 rounded-full bg-paper border border-gray-200 flex items-center justify-center hover:border-agri-300"><CaretRight size={18} /></button>
        </div>
      </div>
      <div ref={ref} className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 px-4 lg:mx-0 lg:px-0 [scrollbar-width:thin]">
        {children}
      </div>
    </section>
  );
};

// ---------- processing card (book being added) ----------
const STAGES = ['queued', 'download', 'checking', 'reading', 'topic', 'indexing', 'cover', 'ready'];
const QueueCard: React.FC<{ job: Job; lang: Language; onCancel?: () => void }> = ({ job, lang, onCancel }) => {
  const t = getTranslation(lang);
  const pct = Math.round((job.progress || 0) * 100);
  return (
    <div className="w-[124px] md:w-36 shrink-0 snap-start">
      <div className="relative aspect-[2/3] rounded-[14px] overflow-hidden ring-1 ring-black/10 shimmer flex flex-col items-center justify-center text-center p-3">
        {onCancel && (
          <button onClick={onCancel} aria-label={t.libStop} title={t.libStop}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-paper border border-gray-200 text-gray-600 hover:text-red-700 hover:border-red-200 flex items-center justify-center"><X size={16} /></button>
        )}
        <div className="relative w-16 h-16 mb-3">
          <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E6E1D5" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1F4D3A" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-agri-800 tabular-nums">{pct}%</span>
        </div>
        <p className="text-xs font-semibold text-gray-700 leading-tight">{(t as any)[`stage_${job.stage}`] || job.stage}</p>
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-800 line-clamp-2 break-words">{decodeURIComponent((job.name || '').split('/').pop() || '')}</p>
    </div>
  );
};

// ---------- chat with one book or the whole library ----------
interface Msg { id: string; role: 'user' | 'model'; text: string; sources?: Source[]; extractive?: boolean; error?: boolean }

const citeLinks = (text: string) => text.replace(/\[(\d{1,2})\](?!\()/g, '[$1](#cite-$1)');

/** Chat with one book, or with every book when `book` is null. Also used by the Ask screen ("From Farmer Library").
 *  `fill` makes it take its parent's height; `headerAction` adds a button to its header. */
export const BookChat: React.FC<{ lang: Language; book: Book | null; books: Book[]; onOpenBook: (id: string) => void; fill?: boolean; headerAction?: React.ReactNode }> = ({ lang, book, books, onOpenBook, fill, headerAction }) => {
  const t = getTranslation(lang);
  const key = `agriqnet_lib_chat_${book?.id || 'all'}`;
  const hello = (): Msg => ({ id: 'hello', role: 'model', text: book ? fmt(t.libChatHello, { title: pick(book.title, lang) }) : fmt(t.libChatHelloAll, { n: books.length }) });
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try { const s = JSON.parse(localStorage.getItem(key) || 'null'); if (Array.isArray(s) && s.length) return s; } catch { /* ignore */ }
    return [hello()];
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setMsgs((m) => m.map((x) => (x.id === 'hello' ? hello() : x))); /* eslint-disable-next-line */ }, [lang, books.length]);
  // keep the newest message in view by scrolling the message list only (not the whole page)
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(msgs.slice(-40))); } catch { /* quota */ } box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }); }, [msgs, key, busy]);

  const suggestions = useMemo(() => {
    if (book) return pickList(book.questions, lang).slice(0, 4);
    const pool = books.filter((b) => pickList(b.questions, lang).length).slice(0, 8);
    return pool.map((b, i) => pickList(b.questions, lang)[i % 2]).filter(Boolean).slice(0, 4);
  }, [book, books, lang]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    const history = msgs.filter((m) => m.id !== 'hello' && !m.error).slice(-6).map((m) => ({ role: m.role === 'user' ? 'farmer' : 'assistant', text: m.text }));
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const r = await LibraryService.chat(q, lang, book ? [book.id] : null, history);
      setMsgs((m) => [...m, { id: `m${Date.now()}`, role: 'model', text: r.answer, sources: r.sources, extractive: r.extractive }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { id: `e${Date.now()}`, role: 'model', text: e.status === 503 ? t.libUnavailable : t.chatError, error: true }]);
    } finally { setBusy(false); }
  };

  const openSource = (s: Source) => {
    const b = books.find((x) => x.id === s.bookId) || book;
    if (s.kind === 'article' || b?.kind === 'article') { if (s.sourceUrl || b?.sourceUrl) window.open(s.sourceUrl || b!.sourceUrl, '_blank', 'noopener'); return; }
    window.open(`/api/library/books/${s.bookId}/file#page=${s.page}`, '_blank', 'noopener');
  };

  return (
    <div className={`flex flex-col bg-paper rounded-3xl border border-gray-200 shadow-soft overflow-hidden ${fill ? 'h-full' : 'h-[calc(100dvh-230px)] min-h-[440px] lg:h-[calc(100vh-170px)]'}`}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <IconChip icon={book ? BookOpenText : Sparkle} tone={book ? 'soil' : 'plum'} size="sm" />
        <p className="font-semibold text-gray-900 flex-1 min-w-0 truncate">{book ? pick(book.title, lang) : t.libAskAll}</p>
        {headerAction}
        {msgs.length > 1 && (
          <button onClick={() => setMsgs([hello()])} className="text-sm text-gray-500 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 inline-flex items-center gap-1.5">
            <Trash size={16} weight="duotone" /><span className="hidden sm:inline">{t.libNewChat}</span>
          </button>
        )}
      </div>
      <div ref={box} className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5 bg-cream">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] md:max-w-[80%] ${m.role === 'user' ? '' : 'w-full md:w-auto'}`}>
              <div className={`p-4 rounded-2xl shadow-soft ${m.role === 'user' ? 'bg-agri-700 text-white rounded-tr-md' : m.error ? 'bg-red-50 text-red-800 border border-red-100 rounded-tl-md' : 'bg-paper border border-gray-100 text-gray-800 rounded-tl-md'}`}>
                {m.role === 'user' ? <p className="whitespace-pre-wrap text-base leading-relaxed">{m.text}</p> : (
                  <div className="text-base leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_strong]:text-gray-900 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-bold [&_blockquote]:border-l-4 [&_blockquote]:border-gold-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-700">
                    <ReactMarkdown components={{
                      a: ({ href, children }) => {
                        const n = href?.startsWith('#cite-') ? Number(href.slice(6)) : 0;
                        if (!n) return <a href={href} target="_blank" rel="noopener noreferrer" className="text-agri-700 underline">{children}</a>;
                        const s = m.sources?.find((x) => x.n === n);
                        return (
                          <button onClick={() => { if (s) { setFlash(`${m.id}-${n}`); setTimeout(() => setFlash(null), 1600); } }}
                            title={s ? `${s.title} · ${fmt(t.libPage, { n: s.page })}` : ''}
                            className="inline-flex items-center justify-center align-super ml-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-gold-100 text-gold-700 text-[11px] font-bold leading-none hover:bg-gold-300">{n}</button>
                        );
                      },
                    }}>{citeLinks(m.text)}</ReactMarkdown>
                  </div>
                )}
              </div>
              {m.role === 'model' && m.id !== 'hello' && !m.error && (
                <div className="mt-2 space-y-2">
                  <SpeakButton text={m.text.replace(/\[\d+\]/g, '')} lang={lang} size="sm" label />
                  {m.extractive && <p className="text-xs text-gray-500">{t.libOfflineAi}</p>}
                  {!!m.sources?.length && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{t.libSources}</p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {m.sources.map((s) => (
                          <div key={s.n} className={`rounded-xl border bg-paper p-2.5 transition-colors ${flash === `${m.id}-${s.n}` ? 'border-gold-500 bg-gold-100/50' : 'border-gray-200'}`}>
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-gold-100 text-gold-700 text-[11px] font-bold flex items-center justify-center shrink-0">{s.n}</span>
                              <button onClick={() => openSource(s)} className="text-sm font-semibold text-agri-800 hover:underline inline-flex items-center gap-1">
                                <FilePdf size={16} weight="duotone" />{s.kind === 'article' ? t.libOpenSource : fmt(t.libPage, { n: s.page })}
                              </button>
                            </div>
                            {!book && <button onClick={() => onOpenBook(s.bookId)} className="block text-left text-xs font-semibold text-gray-700 mt-1 line-clamp-1 hover:underline">{s.title}</button>}
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{s.snippet}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-3 text-gray-600">
            <span className="w-9 h-9 rounded-full bg-paper border border-gray-200 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-agri-700" /></span>
            <span className="text-sm">{book ? t.libThinking : t.libThinkingAll}</span>
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="p-3 border-t border-gray-100 bg-paper">
        {msgs.length <= 1 && suggestions.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{t.libSuggested}</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {suggestions.map((q, i) => (
                <button key={i} onClick={() => send(q)} className="shrink-0 max-w-[280px] text-left px-3 py-2 rounded-2xl bg-agri-50 border border-agri-100 text-agri-900 text-sm hover:border-agri-300">{q}</button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 bg-gray-50 rounded-full border border-gray-200 focus-within:ring-2 focus-within:ring-agri-200 pl-1.5 pr-1.5">
          <MicButton lang={lang} onText={(txt) => setInput(txt)} />
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder={book ? t.libAskPlaceholder : t.libAskAllPlaceholder} className="flex-1 min-w-0 bg-transparent py-3.5 outline-none text-lg placeholder-gray-400" />
          <button onClick={() => send()} disabled={!input.trim() || busy} aria-label={t.send || 'Send'}
            className="w-11 h-11 rounded-full bg-agri-700 text-white flex items-center justify-center disabled:bg-gray-300 shrink-0"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};

// ---------- one book: about + chat ----------
const BookView: React.FC<{ lang: Language; user: Farmer; book: Book; books: Book[]; onOpenBook: (id: string) => void; onChanged: (hidden: boolean) => void }> = ({ lang, user, book, books, onOpenBook, onChanged }) => {
  const t = getTranslation(lang);
  const c = cat(book.category);
  const [busy, setBusy] = useState(false);
  const summary = pick(book.summary, lang);
  const toggleHide = async () => {
    setBusy(true);
    const hiding = book.status !== 'hidden';
    try { await LibraryService.hide(book.id, hiding); onChanged(hiding); } finally { setBusy(false); }
  };
  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-5">
      <aside className="space-y-4">
        <div className="flex lg:block gap-4 items-start">
          <BookCover book={book} lang={lang} size="md" caption={false} />
          <div className="flex-1 min-w-0 lg:mt-4">
            <h2 className="text-xl md:text-2xl font-semibold text-ink leading-tight">{pick(book.title, lang)}</h2>
            <p className="text-gray-600 mt-1">{[book.publisher, book.year].filter(Boolean).join(' · ')}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: TONES[c.tone].bg, color: TONES[c.tone].fg }}>
                <c.icon size={14} weight="duotone" />{(t as any)[`cat_${book.category}`]}
              </span>
              {book.pages ? <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-gray-100 text-gray-700">{fmt(t.libPages, { n: book.pages })}</span> : null}
              {book.legacyKannada && <span className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: TONES.leaf.bg, color: TONES.leaf.fg }}>{t.libNudiFixed}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={book.kind === 'article' ? book.sourceUrl : book.fileUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-2xl bg-paper border border-gray-200 font-semibold text-agri-800 hover:border-agri-300">
            {book.kind === 'article' ? <LinkSimple size={20} weight="duotone" /> : <FilePdf size={20} weight="duotone" />}
            {book.kind === 'article' ? t.libOpenSource : t.libRead}
          </a>
          {summary && <SpeakButton text={`${pick(book.title, lang)}. ${summary}`} lang={lang} />}
        </div>
        {summary && (
          <div className="bg-paper rounded-2xl border border-gray-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{t.libAbout}</p>
            <p className="text-gray-800 leading-relaxed">{summary}</p>
          </div>
        )}
        {book.headings?.length > 0 && (
          <details className="bg-paper rounded-2xl border border-gray-200 p-4 group">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">{t.libInside}</summary>
            <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc pl-5">{book.headings.slice(0, 12).map((h, i) => <li key={i}>{h}</li>)}</ul>
          </details>
        )}
        {(book.crops.length > 0 || book.topics.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {[...book.crops, ...book.topics].slice(0, 10).map((x) => <span key={x} className="text-xs rounded-full px-2.5 py-1 bg-cream border border-gray-200 text-gray-700">{x}</span>)}
          </div>
        )}
        {book.uploadedBy && <p className="text-sm text-gray-500 flex items-center gap-1.5"><Ico icon={UserCircle} size={18} />{fmt(t.libBy, { name: book.uploadedBy })}</p>}
        {user.role === 'officer' && (
          <button onClick={toggleHide} disabled={busy} className={`w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold border ${book.status === 'hidden' ? 'border-agri-300 text-agri-800' : 'border-red-200 text-red-700 hover:bg-red-50'}`}>
            {book.status === 'hidden' ? <Eye size={20} weight="duotone" /> : <EyeSlash size={20} weight="duotone" />}{book.status === 'hidden' ? t.libUnhide : t.libHide}
          </button>
        )}
      </aside>
      <BookChat key={`${book.id}`} lang={lang} book={book} books={books} onOpenBook={onOpenBook} />
    </div>
  );
};

// ---------- add a book (upload or link) ----------
const AddBook: React.FC<{ lang: Language; onClose: () => void; onOpenBook: (id: string) => void; onQueued: () => void }> = ({ lang, onClose, onOpenBook, onQueued }) => {
  const t = getTranslation(lang);
  const [tab, setTab] = useState<'file' | 'link'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [drag, setDrag] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [dup, setDup] = useState<{ book: Book; reason?: string } | null>(null);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // follow the job until it finishes
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    const id = setTimeout(() => LibraryService.job(job.id).then(setJob).catch(() => {}), 1500);
    return () => clearTimeout(id);
  }, [job]);
  useEffect(() => { if (job?.status === 'duplicate' && job.book) setDup({ book: job.book, reason: job.dupReason || undefined }); }, [job]);

  const pickFile = (f?: File | null) => {
    setErr('');
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setErr(t.libNotPdf); return; }
    if (f.size > MAX_MB * 1048576) { setErr(fmt(t.libTooBig, { mb: MAX_MB })); return; }
    setFile(f);
  };
  const explain = (e: any) => (e.message === 'scanned' ? t.libRejectedScanned : e.status === 503 ? t.libUnavailable : e.status === 413 ? fmt(t.libTooBig, { mb: MAX_MB }) : e.message || t.libFailed);
  const submit = async () => {
    setErr('');
    try {
      let r;
      if (tab === 'file' && file) { setUploadPct(0); r = await LibraryService.upload(file, setUploadPct); }
      else if (tab === 'link' && url.trim()) { setUploadPct(1); r = await LibraryService.addUrl(url.trim()); }
      else return;
      if (r.status === 'duplicate' && r.book) setDup({ book: r.book, reason: r.reason || undefined });
      else if (r.job) { setJob(r.job); onQueued(); }
    } catch (e: any) { setErr(explain(e)); setUploadPct(null); }
  };
  const reset = () => { setFile(null); setUrl(''); setJob(null); setDup(null); setErr(''); setUploadPct(null); };
  const stageIdx = job ? Math.max(0, STAGES.indexOf(job.status === 'ready' ? 'ready' : job.stage)) : 0;
  const busy = uploadPct !== null && !job && !dup && !err;
  const dupWhy = dup?.reason === 'same_file' ? t.libDupSameFile : dup?.reason === 'same_text' ? t.libDupSameText : dup?.reason === 'near_copy' ? t.libDupNear : dup?.reason === 'same_link' ? t.libDupLink : '';
  const rejected = job?.status === 'rejected' ? (job.message.startsWith('not_agri') ? t.libRejectedNotAgri : t.libRejectedScanned) : '';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 34 }}
        className="bg-paper w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] p-5 md:p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-3 text-2xl font-semibold"><IconChip icon={Plus} tone="gold" size="sm" />{t.libAdd}</h2>
          <button onClick={onClose} aria-label={t.close} className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center"><X /></button>
        </div>

        {dup ? (
          <div className="text-center">
            <div className="flex justify-center mb-4"><BookCover book={dup.book} lang={lang} size="sm" caption={false} /></div>
            <p className="text-xl font-semibold text-ink flex items-center justify-center gap-2"><Ico icon={Copy} tone="gold" size={24} />{t.libDuplicate}</p>
            <p className="text-gray-700 mt-1 font-semibold">{pick(dup.book.title, lang)}</p>
            {dupWhy && <p className="text-gray-600 mt-1">{dupWhy}</p>}
            <p className="text-gray-600 mt-1">{t.libDupHint}</p>
            <button onClick={() => onOpenBook(dup.book.id)} className="mt-5 w-full py-4 rounded-2xl bg-agri-700 text-white text-lg font-bold inline-flex items-center justify-center gap-2"><Sparkle size={22} weight="duotone" />{t.libAskBook}</button>
            <button onClick={reset} className="mt-2 w-full py-3 rounded-2xl text-agri-800 font-semibold">{t.libAddAnother}</button>
          </div>
        ) : job ? (
          <div>
            <p className="font-semibold text-gray-900 break-words mb-4">{decodeURIComponent((job.name || '').split('/').pop() || '')}</p>
            <ol className="space-y-2.5">
              {STAGES.filter((s) => s !== 'queued' && (s !== 'download' || job.kind === 'url')).map((s) => {
                const i = STAGES.indexOf(s);
                const done = job.status === 'ready' || i < stageIdx;
                const active = i === stageIdx && ['queued', 'running'].includes(job.status);
                return (
                  <li key={s} className={`flex items-center gap-3 ${done || active ? 'text-gray-900' : 'text-gray-400'}`}>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-agri-700 text-white' : active ? 'bg-gold-500 text-ink' : 'bg-gray-200'}`}>
                      {done ? <CheckCircle size={18} weight="fill" /> : active ? <Loader2 size={15} className="animate-spin" /> : null}
                    </span>
                    <span className="font-medium">{(t as any)[`stage_${s}`]}</span>
                    {active && s === 'indexing' && <span className="ml-auto text-sm tabular-nums text-gray-500">{Math.round(job.progress * 100)}%</span>}
                  </li>
                );
              })}
            </ol>
            {job.status === 'queued' && <p className="mt-4 text-gray-600">{t.stage_queued}…</p>}
            {['queued', 'running'].includes(job.status) && <p className="mt-4 text-sm text-gray-500">{t.libKeepBrowsing}</p>}
            {job.status === 'ready' && job.book && (
              <div className="mt-5 text-center">
                <p className="text-xl font-semibold text-agri-800 flex items-center justify-center gap-2"><Ico icon={CheckCircle} tone="forest" size={26} />{t.libReady}</p>
                <button onClick={() => onOpenBook(job.book!.id)} className="mt-4 w-full py-4 rounded-2xl bg-agri-700 text-white text-lg font-bold">{t.libAskBook}</button>
              </div>
            )}
            {(rejected || job.status === 'failed') && (
              <div className="mt-5 rounded-2xl bg-red-50 border border-red-100 p-4 text-red-800 flex gap-3">
                <XCircle size={24} weight="duotone" className="shrink-0" /><p>{rejected || t.libFailed}</p>
              </div>
            )}
            {!['queued', 'running'].includes(job.status) && <button onClick={reset} className="mt-3 w-full py-3 rounded-2xl text-agri-800 font-semibold">{t.libAddAnother}</button>}
          </div>
        ) : (
          <div>
            <div className="flex bg-gray-100 rounded-2xl p-1 mb-4 font-semibold">
              {(['file', 'link'] as const).map((k) => (
                <button key={k} onClick={() => { setTab(k); setErr(''); }} className={`flex-1 py-2.5 rounded-xl inline-flex items-center justify-center gap-2 ${tab === k ? 'bg-paper shadow-soft text-agri-800' : 'text-gray-500'}`}>
                  {k === 'file' ? <UploadSimple size={18} weight="duotone" /> : <LinkSimple size={18} weight="duotone" />}{k === 'file' ? t.libUploadTab : t.libLinkTab}
                </button>
              ))}
            </div>
            {tab === 'file' ? (
              <button onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
                className={`w-full rounded-3xl border-2 border-dashed p-6 text-center transition-colors ${drag ? 'border-agri-500 bg-agri-50' : 'border-gray-300 hover:border-agri-300 bg-cream'}`}>
                <IconChip icon={file ? FilePdf : UploadSimple} tone={file ? 'rust' : 'gold'} size="lg" className="mx-auto mb-3" />
                {file ? <p className="font-semibold text-gray-900 break-words">{file.name} <span className="text-gray-500 font-normal">({(file.size / 1048576).toFixed(1)} MB)</span></p>
                  : <><p className="text-lg font-semibold text-gray-900">{t.libChoosePdf}</p><p className="text-gray-500">{t.libDropHere}</p></>}
                <p className="text-sm text-gray-500 mt-2">{fmt(t.libPdfOnly, { mb: MAX_MB })}</p>
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
              </button>
            ) : (
              <div>
                <VoiceField lang={lang} value={url} onChange={setUrl} placeholder="https://…" icon={<LinkSimple size={20} />} type="url" />
                <p className="text-sm text-gray-500 mt-2">{t.libLinkHint}</p>
              </div>
            )}
            {busy && tab === 'file' && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1"><span>{t.stage_upload}</span><span className="tabular-nums">{Math.round((uploadPct || 0) * 100)}%</span></div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-agri-700 transition-[width]" style={{ width: `${(uploadPct || 0) * 100}%` }} /></div>
              </div>
            )}
            {err && <p className="mt-3 text-red-700 flex items-start gap-2"><Warning size={20} weight="duotone" className="shrink-0 mt-0.5" />{err}</p>}
            <button onClick={submit} disabled={busy || (tab === 'file' ? !file : !url.trim())}
              className="mt-5 w-full py-4 rounded-2xl bg-agri-700 hover:bg-agri-800 text-white text-lg font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="animate-spin" /> : <Plus size={22} weight="bold" />}{t.libAddBtn}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ---------- the library screen ----------
type Mode = { mode: 'shelf' } | { mode: 'book'; id: string } | { mode: 'ask' };

const Library: React.FC<{ lang: Language; user: Farmer; onBack: () => void }> = ({ lang, user, onBack }) => {
  const t = getTranslation(lang);
  const [books, setBooks] = useState<Book[]>([]);
  const [queue, setQueue] = useState<Job[]>([]);
  const [lastCheck, setLastCheck] = useState<LastCheck | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>(() => (pendingBook ? { mode: 'book', id: pendingBook } : { mode: 'shelf' }));
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [checking, setChecking] = useState(false);
  const officer = user.role === 'officer';
  useEffect(() => { pendingBook = null; }, []);

  const load = () => LibraryService.list(officer && showHidden)
    .then((r) => { setBooks(r.books); setQueue(r.queue); setLastCheck(r.lastCheck); setError(''); })
    .catch((e) => setError(e.status === 503 ? t.libUnavailable : e.message))
    .finally(() => setLoaded(true));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showHidden]);
  // refresh while books are being added (and now and then otherwise)
  useEffect(() => {
    const id = setInterval(load, queue.length ? 4000 : 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [queue.length, showHidden]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [mode]);

  const back = () => (mode.mode === 'shelf' ? onBack() : setMode({ mode: 'shelf' }));
  const openBook = (id: string) => { setAddOpen(false); setMode({ mode: 'book', id }); };

  const q = search.trim().toLowerCase();
  const results = useMemo(() => !q ? [] : books.filter((b) =>
    [...Object.values(b.title), ...Object.values(b.summary), b.publisher, b.year, ...b.crops, ...b.topics, (t as any)[`cat_${b.category}`]]
      .some((s) => String(s || '').toLowerCase().includes(q))), [q, books, t]);
  const featured = useMemo(() => {
    const pool = books.filter((b) => (b.origin === 'seed' || b.origin === 'crawl') && b.coverUrl);
    const list = pool.length ? pool : books;
    return list.length ? list[Math.floor(Date.now() / 864e5) % list.length] : null;
  }, [books]);
  const byCategory = useMemo(() => CATEGORY_ORDER.map((c) => [c, books.filter((b) => b.category === c)] as const).filter(([, l]) => l.length), [books]);
  const mine = books.filter((b) => b.mine);
  const fromFarmers = books.filter((b) => b.origin === 'upload' || b.origin === 'url');
  const newest = [...books].sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);

  const current = mode.mode === 'book' ? books.find((b) => b.id === mode.id) : undefined;

  if (mode.mode === 'book') {
    return (
      <div>
        <ScreenTitle lang={lang} icon="library" title={t.libTitle} onBack={back} />
        {current ? <BookView lang={lang} user={user} book={current} books={books} onOpenBook={openBook} onChanged={(hidden) => { load(); if (hidden && !showHidden) setMode({ mode: 'shelf' }); }} />
          : loaded ? <p className="text-gray-600">{error || t.libNoResults}</p> : <div className="h-96 rounded-3xl shimmer" />}
      </div>
    );
  }
  if (mode.mode === 'ask') {
    return (
      <div>
        <ScreenTitle lang={lang} icon="library" title={t.libAskAll} desc={fmt(t.libBooks, { n: books.length })} onBack={back} />
        <BookChat lang={lang} book={null} books={books} onOpenBook={openBook} />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <ScreenTitle lang={lang} icon="library" title={t.libTitle} desc={t.libSub} onBack={onBack}
        right={books.length ? <span className="hidden sm:inline text-sm font-semibold text-gray-600 bg-paper border border-gray-200 rounded-full px-3 py-1.5">{fmt(t.libBooks, { n: books.length })}</span> : undefined} />

      {/* search + the two main actions */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1"><VoiceField lang={lang} value={search} onChange={setSearch} placeholder={t.libSearch} icon={<MagnifyingGlassIcon size={20} />} /></div>
        <div className="grid grid-cols-2 gap-3 md:flex">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode({ mode: 'ask' })} disabled={!books.length}
            className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-agri-700 text-white font-semibold shadow-soft hover:bg-agri-800 disabled:opacity-50">
            <Sparkle size={20} weight="duotone" className="text-gold-300" />{t.libAskAll}
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setAddOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-gold-500 text-ink font-semibold shadow-soft hover:bg-gold-300">
            <Plus size={20} weight="bold" />{t.libAdd}
          </motion.button>
        </div>
      </div>

      {officer && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button onClick={async () => { setChecking(true); try { await LibraryService.checkSources(); setTimeout(load, 8000); } finally { setTimeout(() => setChecking(false), 8000); } }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-paper border border-gray-200 font-semibold text-agri-800 hover:border-agri-300">
            <ArrowsClockwise size={18} weight="duotone" className={checking ? 'animate-spin' : ''} />{checking ? t.libChecking : t.libCheckSources}
          </button>
          <label className="inline-flex items-center gap-2 text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="w-4 h-4 accent-agri-700" />{t.libShowHidden}
          </label>
          {lastCheck?.checkedAt ? <span className="text-gray-500">{fmt(t.libLastCheck, { date: new Date(lastCheck.checkedAt * 1000).toLocaleDateString(LOCALES[lang]) })}</span> : null}
        </div>
      )}

      {error && !books.length && (
        <div className="rounded-3xl bg-paper border border-gray-200 p-6 text-center">
          <p className="text-gray-700 mb-3">{error}</p>
          <button onClick={load} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-agri-700 text-white font-semibold"><RefreshCw size={18} />{t.retry}</button>
        </div>
      )}
      {!loaded && <div className="grid grid-cols-3 md:grid-cols-6 gap-4">{[...Array(6)].map((_, i) => <div key={i} className="aspect-[2/3] rounded-[14px] shimmer" />)}</div>}

      {q ? (
        <section>
          {results.length ? (
            <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {results.map((b) => <BookCover key={b.id} book={b} lang={lang} size="sm" onClick={() => openBook(b.id)} />)}
            </div>
          ) : <p className="text-gray-600">{t.libNoResults}</p>}
        </section>
      ) : (
        <>
          {/* featured book */}
          {featured && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[28px] bg-agri-800 text-white shadow-lift">
              {featured.coverUrl && <img src={featured.coverUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-25 blur-2xl scale-110" />}
              <div className="furrows absolute inset-0" aria-hidden />
              <div className="relative p-5 md:p-7 flex gap-5 md:gap-7 items-center">
                <div className="hidden min-[440px]:block"><BookCover book={featured} lang={lang} size="md" caption={false} onClick={() => openBook(featured.id)} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-gold-300 text-sm font-semibold uppercase tracking-[0.14em]">{t.libFeatured}</p>
                  <h2 className="font-display text-2xl md:text-[2rem] font-semibold leading-tight mt-1">{pick(featured.title, lang)}</h2>
                  <p className="text-agri-100 mt-1">{[featured.publisher, featured.year, featured.pages ? fmt(t.libPages, { n: featured.pages }) : ''].filter(Boolean).join(' · ')}</p>
                  {pick(featured.summary, lang) && <p className="text-agri-50/90 mt-3 leading-relaxed line-clamp-3 max-w-2xl">{pick(featured.summary, lang)}</p>}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button onClick={() => openBook(featured.id)} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gold-500 text-ink font-bold hover:bg-gold-300"><Sparkle size={20} weight="duotone" />{t.libAskBook}</button>
                    <a href={featured.kind === 'article' ? featured.sourceUrl : featured.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 border border-white/25 font-semibold hover:bg-white/20"><FilePdf size={20} weight="duotone" />{t.libRead}</a>
                    {pick(featured.summary, lang) && <SpeakButton text={`${pick(featured.title, lang)}. ${pick(featured.summary, lang)}`} lang={lang} tone="dark" />}
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {queue.length > 0 && (
            <Shelf title={t.libBeingAdded} icon={ArrowsClockwise} tone="gold" count={queue.length}
              action={officer && queue.some((j) => ['seed', 'crawl', 'legacy'].includes(j.origin || '')) ? (
                <button onClick={() => LibraryService.cancelAutomatic().then(load).catch(() => {})}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50"><X size={16} />{t.libStopAll}</button>
              ) : undefined}>
              {queue.map((j) => <QueueCard key={j.id} job={j} lang={lang}
                onCancel={officer || j.mine ? () => LibraryService.cancelJob(j.id).then(load).catch(() => {}) : undefined} />)}
            </Shelf>
          )}
          {loaded && !books.length && !error && <p className="text-gray-600 bg-paper border border-gray-200 rounded-2xl p-5">{t.libEmpty}</p>}
          {books.length > 8 && (
            <Shelf title={t.libNew} icon={Sparkle} tone="plum">
              {newest.map((b) => <BookCover key={b.id} book={b} lang={lang} onClick={() => openBook(b.id)} />)}
            </Shelf>
          )}
          {mine.length > 0 && (
            <Shelf title={t.libMine} icon={UserCircle} tone="forest" count={mine.length}>
              {mine.map((b) => <BookCover key={b.id} book={b} lang={lang} onClick={() => openBook(b.id)} />)}
            </Shelf>
          )}
          {byCategory.map(([c, list]) => (
            <Shelf key={c} title={(t as any)[`cat_${c}`]} icon={cat(c).icon} tone={cat(c).tone} count={list.length}>
              {list.map((b) => <BookCover key={b.id} book={b} lang={lang} onClick={() => openBook(b.id)} />)}
            </Shelf>
          ))}
          {fromFarmers.length > 0 && (
            <Shelf title={t.libFromFarmers} icon={Leaf} tone="leaf" count={fromFarmers.length}>
              <button onClick={() => setAddOpen(true)} className="w-36 md:w-44 shrink-0 snap-start text-left group">
                <div className="aspect-[2/3] rounded-[14px] border-2 border-dashed border-gray-300 group-hover:border-agri-400 flex flex-col items-center justify-center gap-2 text-agri-800 bg-paper">
                  <IconChip icon={Plus} tone="gold" size="lg" /><span className="font-semibold px-3 text-center">{t.libAdd}</span>
                </div>
              </button>
              {fromFarmers.map((b) => <BookCover key={b.id} book={b} lang={lang} onClick={() => openBook(b.id)} />)}
            </Shelf>
          )}
        </>
      )}

      {/* portal: the screen container is animated (transform), which would trap a fixed overlay */}
      {createPortal(
        <AnimatePresence>
          {addOpen && <AddBook lang={lang} onClose={() => { setAddOpen(false); load(); }} onOpenBook={openBook} onQueued={load} />}
        </AnimatePresence>, document.body)}
    </div>
  );
};

export default Library;
