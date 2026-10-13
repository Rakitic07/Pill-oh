import { useId } from 'react';

/** The Pill-oh mark (capsule + "taken" badge). Sits on the themed `.brand-logo` tile; matches public/logo.svg. */
export function LogoMark({ size = 50 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="58 70 396 386" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#e6dbc0" />
        </linearGradient>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3118" />
          <stop offset="1" stopColor="#17130a" />
        </linearGradient>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cf0b0" />
          <stop offset="1" stopColor="#25a862" />
        </linearGradient>
        <clipPath id={`${id}k`}>
          <rect x="91" y="176" width="290" height="120" rx="60" />
        </clipPath>
      </defs>
      <g transform="rotate(-40 236 236)">
        <g clipPath={`url(#${id}k)`}>
          <rect x="91" y="176" width="145" height="120" fill={`url(#${id}c)`} />
          <rect x="236" y="176" width="145" height="120" fill={`url(#${id}d)`} />
          <rect x="232" y="176" width="8" height="120" fill="#000" opacity="0.18" />
        </g>
        <rect x="121" y="194" width="226" height="20" rx="10" fill="#fff" opacity="0.5" />
      </g>
      <circle cx="360" cy="360" r="86" fill="#fff8e1" />
      <circle cx="360" cy="360" r="70" fill={`url(#${id}m)`} />
      <path d="M326 364l24 24 46-52" stroke="#fff" strokeWidth="22" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
