import type { KeyboardEvent } from "react";
export function dialogKeyboard(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key === "Escape") { event.stopPropagation(); close(); }
  if (event.key !== "Tab") return;
  const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')).filter((element) => element.getClientRects().length);
  const first = elements[0], last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
