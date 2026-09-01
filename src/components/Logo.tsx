export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#0969da" />
      <path
        d="M16 4.5 6.5 8.4v6.8c0 6.2 4.1 11.9 9.5 13.3 5.4-1.4 9.5-7.1 9.5-13.3V8.4Z"
        fill="#ffffff"
        fillOpacity="0.16"
      />
      <path
        d="M16 7 9 9.9v5.3c0 4.8 3 9.2 7 10.3 4-1.1 7-5.5 7-10.3V9.9Z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.6"
      />
      <path
        d="M12.8 16.1 15 18.3l4.3-4.6"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
