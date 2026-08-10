import { useEffect } from 'react';
import { useAppStore } from '../store/store';
import { selectIsReadOnly, selectViewedFortnight } from '../store/selectors';
import { effectiveBoardDay } from '../domain/fortnight';
import { todayLocal } from '../store/clock';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Global keyboard shortcuts, active anywhere in the app: arrows/Home/End
 * move the selected day, T jumps to today, N/Shift+N open the todo/note
 * compose form, S opens Standup.
 *
 * Escape is deliberately NOT handled here — each overlay/form owns its own
 * (Modal.tsx; TodoForm/NoteForm), which is what lets it work while focus is
 * inside a text field without this hook's isTypingTarget guard getting in
 * the way.
 *
 * Every shortcut bails while focus is in a text-entry control, and while
 * any [role=dialog] is mounted (a future command palette adds its own
 * always-available ⌘K case ahead of that check, the same way this file's
 * own guard is structured).
 */
export function useShortcuts({ onOpenStandup }: { onOpenStandup: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      // The tape's own onKeyDown already moved the day and called
      // preventDefault() when focus is on a day button -- without this,
      // arrowing from the tape would move the selection twice.
      if (e.defaultPrevented) return;

      const state = useAppStore.getState();
      const fn = selectViewedFortnight(state);

      switch (e.key) {
        case 's':
        case 'S':
          e.preventDefault();
          onOpenStandup();
          return;

        case 'n':
        case 'N':
          // The store's own setComposeIntent already refuses this while
          // read-only (INV-9) -- checking here too avoids even attempting
          // the call, and keeps this hook's intent legible on its own.
          if (selectIsReadOnly(state)) return;
          e.preventDefault();
          state.setComposeIntent(e.shiftKey ? 'note' : 'todo');
          return;

        case 't':
        case 'T': {
          const activeId = state.activeFortnightId;
          if (!activeId) return;
          const active = state.fortnights.find((f) => f.id === activeId);
          if (!active) return;
          const today = effectiveBoardDay(active, todayLocal());
          if (!today) return; // fortnight has ended; no valid board day for "today"
          e.preventDefault();
          // Mirrors RemindersPanel's onPick: jumping to today only makes
          // sense on the active fortnight, so switch to it first if the
          // user is currently viewing a past (read-only) one.
          if (state.viewedFortnightId !== activeId) state.viewFortnight(activeId);
          state.selectDay(today);
          return;
        }

        case 'ArrowRight':
        case 'ArrowLeft':
        case 'Home':
        case 'End': {
          if (!fn) return;
          const idx = fn.days.indexOf(state.selectedDay ?? fn.days[0]);
          let nextIdx: number | null = null;
          if (e.key === 'ArrowRight' && idx < fn.days.length - 1) nextIdx = idx + 1;
          else if (e.key === 'ArrowLeft' && idx > 0) nextIdx = idx - 1;
          else if (e.key === 'Home') nextIdx = 0;
          else if (e.key === 'End') nextIdx = fn.days.length - 1;
          if (nextIdx === null) return;
          e.preventDefault();
          state.selectDay(fn.days[nextIdx]);
          return;
        }

        default:
          return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenStandup]);
}
