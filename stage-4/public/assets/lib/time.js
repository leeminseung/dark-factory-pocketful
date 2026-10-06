// Times for people (design.md §5): "Today, 14:32", "Yesterday, 09:10", "3 Oct, 18:05",
// "3 Mar 2025, 18:05", on a 24-hour clock in the browser's time zone.
import { h } from './dom.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n) => String(n).padStart(2, '0');
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate();

export function friendlyTime(iso, now = new Date()) {
  const t = new Date(iso);
  const clock = `${two(t.getHours())}:${two(t.getMinutes())}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(t, now)) return `Today, ${clock}`;
  if (sameDay(t, yesterday)) return `Yesterday, ${clock}`;
  const day = `${t.getDate()} ${MONTHS[t.getMonth()]}`;
  return t.getFullYear() === now.getFullYear() ? `${day}, ${clock}` : `${day} ${t.getFullYear()}, ${clock}`;
}

/** The same words inside a sentence: "Collect by today, 06:51" (design.md §5.6). */
export function timeInSentence(iso, now = new Date()) {
  const words = friendlyTime(iso, now);
  return /^(Today|Yesterday),/.test(words) ? words[0].toLowerCase() + words.slice(1) : words;
}

/** A <time> element for `iso`, showing `text` (default: the friendly form). */
export const timeEl = (iso, text = friendlyTime(iso)) => h('time', { datetime: iso }, text);

/** "14:32", for "Updated 14:32". */
export const clockNow = () => {
  const t = new Date();
  return `${two(t.getHours())}:${two(t.getMinutes())}`;
};
