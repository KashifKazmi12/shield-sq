import { resolveTxt } from "dns/promises";

export type IdentityFindingInput = {
  type: "spf_missing" | "dmarc_missing" | "dkim_missing";
  severity: string;
  title: string;
  description: string | null;
  dedupeKey: string;
};

export function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  return email.slice(at + 1).toLowerCase();
}

async function txtRecordsFlat(hostname: string): Promise<string[]> {
  try {
    const records = await resolveTxt(hostname);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return []; // NXDOMAIN/ENODATA/timeout — all mean "nothing found", not a hard error
  }
}

export async function checkSpf(domain: string): Promise<IdentityFindingInput[]> {
  const records = await txtRecordsFlat(domain);
  const hasSpf = records.some((r) => r.toLowerCase().startsWith("v=spf1"));
  if (hasSpf) return [];
  return [
    {
      type: "spf_missing",
      severity: "medium",
      title: "No SPF record configured",
      description: `${domain} has no SPF (v=spf1) TXT record — mail servers can't verify which senders are authorized for this domain`,
      dedupeKey: "spf_missing",
    },
  ];
}

export async function checkDmarc(domain: string): Promise<IdentityFindingInput[]> {
  const records = await txtRecordsFlat(`_dmarc.${domain}`);
  const dmarcRecord = records.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
  if (!dmarcRecord) {
    return [
      {
        type: "dmarc_missing",
        severity: "high",
        title: "No DMARC record configured",
        description: `${domain} has no DMARC (v=DMARC1) TXT record at _dmarc.${domain} — spoofed mail from this domain has no enforcement policy`,
        dedupeKey: "dmarc_missing",
      },
    ];
  }
  // p=none means "monitor only" — spoofed mail still gets delivered, so this
  // is a real (if lesser) gap, not full compliance.
  if (/p=none/i.test(dmarcRecord)) {
    return [
      {
        type: "dmarc_missing",
        severity: "low",
        title: "DMARC policy set to 'none' (monitor only)",
        description: `${domain}'s DMARC record uses p=none — spoofed mail is reported but not rejected or quarantined`,
        dedupeKey: "dmarc_policy_none",
      },
    ];
  }
  return [];
}

// DKIM has no fixed record location — the selector is chosen by whoever
// configured the domain's mail provider, and isn't discoverable from the
// domain alone. This checks a handful of common provider defaults
// (Google Workspace, Microsoft 365, generic "default"/"mail") as a
// best-effort signal only: finding nothing here does NOT reliably mean DKIM
// is unconfigured, just that it isn't under one of these common selectors —
// worded accordingly rather than a hard "DKIM missing" claim.
const COMMON_DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "mail", "dkim"];

export async function checkDkim(domain: string): Promise<IdentityFindingInput[]> {
  const results = await Promise.all(
    COMMON_DKIM_SELECTORS.map(async (selector) => ({
      selector,
      records: await txtRecordsFlat(`${selector}._domainkey.${domain}`),
    }))
  );
  const found = results.some((r) => r.records.some((rec) => /v=dkim1/i.test(rec) || /p=/i.test(rec)));
  if (found) return [];

  return [
    {
      type: "dkim_missing",
      severity: "info",
      title: "No DKIM record found under common selectors",
      description: `Checked ${COMMON_DKIM_SELECTORS.length} common selectors (${COMMON_DKIM_SELECTORS.join(", ")}) under ${domain} — none resolved. This is best-effort: a custom selector would not be detected. Verify manually with your mail provider.`,
      dedupeKey: "dkim_missing_common_selectors",
    },
  ];
}

export async function checkIdentityDns(domain: string): Promise<IdentityFindingInput[]> {
  const [spf, dmarc, dkim] = await Promise.all([checkSpf(domain), checkDmarc(domain), checkDkim(domain)]);
  return [...spf, ...dmarc, ...dkim];
}
