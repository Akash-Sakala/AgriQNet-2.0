// Catches a crash inside one screen so the rest of the app (header, bottom bar) keeps working.
// The farmer sees a plain message in their language with Try again / Go to Home, never a blank page.
import React from 'react';
import { ArrowCounterClockwise as RotateCcw, House as HomeIcon } from '@phosphor-icons/react';
import { Language } from '../../types';
import { getTranslation } from '../../utils/translations';
import { IconChip, Warning } from './Icons';
import { SpeakButton } from './Kit';

interface Props { lang: Language; name: string; onHome?: () => void; children: React.ReactNode }
interface State { error: Error | null; attempt: number }

export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[AgriQNet] "${this.props.name}" screen crashed:`, error, info.componentStack);
  }

  retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  render() {
    if (!this.state.error) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    const t = getTranslation(this.props.lang);
    return (
      <div role="alert" className="max-w-xl mx-auto mt-6 bg-paper border border-gray-200 rounded-[28px] shadow-soft p-6 md:p-8 text-center">
        <IconChip icon={Warning} tone="rust" size="lg" className="mx-auto mb-4" />
        <h1 className="text-2xl font-semibold text-ink">{t.screenError}</h1>
        <p className="text-lg text-gray-700 mt-2">{t.screenErrorHint}</p>
        <div className="mt-3 flex justify-center">
          <SpeakButton text={`${t.screenError} ${t.screenErrorHint}`} lang={this.props.lang} label />
        </div>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" onClick={this.retry}
            className="min-h-[52px] px-6 rounded-2xl bg-agri-700 hover:bg-agri-800 text-white text-lg font-bold flex items-center justify-center gap-2">
            <RotateCcw size={20} aria-hidden />{t.retry}
          </button>
          {this.props.onHome && (
            <button type="button" onClick={() => { this.setState({ error: null }); this.props.onHome?.(); }}
              className="min-h-[52px] px-6 rounded-2xl bg-paper border-2 border-agri-700 text-agri-800 text-lg font-bold flex items-center justify-center gap-2">
              <HomeIcon size={20} aria-hidden />{t.goHome}
            </button>
          )}
        </div>
      </div>
    );
  }
}
