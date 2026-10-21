// Who owns a web or email address? The hiring-source check used to ask only whether the company's
// name appeared somewhere in the address, so razorpay-hiring.xyz, razorpay.careers-portal.top and
// infosys.com.verify-offer.in all counted as the employer's own. These helpers find the part of an
// address that someone actually registered (the "registrable domain") and compare that exactly.

/** Endings made of two parts that behave like one: razorpay.co.in is registered under co.in. */
const TWO_PART_SUFFIXES = new Set([
  "co.in", "org.in", "net.in", "ac.in", "edu.in", "gov.in", "nic.in", "res.in", "firm.in", "gen.in", "ind.in", "mil.in",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "co.za", "co.kr", "co.id", "co.ae",
  "com.sg", "com.my", "com.hk", "com.cn", "com.br", "com.pk", "com.bd", "com.lk", "com.np", "com.tr", "com.mx",
]);

/**
 * Endings a company's own address may use for its name to count as the company's. A name on any other
 * ending (razorpay.co, razorpay.xyz, razorpay.top) is the lookalike a fraudster registers, so those
 * addresses must instead appear on the short list of known company domains below.
 */
const OWN_SITE_SUFFIXES = new Set(["com", "in", "co.in", "org", "org.in", "net", "io", "ai", "tech"]);

/** Domains where anyone can publish a page under any name. A company name there proves nothing. */
const FREE_HOSTING = new Set([
  "github.io", "gitlab.io", "notion.site", "notion.so", "wixsite.com", "wix.com", "weebly.com", "wordpress.com",
  "blogspot.com", "blogspot.in", "medium.com", "substack.com", "vercel.app", "netlify.app", "pages.dev", "workers.dev",
  "herokuapp.com", "onrender.com", "glitch.me", "repl.co", "replit.app", "surge.sh", "web.app", "firebaseapp.com",
  "webflow.io", "framer.website", "framer.app", "carrd.co", "canva.site", "linktr.ee", "bio.link", "beacons.ai",
  "typeform.com", "airtable.com", "jotform.com", "tally.so", "forms.office.com", "bubbleapps.io", "godaddysites.com",
  "mystrikingly.com", "000webhostapp.com", "ngrok.io", "ngrok-free.app", "trycloudflare.com",
]);
/** Single pages on big sites that anyone can create (Google Sites, Docs, Drive). */
const FREE_PAGE_HOSTS = ["sites.google.com", "docs.google.com", "drive.google.com", "forms.gle", "forms.google.com", "dropbox.com", "mega.nz"];

/** Domains of large employers whose name and website differ, so the name alone can't find them. */
const KNOWN_COMPANIES: { names: string[]; domains: string[] }[] = [
  { names: ["tata consultancy", "tcs"], domains: ["tcs.com"] },
  { names: ["infosys"], domains: ["infosys.com"] },
  { names: ["wipro"], domains: ["wipro.com"] },
  { names: ["hcl"], domains: ["hcltech.com", "hcl.com"] },
  { names: ["tech mahindra"], domains: ["techmahindra.com"] },
  { names: ["cognizant"], domains: ["cognizant.com"] },
  { names: ["accenture"], domains: ["accenture.com"] },
  { names: ["capgemini"], domains: ["capgemini.com"] },
  { names: ["ltimindtree", "lti mindtree"], domains: ["ltimindtree.com"] },
  { names: ["amazon"], domains: ["amazon.jobs", "amazon.com", "amazon.in"] },
  { names: ["google"], domains: ["google.com", "careers.google.com"] },
  { names: ["microsoft"], domains: ["microsoft.com"] },
  { names: ["reliance"], domains: ["ril.com", "jio.com"] },
  { names: ["state bank of india", "sbi"], domains: ["sbi.co.in", "sbi.bank.in"] },
  { names: ["hdfc bank"], domains: ["hdfcbank.com"] },
  { names: ["icici bank"], domains: ["icicibank.com"] },
  { names: ["axis bank"], domains: ["axisbank.com"] },
  { names: ["cred"], domains: ["cred.club"] },
  { names: ["ola"], domains: ["olacabs.com", "ola.com"] },
  { names: ["byju"], domains: ["byjus.com"] },
  { names: ["larsen", "l&t"], domains: ["larsentoubro.com", "lntecc.com", "lntinfotech.com"] },
];

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export interface Registered {
  /** What the owner registered: razorpay.com, razorpay.co.in */
  domain: string;
  /** The name part: razorpay */
  label: string;
  /** The ending: com, co.in */
  suffix: string;
}

/** The registrable domain of a host name, or null for an IP address, a single word, or nonsense. */
export function registered(host: string): Registered | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h || IPV4.test(h) || h.includes(":") || h.includes("[")) return null;
  const parts = h.split(".");
  if (parts.length < 2 || parts.some((p) => !p || !/^[a-z0-9-]+$/.test(p))) return null;
  const two = parts.slice(-2).join(".");
  const suffix = TWO_PART_SUFFIXES.has(two) ? two : parts[parts.length - 1];
  const keep = suffix.split(".").length + 1;
  if (parts.length < keep) return null;
  const label = parts[parts.length - keep];
  return { domain: `${label}.${suffix}`, label, suffix };
}

/** True when anyone can publish a page there under any name (github.io, notion.site, Google Sites…). */
export function isFreeHosting(host: string): boolean {
  const h = host.toLowerCase();
  if (FREE_PAGE_HOSTS.some((f) => h === f || h.endsWith(`.${f}`))) return true;
  const r = registered(h);
  return r ? FREE_HOSTING.has(r.domain) : false;
}

const LEGAL_WORDS = /\b(private|pvt|limited|ltd|llp|inc|incorporated|corp|corporation|company|co|llc|plc|opc|and|the)\b\.?/gi;

/** The names a company's own domain could be built from: "Razorpay Software Pvt. Ltd." → razorpay, razorpaysoftware. */
export function companyLabels(company: string, tokens: string[]): Set<string> {
  const words = company.toLowerCase().replace(LEGAL_WORDS, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const labels = new Set<string>(tokens);
  if (tokens.length) labels.add(tokens.join(""));
  if (words.length) labels.add(words.join(""));
  return new Set([...labels].filter((l) => l.length >= 3));
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9& ]/g, " ").replace(/\s+/g, " ").trim();

/** Does this host or email domain belong to this company? An exact match on what was registered, not a substring. */
export function belongsToCompany(company: string, tokens: string[], host: string): boolean {
  const reg = registered(host);
  if (!reg || isFreeHosting(host)) return false;

  const name = ` ${squash(company)} `;
  for (const known of KNOWN_COMPANIES) {
    if (known.names.some((n) => name.includes(` ${n} `)) && known.domains.some((d) => reg.domain === d || host.toLowerCase() === d || host.toLowerCase().endsWith(`.${d}`))) {
      return true;
    }
  }
  return OWN_SITE_SUFFIXES.has(reg.suffix) && companyLabels(company, tokens).has(reg.label);
}
