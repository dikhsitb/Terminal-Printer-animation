import React from "react";

interface ShinyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

// Self-contained shiny button (no shadcn/cn deps). A translucent bar sweeps
// diagonally across on hover. Styled with a greenish tint to match the theme.
const ShinyButton = React.forwardRef<HTMLButtonElement, ShinyButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="shiny-wrapper">
        <style>{`
          .shiny-wrapper {
            position: relative;
            display: inline-block;
            overflow: hidden;
            border-radius: 8px;
          }
          .shiny-wrapper .shiny-mask {
            display: block;
            position: absolute;
            inset: 0;
            background: rgba(255, 255, 255, 0.6);
            transform: translateX(-100%) rotate(45deg);
            pointer-events: none;
            z-index: 10;
          }
          .shiny-wrapper:hover .shiny-mask {
            animation: shiny-mask 0.5s ease-out;
          }
          @keyframes shiny-mask {
            0% { transform: translateX(-100%) rotate(45deg); }
            100% { transform: translateX(100%) rotate(45deg); }
          }
          .shiny-btn {
            position: relative;
            z-index: 0;
            font-family: 'Satoshi', sans-serif;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            border: 1px solid #6ee7b7;
            background: linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%);
            color: #047857;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: -0.2px;
            padding: 10px 28px;
            cursor: pointer;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(5,150,105,0.14);
            transition: transform 0.12s ease, background 0.2s ease, box-shadow 0.2s ease;
          }
          .shiny-btn:hover {
            background: linear-gradient(180deg, #d1fae5 0%, #a7f3d0 100%);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 6px rgba(5,150,105,0.2);
          }
          .shiny-btn:active { transform: scale(0.97); }
        `}</style>
        <button
          ref={ref}
          className={["shiny-btn", className].filter(Boolean).join(" ")}
          {...props}
        >
          {children ?? "Hover Me"}
        </button>
        <span className="shiny-mask" />
      </div>
    );
  },
);

ShinyButton.displayName = "ShinyButton";

export default ShinyButton;
