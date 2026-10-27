/* Public assets are referenced through this so the app also works under a sub-path (GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const asset = (p: string) => `${BASE_PATH}${p}`;
