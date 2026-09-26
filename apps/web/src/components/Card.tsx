import type { Card as CardData, CardColor } from "@uno/engine";
import { cardLabel } from "@uno/engine";
import { type ReactNode, memo, useId } from "react";

const FILL: Record<CardColor, string> = {
  red: "var(--uno-red)",
  yellow: "var(--uno-yellow)",
  green: "var(--uno-green)",
  blue: "var(--uno-blue)",
  wild: "var(--uno-black)",
};

const INK = "#141414";
const PAPER = "#fbfbf8";
const TYPE = { fontFamily: "var(--font)", fontStyle: "italic", fontWeight: 900 } as const;

interface Paint {
  fill: string;
  stroke: string;
  sw: number;
}
type Shapes = (p: Paint) => ReactNode;

function Printed({ shapes, fill, outline, shadow = 2.4 }: { shapes: Shapes; fill: string; outline: number; shadow?: number }) {
  return (
    <g>
      {shadow > 0 && <g transform={`translate(${shadow} ${shadow})`}>{shapes({ fill: INK, stroke: INK, sw: outline })}</g>}
      <g>{shapes({ fill: INK, stroke: INK, sw: outline })}</g>
      <g>{shapes({ fill, stroke: "none", sw: 0 })}</g>
    </g>
  );
}

interface CardProps {
  card?: CardData | null;
  back?: boolean;
  className?: string;
  title?: string;
}

export const Card = memo(function Card({ card, back, className, title }: CardProps) {
  const uid = useId().replace(/:/g, "");
  const label = back || !card ? "Face-down card" : cardLabel(card);
  return (
    <svg
      className={className}
      viewBox="0 0 100 150"
      role="img"
      aria-label={title ?? label}
      style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
    >
      <defs>
        <radialGradient id={`${uid}-sheen`} cx="30%" cy="20%" r="90%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.14" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="150" rx="9" fill={PAPER} />
      {back || !card ? <Back uid={uid} /> : <Face card={card} uid={uid} />}
      <rect x="5" y="5" width="90" height="140" rx="6" fill={`url(#${uid}-sheen)`} pointerEvents="none" />
      <rect x="0.5" y="0.5" width="99" height="149" rx="8.6" fill="none" stroke="#00000024" />
    </svg>
  );
});

const OVAL = { cx: 50, cy: 75, rx: 35, ry: 60, rotate: 32 };

function Oval({ fill = PAPER }: { fill?: string }) {
  return <ellipse cx={OVAL.cx} cy={OVAL.cy} rx={OVAL.rx} ry={OVAL.ry} fill={fill} transform={`rotate(${OVAL.rotate} 50 75)`} />;
}

function Back({ uid }: { uid: string }) {
  return (
    <g>
      <rect x="5" y="5" width="90" height="140" rx="6" fill={INK} />
      <Oval fill="var(--uno-red)" />
      <g transform="rotate(-24 50 76)">
        <Printed
          outline={3}
          shadow={2.2}
          fill="var(--uno-yellow)"
          shapes={(p) => (
            <text
              x="50"
              y="86"
              textAnchor="middle"
              fontSize="29"
              fill={p.fill}
              stroke={p.stroke}
              strokeWidth={p.sw}
              strokeLinejoin="round"
              style={{ ...TYPE, fontStretch: "112%", letterSpacing: "-0.5px" }}
              id={`${uid}-logo`}
            >
              UNO
            </text>
          )}
        />
      </g>
    </g>
  );
}

export function UnoLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 132 72" role="img" aria-label="UNO" style={{ display: "block", overflow: "visible" }}>
      <g transform="rotate(-9 66 36)">
        <ellipse cx="66" cy="36" rx="60" ry="29" fill="var(--uno-red)" stroke={PAPER} strokeWidth="3.5" />
        <Printed
          outline={3.2}
          shadow={2.2}
          fill="var(--uno-yellow)"
          shapes={(p) => (
            <text
              x="66"
              y="48"
              textAnchor="middle"
              fontSize="36"
              fill={p.fill}
              stroke={p.stroke}
              strokeWidth={p.sw}
              strokeLinejoin="round"
              style={{ ...TYPE, fontStretch: "112%", letterSpacing: "-0.5px" }}
            >
              UNO
            </text>
          )}
        />
      </g>
    </svg>
  );
}

function Face({ card, uid }: { card: CardData; uid: string }) {
  const fill = FILL[card.color];
  return (
    <g>
      <rect x="5" y="5" width="90" height="140" rx="6" fill={fill} />
      {card.value === "wild" ? <WildOval uid={uid} /> : <Oval />}
      <Center card={card} fill={fill} />
      <Corner card={card} uid={uid} />
      <g transform="rotate(180 50 75)">
        <Corner card={card} uid={`${uid}b`} />
      </g>
    </g>
  );
}

function Center({ card, fill }: { card: CardData; fill: string }) {
  switch (card.value) {
    case "skip":
      return (
        <g transform="translate(50 75) scale(1.25)">
          <Printed outline={4.2} shadow={2} fill={fill} shapes={skipShapes} />
        </g>
      );
    case "reverse":
      return (
        <g transform="translate(50 75) scale(1.08)">
          <Printed outline={4} shadow={2} fill={fill} shapes={reverseShapes} />
        </g>
      );
    case "draw2":
      return (
        <g transform="translate(50 76)">
          <MiniCard x={-20} y={-25} fill={fill} />
          <MiniCard x={-2} y={-9} fill={fill} />
        </g>
      );
    case "draw4":
      return (
        <g transform="translate(50 76) rotate(-8)">
          <MiniCard x={-27} y={-10} fill="var(--uno-blue)" />
          <MiniCard x={-15} y={-27} fill="var(--uno-green)" />
          <MiniCard x={-3} y={-7} fill="var(--uno-yellow)" />
          <MiniCard x={9} y={-24} fill="var(--uno-red)" />
        </g>
      );
    case "wild":
      return null;
    default:
      return <Numeral value={card.value} fill={fill} />;
  }
}

