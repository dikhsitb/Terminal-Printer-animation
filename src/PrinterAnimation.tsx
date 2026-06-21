import { useCallback, useRef, useLayoutEffect, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'
import receiptBgUrl from './assets/receipt_bg.svg'
import billBgUrl from './assets/Bill.svg'
import receiptDividerUrl from './assets/receipt_divider.svg'
import BookDemoButton from './BookDemoButton'
import ShinyButton from './ShinyButton'
import printSoundUrl from './assets/print-sound.mp3'

// Receipt background variants — swap RECEIPT_BG to A/B compare the two assets.
const RECEIPT_BACKGROUNDS = { bill: billBgUrl, classic: receiptBgUrl }
const RECEIPT_BG = RECEIPT_BACKGROUNDS.bill

/* ─────────────────────────────────────────────────────────────
 * STORYBOARD
 *
 *  IDLE      printer at top (40px page padding), receipt peeking
 *            ~13px below slot — text + slide button below
 *
 *  PRINTING  (slide completes)
 *    0ms     text fades out, print sound starts
 *  200ms     receipt y: -488 → 0 over 1500ms power2.out
 * 1700ms     receipt fully out
 * 1900ms     gentle float loop ±8px / 2s begins
 *
 *  DONE      receipt floating, "Print Again" link below
 * ───────────────────────────────────────────────────────────── */

type Phase = 'idle' | 'printing' | 'done'

// ─── Timing ────────────────────────────────────────────────
const T = {
  printerDelay:  0.06,   // s
  feedDelay:     0.3,    // s — printing starts 0.3s after the sound begins
  feedDuration:  3.5,    // s — receipt travel
  contentShift:  1.5,    // s — content/button area slide (independent of print speed)
  floatY:        8,      // px
  floatDuration: 2.0,    // s
}

// ─── Dimensions (derived from Figma @ 460px printer width) ─
const PW     = 460
const BODY_H = Math.round(460 * 273 / 915)  // 137

// Receipt (Figma: 742px wide at left=88, top=202 in printer frame)
// The inner canvas is rendered at native size then scaled by R_SCALE. Its height
// is driven by the receipt content (restaurant bill) — the bg SVG uses
// preserveAspectRatio="none" so it stretches to fill the taller canvas.
const R_TOP     = Math.round(202 * 460 / 915)  // 102
const R_LEFT    = Math.round(88  * 460 / 915)  // 44
const R_W       = Math.round(742 * 460 / 915)  // 373
const R_INNER_W = 741
const R_INNER_H = 1290
const R_SCALE   = R_W / R_INNER_W                 // ≈ 0.5034
const R_H       = Math.round(R_INNER_H * R_SCALE) // ≈ 649

// Initial translateY: receipt mostly inside printer (only its bottom edge peeks
// ~13px below the slot). Keep the printed bottom just below the printer body,
// then shift up by the full receipt height so the rest stays hidden above.
const RECEIPT_INIT_Y = (BODY_H + 13) - (R_TOP + R_H)  // ≈ -601

// Content area margin-top in each phase (leaves room for receipt when out)
const CONTENT_MT_IDLE = 300
// Place done-phase content fully below the printed receipt:
// receipt spans R_TOP→R_TOP+R_H within the assembly; add float + gap, subtract printer body height
const CONTENT_MT_DONE = R_TOP + R_H - BODY_H + T.floatY + 24  // 533

// ─── Colors ────────────────────────────────────────────────
const PAGE_BG = '#ffffff'
// Dot-mesh page texture: gray-950 @ 5%, 1px dots on a 10px grid. Uses a
// viewport-fixed attachment so the pattern aligns across the page and the
// receipt mask (keeping the mask seamless as the receipt prints).
const DOT_BG: React.CSSProperties = {
  background: PAGE_BG,
  backgroundImage: 'radial-gradient(rgba(3,7,18,0.05) 1px, transparent 0)',
  backgroundSize: '10px 10px',
  backgroundAttachment: 'fixed',
}

const SATOSHI: React.CSSProperties = { fontFamily: "'Satoshi', sans-serif" }

// ─── Responsive scaling ────────────────────────────────────
// The whole stage is authored at PW=460. On narrow viewports (phones) that
// overflows and looks off-center, so we scale the entire assembly down to fit
// the available width while keeping every internal proportion (and the GSAP /
// Framer transforms) intact. Capped at 1 so desktop is pixel-identical.
const STAGE_SIDE_GUTTER = 16 // px of breathing room on each side

function useStageScale() {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const compute = () => {
      const avail = window.innerWidth - STAGE_SIDE_GUTTER * 2
      setScale(Math.min(1, avail / PW))
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('orientationchange', compute)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('orientationchange', compute)
    }
  }, [])
  return scale
}

