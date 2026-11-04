// One icon language for the whole app: Phosphor two-tone (duotone) icons on soft coloured
// chips. Each part of the app has its own colour so farmers learn "blue = weather",
// "green = crops", "gold = fertilizer", "rust = pests", "red = alerts", "plum = ask".
import React from 'react';
import type { Icon as PhIcon } from '@phosphor-icons/react';
import {
  House, CloudSun, Sun, Cloud, CloudFog, CloudRain, Snowflake, CloudLightning, Plant, Flask, Camera, BellRinging,
  ChatCircleDots, MapTrifold, Bug, MapPin, Drop, Waves, Mountains, Tree, Ruler, Tractor, Barn, HouseLine,
  ClipboardText, Hourglass, Info, SealCheck, UserCircle, Megaphone, ShieldCheck, FirstAidKit, DeviceMobile, IdentificationBadge,
  EnvelopeSimple, Trash, BookOpen, Warning, CheckCircle, XCircle, PencilSimple, Leaf, Users, Siren,
  Images, ArrowCounterClockwise, PaperPlaneTilt, Question, SpeakerHigh, Microphone, MagnifyingGlass, Trash as TrashIcon,
  Books, BookOpenText, FilePdf, UploadSimple, LinkSimple, Eye, EyeSlash, ArrowsClockwise, Sparkle, CaretLeft, CaretRight, Plus, Copy, Cow, Fish, Carrot, Lightbulb, Scroll, Newspaper,
} from '@phosphor-icons/react';

export type Tone = 'forest' | 'sky' | 'leaf' | 'gold' | 'rust' | 'red' | 'plum' | 'soil' | 'stone';
export const TONES: Record<Tone, { bg: string; fg: string }> = {
  forest: { bg: '#DCE8DF', fg: '#1F4D3A' },
  sky: { bg: '#DDEAF0', fg: '#2A6585' },
  leaf: { bg: '#E1EDD5', fg: '#3D6B22' },
  gold: { bg: '#F6EDCB', fg: '#8A6D12' },
  rust: { bg: '#F5E1D3', fg: '#9A4A1E' },
  red: { bg: '#F7DEDB', fg: '#A3271D' },
  plum: { bg: '#EBE2EE', fg: '#5E3A6E' },
  soil: { bg: '#EDE3D7', fg: '#6B4F3A' },
  stone: { bg: '#F2EFE7', fg: '#5E574B' },
};

/** Icon in a rounded colour chip. */
export const IconChip: React.FC<{ icon: PhIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }> = ({ icon: I, tone = 'forest', size = 'md', className = '' }) => {
  const dim = { sm: 'w-9 h-9 rounded-[10px]', md: 'w-12 h-12 rounded-[14px]', lg: 'w-14 h-14 rounded-2xl', xl: 'w-20 h-20 rounded-[22px]' }[size];
  const px = { sm: 20, md: 26, lg: 30, xl: 44 }[size];
  return (
    <span aria-hidden className={`inline-flex items-center justify-center shrink-0 ${dim} ${className}`} style={{ background: TONES[tone].bg, color: TONES[tone].fg }}>
      <I size={px} weight="duotone" />
    </span>
  );
};

/** Bare duotone icon (inline with text). */
export const Ico: React.FC<{ icon: PhIcon; size?: number; className?: string; tone?: Tone }> = ({ icon: I, size = 20, className = '', tone }) => (
  <I aria-hidden size={size} weight="duotone" className={`shrink-0 ${className}`} style={tone ? { color: TONES[tone].fg } : undefined} />
);

/** Screens and the icon + colour each one uses everywhere (tiles, menu, titles). */
export const SCREEN: Record<string, { icon: PhIcon; tone: Tone }> = {
  home: { icon: House, tone: 'forest' },
  weather: { icon: CloudSun, tone: 'sky' },
  crops: { icon: Plant, tone: 'leaf' },
  fertilizer: { icon: Flask, tone: 'gold' },
  pest_check: { icon: Camera, tone: 'rust' },
  alerts: { icon: BellRinging, tone: 'red' },
  chat: { icon: ChatCircleDots, tone: 'plum' },
  network: { icon: MapTrifold, tone: 'forest' },
  library: { icon: Books, tone: 'soil' },
};

/** WMO weather code -> icon */
export const weatherIcon = (code: number): PhIcon =>
  code === 0 ? Sun : code <= 3 ? CloudSun : code <= 48 ? CloudFog : code <= 67 ? CloudRain : code <= 77 ? Snowflake : code <= 82 ? CloudRain : CloudLightning;

/** Weekly-advice tips come with a topic word from the server (older ones with an emoji). */
const TIP: [RegExp, PhIcon, Tone][] = [
  [/pest|bug|insect|🐛|🦗|🐞|🪲/i, Bug, 'rust'],
  [/disease|fung|🦠|🍄/i, ShieldCheck, 'red'],
  [/water|irrigat|rain|💧|🌧|🚿/i, Drop, 'sky'],
  [/weather|heat|sun|☀|🌡|⛈|🌦/i, CloudSun, 'sky'],
  [/fertil|nutri|manure|compost|🧪|💩/i, Flask, 'gold'],
  [/harvest|market|sell|price|💰|🧺/i, Barn, 'soil'],
  [/sow|seed|plant|crop|🌱|🌾|🌿/i, Plant, 'leaf'],
];
export function tipIcon(key: string): { icon: PhIcon; tone: Tone } {
  for (const [re, icon, tone] of TIP) if (re.test(key || '')) return { icon, tone };
  return { icon: Leaf, tone: 'leaf' };
}

export {
  House, CloudSun, Plant, Flask, Camera, BellRinging, ChatCircleDots, MapTrifold, Bug, MapPin, Drop, Waves, Mountains, Tree,
  Ruler, Tractor, Barn, HouseLine, ClipboardText, Hourglass, Info, SealCheck, Megaphone, ShieldCheck, FirstAidKit,
  DeviceMobile, IdentificationBadge, EnvelopeSimple, Trash, BookOpen, Warning, CheckCircle, XCircle, PencilSimple, Leaf,
  Users, Siren, CloudRain, Cloud, CloudLightning, Sun, Camera as CameraIcon, Images, ArrowCounterClockwise, PaperPlaneTilt, Question, SpeakerHigh, Microphone, MagnifyingGlass as MagnifyingGlassIcon, UserCircle,
  Books, BookOpenText, FilePdf, UploadSimple, LinkSimple, Eye, EyeSlash, ArrowsClockwise, Sparkle, CaretLeft, CaretRight, Plus, Copy, Cow, Fish, Carrot, Lightbulb, Scroll, Newspaper,
};