function Numeral({ value, fill }: { value: string; fill: string }) {
  const underline = value === "6" || value === "9";
  return (
    <Printed
      outline={4.4}
      shadow={2.6}
      fill={fill}
      shapes={(p) => (
        <g>
          <text
            x="50"
            y={underline ? 98 : 101}
            textAnchor="middle"
            fontSize="78"
            fill={p.fill}
            stroke={p.stroke}
            strokeWidth={p.sw}
            strokeLinejoin="round"
            style={{ ...TYPE, fontStretch: "104%" }}
          >
            {value}
          </text>
          {underline && (
            <rect
              x="-14"
              y="0"
              width="28"
              height="6"
              rx="1.5"
              fill={p.fill}
              stroke={p.stroke}
              strokeWidth={p.sw}
              strokeLinejoin="round"
              transform="translate(48 106) skewX(-14)"
            />
          )}
        </g>
      )}
    />
  );
}

const skipShapes: Shapes = (p) => (
  <g fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} strokeLinejoin="round">
    <path fillRule="evenodd" d="M0,-17 A17,17 0 1 1 0,17 A17,17 0 1 1 0,-17 Z M0,-10.5 A10.5,10.5 0 1 0 0,10.5 A10.5,10.5 0 1 0 0,-10.5 Z" />
    <rect x="-3.4" y="-14" width="6.8" height="28" rx="1.2" transform="rotate(45)" />
  </g>
);

const ARROW = "M -14,-3.3 L 3,-3.3 L 3,-9.2 L 15,0 L 3,9.2 L 3,3.3 L -14,3.3 Z";
const reverseShapes: Shapes = (p) => (
  <g transform="rotate(-45)" fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} strokeLinejoin="round">
    <path d={ARROW} transform="translate(3 -9.6)" />
    <path d={ARROW} transform="translate(-3 9.6) rotate(180)" />
  </g>
);

function MiniCard({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <Printed
      outline={2.6}
      shadow={1.6}
      fill={PAPER}
      shapes={(p) => (
        <g>
          <rect x={x} y={y} width="20" height="30" rx="3.2" fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} strokeLinejoin="round" />
          {p.stroke === "none" && <rect x={x + 2.2} y={y + 2.2} width="15.6" height="25.6" rx="2" fill={fill} />}
        </g>
      )}
    />
  );
}

function Corner({ card, uid }: { card: CardData; uid: string }) {
  const x = 16.5;
  const y = 24;
  switch (card.value) {
    case "skip":
      return (
        <g transform={`translate(${x} ${y - 6.5}) scale(0.44)`}>
          <Printed outline={4.6} shadow={0} fill={PAPER} shapes={skipShapes} />
        </g>
      );
    case "reverse":
      return (
        <g transform={`translate(${x} ${y - 6.5}) scale(0.44)`}>
          <Printed outline={4.6} shadow={0} fill={PAPER} shapes={reverseShapes} />
        </g>
      );
    case "wild":
      return <WildOval uid={`${uid}c`} cx={x} cy={y - 7} rx={6.2} ry={10.4} outline={1.2} />;
    default: {
      const text = card.value === "draw2" ? "+2" : card.value === "draw4" ? "+4" : card.value;
      const wide = text.length > 1;
      const underline = card.value === "6" || card.value === "9";
      return (
        <Printed
          outline={2.6}
          shadow={0}
          fill={PAPER}
          shapes={(p) => (
            <g>
              <text
                x={wide ? x + 1.5 : x}
                y={y}
                textAnchor="middle"
                fontSize={wide ? 15.5 : 20}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={p.sw}
                strokeLinejoin="round"
                style={{ ...TYPE, fontStretch: wide ? "86%" : "100%", letterSpacing: wide ? "-0.6px" : 0 }}
              >
                {text}
              </text>
              {underline && <rect x={x - 4.5} y={y + 2.6} width="9" height="2.2" rx="0.8" fill={p.fill} stroke={p.stroke} strokeWidth={p.sw * 0.6} />}
            </g>
          )}
        />
      );
    }
  }
}

function WildOval({
  uid,
  cx = OVAL.cx,
  cy = OVAL.cy,
  rx = OVAL.rx,
  ry = OVAL.ry,
  outline = 0,
}: {
  uid: string;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  outline?: number;
}) {
  const clip = `${uid}-wild-${cx}`;
  const t = `rotate(${OVAL.rotate} ${cx} ${cy})`;
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={t} />
        </clipPath>
      </defs>
      {outline > 0 && <ellipse cx={cx} cy={cy} rx={rx + outline} ry={ry + outline} transform={t} fill={PAPER} />}
      <g clipPath={`url(#${clip})`}>
        <g transform={t}>
          <rect x={cx - rx} y={cy - ry} width={rx} height={ry} fill="var(--uno-red)" />
          <rect x={cx} y={cy - ry} width={rx} height={ry} fill="var(--uno-blue)" />
          <rect x={cx - rx} y={cy} width={rx} height={ry} fill="var(--uno-yellow)" />
          <rect x={cx} y={cy} width={rx} height={ry} fill="var(--uno-green)" />
        </g>
      </g>
    </g>
  );
}
