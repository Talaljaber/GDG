/** The short URL under the QR on H1 (`SCREENS.md` H1): VITE_PUBLIC_SHORT_URL, else this site. */
export function shortUrl(): string {
  return import.meta.env.VITE_PUBLIC_SHORT_URL || window.location.origin;
}

/** "gdg-booth.example" from "https://gdg-booth.example/". */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
