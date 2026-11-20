// Motion tokens and presets (design-system/agriqnet/MASTER.md §5).
// Rule: motion only for feedback and state change, plus the living sky on Home.
// Transform/opacity only; exits are faster than entrances; reduced motion is honoured by
// <MotionConfig reducedMotion> in App.tsx and the data-motion="reduce" CSS switch.
import type { Transition, Variants } from 'motion/react';

export const DUR = { fast: 0.12, base: 0.2, slow: 0.32, hero: 0.6 } as const;
export const EASE = { standard: [0.22, 1, 0.36, 1] as const, exit: [0.4, 0, 1, 1] as const };
export const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 36 };

/** How the user moved: deeper into a screen, back out, or sideways between bottom-bar tabs. */
export type NavDir = 'forward' | 'back' | 'tab';

/** Screen change: forward slides in from the right, back from the left, tabs crossfade. */
export const screenVariants: Variants = {
  enter: (d: NavDir) => ({ opacity: 0, x: d === 'forward' ? 28 : d === 'back' ? -28 : 0, y: d === 'tab' ? 6 : 0 }),
  center: { opacity: 1, x: 0, y: 0, transition: { duration: DUR.base, ease: EASE.standard } },
  exit: (d: NavDir) => ({ opacity: 0, x: d === 'forward' ? -16 : d === 'back' ? 16 : 0, transition: { duration: DUR.fast, ease: EASE.exit } }),
};

/** Short settle for first screens (language gate, sign-in): visible at once, no long stagger. */
export const settle = { initial: { opacity: 0.6, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: EASE.standard } };

/** List reveal: ≤ 60 ms apart, at most 6 items animated. */
export const listItem = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(i, 5) * 0.06, duration: DUR.slow, ease: EASE.standard } });

/** Small error shake for a wrong input (≤ 2 cycles, 6px). */
export const shake = { x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.32 } };
