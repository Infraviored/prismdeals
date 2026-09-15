/**
 * ScreenActions — the contract for per-screen action bars.
 *
 * Every screen must export a single `actions` list of this shape.
 * The renderer (`ScreenActionBar`) iterates it and renders exactly one button
 * per entry that passes its `visible` predicate.
 *
 * Rules:
 * - No screen may render a button outside of this list.
 * - A button may only appear once. If a button is absent from `actions`, it
 *   cannot appear anywhere on that screen.
 * - `visible` defaults to `true`; set it to `false` to suppress conditionally
 *   without leaving an empty slot.
 */

import type { LucideIcon } from 'lucide-react';
import type { TranslationPath } from '../i18n/translations';

export interface ScreenAction {
  /** Machine id — must be unique within a screen's action list. */
  id: string;
  /** Translation key suffix to look up via `t()`. */
  labelKey: TranslationPath;
  /** Lucide icon to show left of the label. */
  icon: LucideIcon;
  /** Called when the user taps/clicks the button. */
  handler: () => void;
  /** Whether this action is currently visible. Defaults to true. */
  visible?: boolean;
  /** Whether the button is disabled (spinner etc.). Defaults to false. */
  disabled?: boolean;
  /** Visual variant forwarded to the Button primitive. */
  variant?: 'primary' | 'secondary' | 'action-emerald' | 'action-sky' | 'action-indigo' | 'danger' | 'badge' | 'icon';
}
