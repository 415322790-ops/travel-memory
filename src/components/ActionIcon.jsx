const iconPaths = {
  arrowLeft: <path d="M19 12H5m7 7-7-7 7-7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-2.5 2.7-3.8 5.7-3.8 9s1.3 6.3 3.8 9m0-18c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  trash: <><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v5m4-5v5" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4" /></>,
};

export default function ActionIcon({ name, size = 18, className = '' }) {
  return (
    <svg
      className={`action-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  );
}
