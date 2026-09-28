import type { SVGProps } from "react";

export function BrazilFlag(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 10 7" fill="none" aria-hidden="true" {...props}>
      <rect width="10" height="7" fill="#009C3B" />
      <path d="M5 0.5L9.5 3.5L5 6.5L0.5 3.5L5 0.5Z" fill="#FFDF00" />
      <circle cx="5" cy="3.5" r="1.2" fill="#002776" />
    </svg>
  );
}

export function MinasGeraisFlag(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 10 7" fill="none" aria-hidden="true" {...props}>
      <rect width="10" height="7" fill="#FFFFFF" />
      <path d="M5 1.2L8.8 6L1.2 6L5 1.2Z" fill="#CC0000" />
    </svg>
  );
}

export function TennisBallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" fill="#C4CF03" stroke="#3D5200" strokeWidth="1.5" />
      <path
        d="M2 12 Q6 8 10 12 Q14 16 18 12 Q20 10 22 12"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M2 12 Q6 16 10 12 Q14 8 18 12 Q20 14 22 12"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
