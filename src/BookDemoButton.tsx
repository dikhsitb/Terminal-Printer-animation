import React from "react";

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Slide geometry (matches the button's Tailwind sizing) ───
// Button: h-12 w-44 (176px) rounded-[14px]; knob inset 4px (top/left/bottom-1).
const BTN_W = 176; //  w-44
const KNOB_INSET = 4; //  left-1 / top-1 / bottom-1
const KNOB_REST_W = 36; //  w-9
const KNOB_MAX_W = BTN_W - KNOB_INSET * 2; //  calc(100% - 0.5rem) = 168
const MAX_GROW = KNOB_MAX_W - KNOB_REST_W; //  132
const TRIGGER_GROW = MAX_GROW * 0.82; //  ~108 — slide far enough to fire

export type BookDemoVariant =
  | "lime"
  | "sky"
  | "rose"
  | "amber"
  | "emerald"
  | "violet"
  | "orange"
  | "magenta";

interface BookDemoButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BookDemoVariant;
}

const variantStyles: Record<
  BookDemoVariant,
  { from: string; to: string; dot: string }
> = {
  lime: { from: "#d6f54a", to: "#c5ea2c", dot: "#0f0f0f" },
  sky: { from: "#a5e0ff", to: "#6bc8f5", dot: "#0a1f3a" },
  rose: { from: "#ffc4d3", to: "#f590a5", dot: "#3a0a1f" },
  amber: { from: "#ffd66e", to: "#f5a82e", dot: "#3a210a" },
  emerald: { from: "#a8efc5", to: "#5fd49a", dot: "#0a2a1a" },
  violet: { from: "#d4b9ff", to: "#a07bf5", dot: "#1f0a3a" },
  orange: { from: "#ffb88a", to: "#f57a3a", dot: "#3a190a" },
  magenta: { from: "#f5a8e0", to: "#e060c5", dot: "#3a0a2a" },
};

const DoubleChevron = ({ index, color }: { index: number; color: string }) => {
  const base = index * 0.12;
  const dots: { cx: number; cy: number; d: number }[] = [
    { cx: 2, cy: 2, d: 0 },
    { cx: 5, cy: 5, d: 0.05 },
    { cx: 8, cy: 8, d: 0.1 },
    { cx: 5, cy: 11, d: 0.15 },
    { cx: 2, cy: 14, d: 0.2 },
    { cx: 6, cy: 2, d: 0.05 },
    { cx: 9, cy: 5, d: 0.1 },
    { cx: 12, cy: 8, d: 0.15 },
    { cx: 9, cy: 11, d: 0.2 },
    { cx: 6, cy: 14, d: 0.25 },
  ];
  return (
    <svg
      width="14"
      height="16"
      viewBox="0 0 14 16"
      className="shrink-0 overflow-visible"
    >
      <g fill={color}>
        {dots.map((p, i) => (
          <circle
            key={i}
            cx={p.cx}
            cy={p.cy}
            r="1"
            className="bd-dot"
            style={{ animationDelay: `${base + p.d}s` }}
          />
        ))}
      </g>
    </svg>
  );
};

const BookDemoButton = React.forwardRef<HTMLButtonElement, BookDemoButtonProps>(
  ({ className, children, variant = "lime", onClick, ...props }, ref) => {
    const v = variantStyles[variant];

    // Slide-to-print: the green knob is dragged rightward; crossing the
    // threshold fires onClick (the print trigger). Released early → snaps back.
    const btnRef = React.useRef<HTMLButtonElement | null>(null);
    const [knobW, setKnobW] = React.useState(KNOB_REST_W);
    const [dragging, setDragging] = React.useState(false);
    const [slid, setSlid] = React.useState(false);
    const drag = React.useRef(false);
    const startX = React.useRef(0);
    const startW = React.useRef(KNOB_REST_W);
    // Local px per screen px — the whole stage is CSS-scaled on mobile, so we
    // normalize pointer deltas against the button's rendered width.
    const ratio = React.useRef(1);
    const fired = React.useRef(false);

    const setRefs = (node: HTMLButtonElement | null) => {
      btnRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    };

    const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
      if (fired.current) return;
      const rect = btnRef.current?.getBoundingClientRect();
      ratio.current = rect && rect.width > 0 ? BTN_W / rect.width : 1;
      drag.current = true;
      setDragging(true);
      startX.current = e.clientX;
      startW.current = knobW;
      e.currentTarget.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!drag.current || fired.current) return;
      const delta = (e.clientX - startX.current) * ratio.current;
      const nw = Math.max(KNOB_REST_W, Math.min(KNOB_MAX_W, startW.current + delta));
      setKnobW(nw);
      if (nw - KNOB_REST_W >= TRIGGER_GROW) {
        drag.current = false;
        fired.current = true;
        setDragging(false);
        setSlid(true);
        setKnobW(KNOB_MAX_W);
        window.setTimeout(() => onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>), 450);
      }
    };

    const onPointerUp = () => {
      if (!drag.current) return;
      drag.current = false;
      setDragging(false);
      setKnobW(KNOB_REST_W); // snap back to rest
    };

    return (
      <button
        ref={setRefs}
        type="button"
        className={cn(
          "group/btn relative inline-flex h-12 w-44 rounded-[14px] overflow-hidden transition-transform active:scale-[0.98]",
          className,
        )}
        style={{
          background: "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.18)",
        }}
        {...props}
      >
        <style>{`
          @keyframes bd-dot-wave {
            0%, 70%, 100% { opacity: 0.25; transform: scale(0.85); }
            35% { opacity: 1; transform: scale(1); }
          }
          .bd-dot {
            transform-box: fill-box;
            transform-origin: center;
            animation: bd-dot-wave 1.4s ease-in-out infinite;
          }
        `}</style>

        <span className="absolute inset-y-0 left-10 right-0 flex items-center justify-center text-white font-medium text-[15px] tracking-tight pointer-events-none">
          {children || "Book a demo"}
        </span>

        <span
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            "absolute top-1 left-1 bottom-1 z-10 flex items-center justify-start overflow-hidden rounded-[10px] pl-3 pr-2.5 gap-2.5 select-none touch-none",
            !dragging && "transition-[width] duration-300 ease-[cubic-bezier(0.25,0,0.35,1)]",
          )}
          style={{
            width: knobW,
            cursor: fired.current ? "default" : dragging ? "grabbing" : "grab",
            background: `linear-gradient(180deg, ${v.from} 0%, ${v.to} 100%)`,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)",
          }}
        >
          {slid ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="mx-auto shrink-0">
              <path d="M5 10.5l3.5 3.5L15 6.5" stroke={v.dot} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            Array.from({ length: 9 }, (_, i) => (
              <DoubleChevron key={i} index={i} color={v.dot} />
            ))
          )}
        </span>
      </button>
    );
  },
);

BookDemoButton.displayName = "BookDemoButton";

export default BookDemoButton;
