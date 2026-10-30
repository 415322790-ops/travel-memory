// 广州塔 — 手绘素描风格 SVG
export default function CantonTower({ className }) {
  return (
    <svg
      viewBox="0 0 160 480"
      className={className}
      style={{ width: '100%', height: 'auto', maxHeight: '60vh' }}
      fill="none"
      stroke="#fff"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* === Main body: twisted hourglass === */}
      {/* Outer left contour */}
      <path
        d="M78 20 C60 50, 55 90, 48 140 C42 180, 38 210, 42 240 C46 260, 50 270, 58 280 C52 300, 44 340, 30 380 C22 400, 16 420, 14 440"
        strokeWidth="2"
      />
      {/* Outer right contour */}
      <path
        d="M82 20 C100 50, 105 90, 112 140 C118 180, 122 210, 118 240 C114 260, 110 270, 102 280 C108 300, 116 340, 130 380 C138 400, 144 420, 146 440"
        strokeWidth="2"
      />

      {/* Inner structural lines (left side) */}
      <path d="M76 30 C62 55, 58 90, 52 140 C48 170, 45 200, 49 240" strokeWidth="0.8" opacity="0.6" />
      <path d="M52 250 C46 280, 42 320, 32 370 C26 390, 22 415, 20 435" strokeWidth="0.8" opacity="0.6" />
      {/* Inner structural lines (right side) */}
      <path d="M84 30 C98 55, 102 90, 108 140 C112 170, 115 200, 111 240" strokeWidth="0.8" opacity="0.6" />
      <path d="M108 250 C114 280, 118 320, 128 370 C134 390, 138 415, 140 435" strokeWidth="0.8" opacity="0.6" />

      {/* === Horizontal decks (observation levels) === */}
      <ellipse cx="80" cy="45" rx="10" ry="3.5" strokeWidth="1.5" opacity="0.7" />
      <ellipse cx="80" cy="85" rx="9" ry="3" strokeWidth="1.2" opacity="0.6" />
      <ellipse cx="80" cy="130" rx="8" ry="2.8" strokeWidth="1.5" />
      <ellipse cx="80" cy="165" rx="7" ry="2.5" strokeWidth="1" opacity="0.6" />
      <ellipse cx="80" cy="195" rx="6.5" ry="2.2" strokeWidth="1" opacity="0.5" />
      {/* Narrowest point (waist) */}
      <ellipse cx="80" cy="220" rx="6" ry="2" strokeWidth="2" stroke="#fff" />
      <ellipse cx="80" cy="255" rx="7" ry="2.5" strokeWidth="1.2" opacity="0.6" />
      <ellipse cx="80" cy="290" rx="8" ry="3" strokeWidth="1.5" />
      <ellipse cx="80" cy="330" rx="9" ry="3.5" strokeWidth="1.2" opacity="0.7" />
      <ellipse cx="80" cy="370" rx="10" ry="4" strokeWidth="1.5" />
      <ellipse cx="80" cy="410" rx="12" ry="4.5" strokeWidth="1.2" opacity="0.6" />

      {/* === Cross-bracing (X patterns between decks) === */}
      <g strokeWidth="0.6" opacity="0.35">
        <path d="M70 50 L90 80" />
        <path d="M90 50 L70 80" />
        <path d="M72 90 L88 125" />
        <path d="M88 90 L72 125" />
        <path d="M73 135 L87 160" />
        <path d="M87 135 L73 160" />
        <path d="M74 170 L86 190" />
        <path d="M86 170 L74 190" />
        <path d="M74 225 L86 250" />
        <path d="M86 225 L74 250" />
        <path d="M73 260 L87 285" />
        <path d="M87 260 L73 285" />
        <path d="M72 295 L88 325" />
        <path d="M88 295 L72 325" />
        <path d="M70 335 L90 365" />
        <path d="M90 335 L70 365" />
      </g>

      {/* === Vertical lines for texture === */}
      <g strokeWidth="0.5" opacity="0.2">
        <line x1="74" y1="50" x2="60" y2="140" />
        <line x1="86" y1="50" x2="100" y2="140" />
        <line x1="58" y1="150" x2="50" y2="250" />
        <line x1="102" y1="150" x2="110" y2="250" />
        <line x1="52" y1="270" x2="38" y2="370" />
        <line x1="108" y1="270" x2="122" y2="370" />
      </g>

      {/* === Antenna spire === */}
      <line x1="80" y1="4" x2="80" y2="20" strokeWidth="2.5" />
      <line x1="80" y1="8" x2="75" y2="14" strokeWidth="0.8" opacity="0.6" />
      <line x1="80" y1="8" x2="85" y2="14" strokeWidth="0.8" opacity="0.6" />

      {/* === Base === */}
      <ellipse cx="80" cy="445" rx="18" ry="6" strokeWidth="2.5" />
      <ellipse cx="80" cy="452" rx="22" ry="7" strokeWidth="1.5" opacity="0.8" />
      <line x1="60" y1="445" x2="60" y2="452" strokeWidth="0.8" opacity="0.4" />
      <line x1="100" y1="445" x2="100" y2="452" strokeWidth="0.8" opacity="0.4" />

      {/* === Sketch hatching marks (hand-drawn feel) === */}
      <g strokeWidth="0.5" opacity="0.2">
        <line x1="48" y1="160" x2="52" y2="165" />
        <line x1="46" y1="175" x2="51" y2="178" />
        <line x1="112" y1="160" x2="108" y2="165" />
        <line x1="114" y1="175" x2="109" y2="178" />
        <line x1="44" y1="290" x2="49" y2="293" />
        <line x1="116" y1="290" x2="111" y2="293" />
      </g>
    </svg>
  );
}
