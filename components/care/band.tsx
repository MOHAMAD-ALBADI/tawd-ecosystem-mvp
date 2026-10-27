"use client";
import type { Reading } from "@/types";

/* Concept visual of the TAWD Band development prototype, drawn in SVG. Not a manufactured product. */
export function BandVisual({ reading, connected, history, flagged }: { reading?: Reading; connected: boolean; history: number[]; flagged?: boolean }) {
  const bars = history.slice(-14);
  const max = Math.max(1, ...bars);
  const min = Math.min(...bars, max);
  return (
    <svg viewBox="0 0 240 360" className="h-[300px] w-auto" role="img" aria-label="TAWD Band concept">
      <defs>
        <linearGradient id="strap" x1="0" x2="1">
          <stop offset="0" stopColor="#161616" />
          <stop offset="0.5" stopColor="#1f1f1f" />
          <stop offset="1" stopColor="#161616" />
        </linearGradient>
      </defs>
      <rect x="78" y="0" width="84" height="360" rx="30" fill="url(#strap)" stroke="rgba(255,255,255,0.06)" />
      {[24, 40, 56, 300, 316, 332].map((y) => <line key={y} x1="92" x2="148" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />)}
      <rect x="44" y="96" width="152" height="168" rx="42" fill="#222222" stroke="rgba(255,255,255,0.16)" />
      <rect x="196" y="160" width="6" height="34" rx="3" fill="#2c2c2c" />
      <rect x="58" y="110" width="124" height="140" rx="32" fill="#0a0c0b" stroke="rgba(92, 157, 232,0.18)" />
      {connected && reading ? (
        <>
          <text x="120" y="140" textAnchor="middle" fill="#6e6e6e" fontSize="9" fontFamily="Manrope Variable, sans-serif" letterSpacing="2">TAWD</text>
          <text x="120" y="178" textAnchor="middle" fill={flagged ? "#e07f74" : "#ffffff"} fontSize="34" fontWeight="600" fontFamily="Manrope Variable, sans-serif">{reading.hr}</text>
          <text x="120" y="193" textAnchor="middle" fill="#8a8a8a" fontSize="9" fontFamily="Manrope Variable, sans-serif">BPM · SpO₂ {reading.spo2}%</text>
          {bars.map((v, i) => {
            const h = 4 + ((v - min) / Math.max(1, max - min)) * 18;
            return <rect key={i} x={76 + i * 6.4} y={232 - h} width="3.6" height={h} rx="1.5" fill={flagged && i === bars.length - 1 ? "#e07f74" : "#5c9de8"} opacity={0.35 + (i / bars.length) * 0.65} />;
          })}
        </>
      ) : (
        <text x="120" y="184" textAnchor="middle" fill="#6e6e6e" fontSize="11" fontFamily="IBM Plex Sans Arabic, sans-serif">غير متصل</text>
      )}
      <circle cx="120" cy="121" r="2.2" fill={connected ? "#7cc39a" : "#6e6e6e"} />
    </svg>
  );
}