// ─── Sound ─────────────────────────────────────────────────
const PRINT_VOLUME = 0.35   // reduced playback volume
const FADE_OUT      = 1.0   // s — gentle fade as the printer stops
const SOUND_START   = 0.0   // s — skip leading silence in the clip (raise if it lags)

// Preload a single element at module load so the first play has no
// fetch/decode lag (a fresh `new Audio()` per print buffers before it plays).
const printAudio: HTMLAudioElement | null =
  typeof Audio !== 'undefined' ? new Audio(printSoundUrl) : null
if (printAudio) {
  printAudio.preload = 'auto'
  printAudio.load()
}

// Token guards against stale fade loops when printing is replayed quickly.
let fadeToken = 0

function playPrintSound(duration = 1.7) {
  if (!printAudio) return
  try {
    fadeToken += 1
    const token = fadeToken

    printAudio.currentTime = SOUND_START
    printAudio.volume = PRINT_VOLUME
    void printAudio.play().catch(() => { /* autoplay blocked until user gesture */ })

    // When the feed finishes, fade the volume to 0 over FADE_OUT, then stop.
    window.setTimeout(() => {
      if (token !== fadeToken) return
      const start = performance.now()
      const from  = printAudio.volume
      const tick = () => {
        if (token !== fadeToken) return
        const t = (performance.now() - start) / (FADE_OUT * 1000)
        if (t >= 1) {
          printAudio.pause()
          printAudio.currentTime = SOUND_START
          return
        }
        printAudio.volume = from * (1 - t)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, duration * 1000)
  } catch { /* audio not available */ }
}

// ─── Divider line ───────────────────────────────────────────
function Divider() {
  return (
    <div style={{ width: '100%', height: 1, position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: '-1.53px 0 0 0' }}>
        <img src={receiptDividerUrl} alt="" style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

// ─── Restaurant receipt (renders at Figma's 741×1290 then scaled) ─
function ReceiptContent() {
  const S = SATOSHI
  return (
    <div style={{ position: 'relative', width: R_INNER_W, height: R_INNER_H }}>
      <img src={RECEIPT_BG} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

      {/* Header */}
      <div style={{ position: 'absolute', left: 24.55, top: 62.01, width: 691.9, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ ...S, fontWeight: 500, fontSize: 31.786, lineHeight: '43.703px', letterSpacing: '-0.31px', color: '#181b25' }}>
          Receipt — ORD-2026-001
        </p>
        <div style={{ background: 'white', border: '1.53px solid #e1e4ea', borderRadius: 6, padding: '6.14px 12.27px' }}>
          <p style={{ ...S, fontWeight: 500, fontSize: 19.866, lineHeight: '26.492px', letterSpacing: '-0.2px', color: '#525866', whiteSpace: 'nowrap' }}>
            Jun 19, 2026
          </p>
        </div>
      </div>

      {/* Customer / Restaurant card */}
      <div style={{ position: 'absolute', left: 24.55, top: 123.38, width: 691.9, background: 'linear-gradient(174.4deg, rgba(129,255,138,0.18) 25%, rgba(100,150,94,0.18) 106%)', borderRadius: 18.41, padding: 24.55, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12.27, width: 300 }}>
          <p style={{ ...S, fontWeight: 500, fontSize: 19.866, lineHeight: '27.813px', letterSpacing: '0px', color: '#374151' }}>Customer</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6.14 }}>
            <p style={{ ...S, fontWeight: 500, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#181b25' }}>Dikhsit Bhattarai</p>
            <p style={{ ...S, fontWeight: 400, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#525866' }}>Table 08</p>
            <p style={{ ...S, fontWeight: 400, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#525866' }}>Server: Alex</p>
            <p style={{ ...S, fontWeight: 500, fontSize: 19.866, lineHeight: '26.492px', letterSpacing: '-0.31px', color: '#525866' }}>Order #1001</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12.27, width: 330, alignItems: 'flex-end' }}>
          <p style={{ ...S, fontWeight: 500, fontSize: 19.866, lineHeight: '26.492px', letterSpacing: '1.53px', color: '#525866' }}>Restaurant</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6.14, alignItems: 'flex-end' }}>
            <p style={{ ...S, fontWeight: 500, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#181b25' }}>The Urban Fork</p>
            <p style={{ ...S, fontWeight: 400, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#525866' }}>MG Road, Bangalore</p>
            <p style={{ ...S, fontWeight: 500, fontSize: 19.866, lineHeight: '26.492px', letterSpacing: '-0.31px', color: '#525866', whiteSpace: 'nowrap' }}>GSTIN: 29ABCDE1234F1Z5</p>
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 378, width: 691.9, display: 'flex', flexDirection: 'column', gap: 12.27 }}>
        <p style={{ ...S, fontWeight: 500, fontSize: 19.866, lineHeight: '27.813px', letterSpacing: '0px', color: '#374151' }}>Items</p>
        {([['Margherita Pizza (Large)','₹650'],['Grilled Chicken Steak','₹850'],['Garlic Bread','₹220'],['Fresh Lime Soda ×2','₹300'],['Chocolate Brownie','₹280']] as [string,string][]).map(([l,v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', height: 34.051 }}>
            <p style={{ ...S, fontWeight: 400, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#525866' }}>{l}</p>
            <p style={{ ...S, fontWeight: 500, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#181b25' }}>{v}</p>
          </div>
        ))}
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', height: 34.051 }}>
          <p style={{ ...S, fontWeight: 500, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#181b25' }}>Subtotal</p>
          <p style={{ ...S, fontWeight: 700, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#181b25' }}>₹2,300</p>
        </div>
        <Divider />
      </div>

      {/* Taxes & Charges */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 728, width: 691.9, display: 'flex', flexDirection: 'column', gap: 12.27 }}>
        <p style={{ ...S, fontWeight: 500, fontSize: 19.866, lineHeight: '27.813px', letterSpacing: '0px', color: '#374151' }}>Taxes &amp; Charges</p>
        {([['GST (5%)','₹115'],['Service Charge (10%)','₹230'],['Packaging','₹50']] as [string,string][]).map(([l,v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', height: 34.051 }}>
            <p style={{ ...S, fontWeight: 400, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#525866' }}>{l}</p>
            <p style={{ ...S, fontWeight: 500, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#181b25' }}>{v}</p>
          </div>
        ))}
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', height: 34.051 }}>
          <p style={{ ...S, fontWeight: 500, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#181b25' }}>Total Charges</p>
          <p style={{ ...S, fontWeight: 700, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#181b25' }}>₹395</p>
        </div>
        <Divider />
      </div>

      {/* Payment */}
      <div style={{ position: 'absolute', left: 24.55, top: 988, width: 691.9, background: 'linear-gradient(174.4deg, rgba(129,255,138,0.18) 25%, rgba(100,150,94,0.18) 106%)', borderRadius: 18.41, padding: 24.55, display: 'flex', flexDirection: 'column', gap: 12.27 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
          <p style={{ ...S, fontWeight: 500, fontSize: 31.786, lineHeight: '43.703px', letterSpacing: '-0.31px', color: '#181b25' }}>Grand Total</p>
          <p style={{ ...S, fontWeight: 700, fontSize: 31.786, lineHeight: '43.703px', letterSpacing: '-0.31px', color: '#181b25' }}>₹2,695</p>
        </div>
        <Divider />
        {([['Amount Paid','₹2,695'],['Payment Method','UPI'],['Status','Paid ✓']] as [string,string][]).map(([l,v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', height: 34.051 }}>
            <p style={{ ...S, fontWeight: 400, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#525866' }}>{l}</p>
            <p style={{ ...S, fontWeight: 500, fontSize: 23.84, lineHeight: '34.051px', letterSpacing: '-0.31px', color: '#181b25' }}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Slide-to-print control replaced by the click-to-print <BookDemoButton /> (see ./BookDemoButton).

// ─── Main export ────────────────────────────────────────────
export function PrinterAnimation() {
  const [phase, setPhase] = useState<Phase>('idle')
  const receiptRef = useRef<HTMLDivElement>(null)
  const tlRef      = useRef<gsap.core.Timeline | null>(null)

  // Responsive scale + a measured height so the scaled stage collapses its
  // box (no dead space below) and stays centered on phones.
  const scale = useStageScale()
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageHeight, setStageHeight] = useState<number | null>(null)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setStageHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Tuck the receipt into the printer before first paint, then reveal it only
  // after the printer has animated in (so the printer loads before the bill).
  useLayoutEffect(() => {
    const el = receiptRef.current
    if (!el) return
    gsap.set(el, { y: RECEIPT_INIT_Y, autoAlpha: 0 })
    gsap.to(el, { autoAlpha: 1, duration: 0.45, ease: 'power2.out', delay: T.printerDelay + 0.2 })
  }, [])

  // Tuck the receipt back into the printer and feed it out again. Reusable by
  // both the initial "Click to Print" and the "Print Again" controls.
  const runPrint = useCallback(() => {
    const el = receiptRef.current
    if (!el) return
    setPhase('printing')
    playPrintSound(T.feedDelay + T.feedDuration + 0.1)

    tlRef.current?.kill()
    gsap.set(el, { y: RECEIPT_INIT_Y })

    // Feed the receipt out, then leave it at rest (no floating loop).
    const tl = gsap.timeline()
    tl.to(el, { y: 0, duration: T.feedDuration, ease: 'power2.out', delay: T.feedDelay, onComplete: () => setPhase('done') })
    tlRef.current = tl
  }, [])

  const startPrint = useCallback(() => {
    if (phase !== 'idle') return
    runPrint()
  }, [phase, runPrint])

  // "Print Again" restarts the print directly (skips the idle "Click to Print").
  const replay = runPrint

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 72, paddingBottom: 60,
      overflowX: 'hidden',
      ...DOT_BG,
    }}>

    {/* Scaled-footprint wrapper: collapses to the stage's scaled height and is
        centered on the page; the inner stage scales around its top-center. */}
    <div style={{ width: PW, height: stageHeight != null ? stageHeight * scale : undefined }}>
    <div ref={stageRef} style={{
      width: PW,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      transform: `scale(${scale})`, transformOrigin: 'top center',
    }}>

      {/* ── Printer + receipt assembly ─────────────────────── */}
      <div style={{ position: 'relative', width: PW, height: BODY_H, flexShrink: 0 }}>

        {/* Lavender mask: hides receipt overflow above printer top */}
        <div style={{
          position: 'absolute', top: -600, left: -120,
          width: PW + 240, height: 600,
          ...DOT_BG, zIndex: 15, pointerEvents: 'none',
        }} />

        {/* Receipt: z:10, starts tucked into the printer (only bottom scallop peeks).
            Initial transform/opacity are set inline so the first paint is already
            correct — otherwise the full bill would flash before the printer loads. */}
        <div ref={receiptRef} style={{
          position: 'absolute', top: R_TOP, left: R_LEFT,
          width: R_W, height: R_H, zIndex: 10,
          transform: `translateY(${RECEIPT_INIT_Y}px)`,
          opacity: 0, visibility: 'hidden',
          filter: 'drop-shadow(0 12px 32px rgba(0,0,0,0.13)) drop-shadow(0 3px 8px rgba(0,0,0,0.07))',
        }}>
          <div style={{ width: R_INNER_W, height: R_INNER_H, transform: `scale(${R_SCALE})`, transformOrigin: 'top left' }}>
            <ReceiptContent />
          </div>
        </div>

        {/* Printer body: z:20, covers receipt origin → slot illusion */}
        <motion.div
          className="printer-shine"
          initial={{ opacity: 0, y: 28, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22, delay: T.printerDelay }}
          style={{
            position: 'absolute', top: 0, left: 0, zIndex: 20, lineHeight: 0,
            filter: 'drop-shadow(0 24px 52px rgba(110,210,130,0.30)) drop-shadow(0 6px 16px rgba(0,0,0,0.10))',
          }}
        >
          <style>{`
            .printer-shine-bar {
              opacity: 0;
              transform-box: fill-box;
              transform-origin: center;
            }
            .printer-shine:hover .printer-shine-bar {
              animation: printer-shine-sweep 0.7s ease-out;
            }
            @keyframes printer-shine-sweep {
              0%   { opacity: 1; transform: translateX(-380px) rotate(20deg); }
              100% { opacity: 1; transform: translateX(1180px) rotate(20deg); }
            }
          `}</style>
          <svg width={PW} height={BODY_H} viewBox="0 0 915 273" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
            <defs>
              <linearGradient id="printerBodyGrad" x1="0" y1="0" x2="0" y2="273" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#e9ffe9" />
                <stop offset="38%"  stopColor="#d2f5d8" />
                <stop offset="100%" stopColor="#b5e8bf" />
              </linearGradient>
              <radialGradient id="printerSatin" cx="50%" cy="18%" rx="39%" ry="29%">
                <stop offset="0%"  stopColor="rgba(255,255,255,0.60)" />
                <stop offset="36%" stopColor="rgba(255,255,255,0.26)" />
                <stop offset="68%" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
              <linearGradient id="printerEdge" x1="0" y1="0" x2="915" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="rgba(0,0,0,0.13)" />
                <stop offset="5%"   stopColor="rgba(0,0,0,0)" />
                <stop offset="95%"  stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.13)" />
              </linearGradient>
              <linearGradient id="printerShine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="white" stopOpacity="0" />
                <stop offset="50%"  stopColor="white" stopOpacity="0.55" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <clipPath id="printerClip">
                <path d="M6.453 37.318C14.594 15.499 38.726 0.953984 61.536 0.895984C108.174 0.776984 154.813 0.878974 201.452 0.885974L480.59 0.896991L730.13 0.891986C771.31 0.888986 812.84 0.670002 854.03 0.959002C860.55 1.005 867.79 2.18498 873.9 4.43398C888.87 9.83798 900.99 21.132 907.42 35.692C915.2 47.969 914.97 85.885 913.63 100.47C913.68 113.99 914.87 170.736 912.15 180.64C910.61 203.777 911.67 245.055 894.29 261.033C879.54 274.596 856.57 272.256 837.84 272.04L837.83 256.793L837.82 245.209L79.047 245.216L79.05 256.901L79.092 272.008C66.206 272.223 52.641 273.578 40.869 268.495C13.146 256.739 13.016 222.537 8.55298 196.177C-2.92702 174.888 1.21802 120.221 1.30902 94.199C0.445022 78.162 -0.093996 51.577 6.453 37.318Z" />
              </clipPath>
            </defs>
            <path d="M6.453 37.318C14.594 15.499 38.726 0.953984 61.536 0.895984C108.174 0.776984 154.813 0.878974 201.452 0.885974L480.59 0.896991L730.13 0.891986C771.31 0.888986 812.84 0.670002 854.03 0.959002C860.55 1.005 867.79 2.18498 873.9 4.43398C888.87 9.83798 900.99 21.132 907.42 35.692C915.2 47.969 914.97 85.885 913.63 100.47C913.68 113.99 914.87 170.736 912.15 180.64C910.61 203.777 911.67 245.055 894.29 261.033C879.54 274.596 856.57 272.256 837.84 272.04L837.83 256.793L837.82 245.209L79.047 245.216L79.05 256.901L79.092 272.008C66.206 272.223 52.641 273.578 40.869 268.495C13.146 256.739 13.016 222.537 8.55298 196.177C-2.92702 174.888 1.21802 120.221 1.30902 94.199C0.445022 78.162 -0.093996 51.577 6.453 37.318Z" fill="url(#printerBodyGrad)" />
            <path d="M6.453 37.318C14.594 15.499 38.726 0.953984 61.536 0.895984C108.174 0.776984 154.813 0.878974 201.452 0.885974L480.59 0.896991L730.13 0.891986C771.31 0.888986 812.84 0.670002 854.03 0.959002C860.55 1.005 867.79 2.18498 873.9 4.43398C888.87 9.83798 900.99 21.132 907.42 35.692C915.2 47.969 914.97 85.885 913.63 100.47C913.68 113.99 914.87 170.736 912.15 180.64C910.61 203.777 911.67 245.055 894.29 261.033C879.54 274.596 856.57 272.256 837.84 272.04L837.83 256.793L837.82 245.209L79.047 245.216L79.05 256.901L79.092 272.008C66.206 272.223 52.641 273.578 40.869 268.495C13.146 256.739 13.016 222.537 8.55298 196.177C-2.92702 174.888 1.21802 120.221 1.30902 94.199C0.445022 78.162 -0.093996 51.577 6.453 37.318Z" fill="url(#printerSatin)" />
            <path d="M6.453 37.318C14.594 15.499 38.726 0.953984 61.536 0.895984C108.174 0.776984 154.813 0.878974 201.452 0.885974L480.59 0.896991L730.13 0.891986C771.31 0.888986 812.84 0.670002 854.03 0.959002C860.55 1.005 867.79 2.18498 873.9 4.43398C888.87 9.83798 900.99 21.132 907.42 35.692C915.2 47.969 914.97 85.885 913.63 100.47C913.68 113.99 914.87 170.736 912.15 180.64C910.61 203.777 911.67 245.055 894.29 261.033C879.54 274.596 856.57 272.256 837.84 272.04L837.83 256.793L837.82 245.209L79.047 245.216L79.05 256.901L79.092 272.008C66.206 272.223 52.641 273.578 40.869 268.495C13.146 256.739 13.016 222.537 8.55298 196.177C-2.92702 174.888 1.21802 120.221 1.30902 94.199C0.445022 78.162 -0.093996 51.577 6.453 37.318Z" fill="url(#printerEdge)" />
            <path d="M12.185 198.952C18.021 204.52 21.809 209.803 29 214.484C51.911 229.399 87.703 224.591 114.766 224.601L228.8 224.578L581.68 224.561L776.5 224.574L826.74 224.712C860.57 224.809 886.81 226.691 906.02 192.246C908.2 188.344 909.55 184.247 912.15 180.64C910.61 203.777 911.67 245.055 894.29 261.033C879.54 274.596 856.57 272.256 837.84 272.04L837.83 256.793L837.82 245.209L79.047 245.216L79.05 256.901L79.092 272.008C66.206 272.223 52.641 273.578 40.869 268.495C13.146 256.739 13.016 222.537 8.55298 196.177L10.074 195.805C11.138 197.159 11.572 197.418 12.185 198.952Z" fill="rgba(0,0,0,0.07)" />
            <path d="M79.05 256.901C70.623 257.056 63.632 258.241 57.038 251.901C47.845 243.062 58.301 234.462 67.603 234.216C85.768 233.736 104.006 233.979 122.182 234.024L230.618 234.086L692.27 234.076L806.7 234.074C820.89 234.074 836.81 233.625 850.99 234.535C856.65 234.897 863.08 242.207 860.14 247.942C855.66 258.055 846.8 257.139 837.83 256.793L837.82 245.209L79.047 245.216L79.05 256.901Z" fill="#060614" />
            {/* Hover shine — diagonal bar swept across, clipped to the printer body */}
            <g clipPath="url(#printerClip)">
              <rect className="printer-shine-bar" x="0" y="-200" width="150" height="673" fill="url(#printerShine)" style={{ pointerEvents: 'none' }} />
            </g>
          </svg>
        </motion.div>
      </div>

      {/* ── Content area: shifts down as receipt emerges ────── */}
      <motion.div
        animate={{ marginTop: phase === 'done' ? CONTENT_MT_DONE : CONTENT_MT_IDLE }}
        transition={{ duration: T.contentShift, ease: [0.25, 0, 0.35, 1], delay: phase === 'printing' ? T.feedDelay : 0 }}
        style={{ width: 344, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
      >
        <AnimatePresence mode="wait">
          {(phase === 'idle') && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 39 }}
            >
              {/* Slide button */}
              <BookDemoButton variant="emerald" onClick={startPrint}>Slide to print</BookDemoButton>
            </motion.div>
          )}

          {(phase === 'printing') && (
            <motion.div
              key="printing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              style={{ height: 160 }}
            />
          )}

          {(phase === 'done') && (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}
            >
              {/* "Payment successful" — fades in from below after printing completes */}
              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  ...SATOSHI, fontWeight: 600, fontSize: 24,
                  lineHeight: 1, letterSpacing: 0,
                  color: '#171717', margin: 0, textAlign: 'center',
                  textWrap: 'balance',
                } as React.CSSProperties}
              >
                Payment successful
              </motion.h1>
              <ShinyButton onClick={replay}>Print Again</ShinyButton>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

    </div>
    </div>
    </div>
  )
}
