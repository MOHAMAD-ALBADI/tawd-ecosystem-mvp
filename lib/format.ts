export const num = (n: number) => Math.round(n).toLocaleString("en-US");

export const omr = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.ع.`;

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const cls = (...xs: (string | number | false | null | undefined)[]) => xs.filter((x) => typeof x === "string" && x).join(" ");
