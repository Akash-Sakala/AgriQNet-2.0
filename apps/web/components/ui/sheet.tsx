// shadcn/ui Sheet (Radix Dialog), styled with AgriQNet tokens: bottom sheet on phones,
// centred dialog from `sm` up. Focus is trapped, Esc and the backdrop close it.
import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export const SheetContent: React.FC<{
  title: React.ReactNode; description?: React.ReactNode; closeLabel: string; children: React.ReactNode; className?: string; side?: 'bottom' | 'right';
}> = ({ title, description, closeLabel, children, className, side = 'bottom' }) => (
  <Dialog.Portal>
    <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-ink/45" />
    <Dialog.Content
      className={cn(
        'sheet-content fixed z-50 bg-paper shadow-lift outline-hidden flex flex-col',
        side === 'bottom'
          ? 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[28px] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-[28px]'
          : 'inset-y-0 right-0 w-80 max-w-[85vw]',
        className,
      )}
      data-side={side}
    >
      {side === 'bottom' && <span aria-hidden className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-gray-300 sm:hidden" />}
      <div className="flex items-start gap-3 px-5 pt-4 pb-2">
        <div className="min-w-0 flex-1">
          <Dialog.Title className="font-display text-2xl font-semibold text-ink leading-tight">{title}</Dialog.Title>
          {description ? <Dialog.Description className="text-gray-600 mt-1">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
        </div>
        <Dialog.Close aria-label={closeLabel} className="shrink-0 w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-700">
          <X size={22} weight="bold" aria-hidden />
        </Dialog.Close>
      </div>
      <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
    </Dialog.Content>
  </Dialog.Portal>
);
