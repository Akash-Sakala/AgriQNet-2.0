// In-app camera for pest photos: a framing guide, a darkness warning and a large shutter.
// Falls back to the phone's own camera (input capture) when getUserMedia is not available or blocked.
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Images, SunDim } from '@phosphor-icons/react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';

export const canUseCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export const CameraCapture: React.FC<{ lang: Language; onCapture: (file: File) => void; onClose: () => void; onGallery: () => void; onFallback: () => void }> = ({ lang, onCapture, onClose, onGallery, onFallback }) => {
  const t = getTranslation(lang) as any;
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [dark, setDark] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let live = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (!live) { s.getTracks().forEach((tr) => tr.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
      })
      .catch((e) => { if (e?.name === 'NotAllowedError') setBlocked(true); else onFallback(); });
    // light check: average brightness of a small sample, twice a second
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const id = window.setInterval(() => {
      const v = video.current;
      if (!v || !ctx || v.readyState < 2) return;
      ctx.drawImage(v, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      setDark(sum / (d.length / 4) < 55);
    }, 500);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { live = false; window.clearInterval(id); window.removeEventListener('keydown', onKey); stream.current?.getTracks().forEach((tr) => tr.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    setFlash(true);
    c.toBlob((b) => { if (b) onCapture(new File([b], `pest-${Date.now()}.jpg`, { type: 'image/jpeg' })); }, 'image/jpeg', 0.9);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={t.takePhoto}>
      <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      {flash && <motion.div className="absolute inset-0 bg-white" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.25 }} />}
      {/* framing guide */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
        <div className="w-[72vmin] h-[72vmin] max-w-[420px] max-h-[420px] rounded-[28px] border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>
      <div className="relative flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="flex-1 text-white text-lg font-semibold drop-shadow">{t.frameHint}</p>
        <button type="button" onClick={onClose} aria-label={t.close} className="w-12 h-12 shrink-0 rounded-full bg-black/50 text-white flex items-center justify-center"><X size={26} aria-hidden /></button>
      </div>
      <div className="relative mt-auto p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {(dark || blocked) && (
          <p role="status" className="mb-4 mx-auto max-w-sm flex items-center gap-2 bg-gold-300 text-ink font-semibold rounded-2xl px-4 py-3">
            <SunDim size={24} weight="duotone" aria-hidden />{blocked ? t.cameraBlocked : t.tooDark}
          </p>
        )}
        <div className="flex items-center justify-between max-w-sm mx-auto">
          <button type="button" onClick={onGallery} aria-label={t.choosePhoto} className="w-14 h-14 rounded-2xl bg-black/50 text-white flex items-center justify-center"><Images size={28} aria-hidden /></button>
          <button type="button" onClick={shoot} disabled={blocked} aria-label={t.capture}
            className="w-[76px] h-[76px] rounded-full bg-white ring-4 ring-white/40 ring-offset-4 ring-offset-transparent active:scale-95 transition-transform disabled:opacity-40" />
          <span className="w-14" />
        </div>
      </div>
    </div>
  );
};
