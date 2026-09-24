/** Display formatting shared by the dashboard pages (presentation only). */

/** Hours and minutes of an ISO timestamp, or an en dash when missing. */
export function formatTime(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
