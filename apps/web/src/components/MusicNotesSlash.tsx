import { useId } from "react";

const NOTES =
  "M215.38,14.54a12,12,0,0,0-10.29-2.18l-128,32A12,12,0,0,0,68,56V159.35A40,40,0,1,0,92,196V113.37l104-26v40A40,40,0,1,0,220,164V24A12,12,0,0,0,215.38,14.54ZM52,212a16,16,0,1,1,16-16A16,16,0,0,1,52,212ZM92,88.63V65.37l104-26V62.63ZM180,180a16,16,0,1,1,16-16A16,16,0,0,1,180,180Z";

export function MusicNotesSlash({ size = 20 }: { size?: number }) {
  const mask = `music-slash-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <mask id={mask}>
        <rect width="256" height="256" fill="#fff" />
        <line x1="40" y1="32" x2="216" y2="224" stroke="#000" strokeWidth="36" strokeLinecap="round" />
      </mask>
      <g mask={`url(#${mask})`}>
        <path d={NOTES} transform="translate(128 128) scale(0.88) translate(-150 -106)" />
      </g>
      <line x1="40" y1="32" x2="216" y2="224" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
    </svg>
  );
}
