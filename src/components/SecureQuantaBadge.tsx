import { SecureQuantaMark } from "./SecureQuantaMark";

// Persistent brand badge shown on every screen (fixed corner, like a chat
// widget launcher) — the one place SecureQuanta attribution lives, instead
// of repeating it inline in every page header.
export function SecureQuantaBadge() {
  return (
    <a
      href="https://www.securequanta.com"
      target="_blank"
      rel="noopener noreferrer"
      className="brand-badge"
      title="A product by SecureQuanta"
      aria-label="A product by SecureQuanta — opens securequanta.com"
    >
      <SecureQuantaMark size={34} />
    </a>
  );
}
