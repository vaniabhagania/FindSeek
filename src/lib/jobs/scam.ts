import { MAX_PARSE_CHARS } from "@/lib/limits";
import type { NormalizedJob } from "./types";

// Cheap, explainable red flags, including the patterns behind most fake job offers in India:
// registration or "security" deposits, WhatsApp- or Telegram-only hiring, pay-to-get-an-offer-letter,
// typing / data-entry work-from-home schemes, "direct joining", and big monthly earnings for little work.
// A flagged listing fails verification.
//
// Two things keep the rules honest:
//  - The text is cleaned first, so "W h a t s A p p", zero-width characters and look-alike Cyrillic
//    letters don't slip past a rule written for plain text.
//  - A rule that finds "registration fee" does not fire when the ad is saying it charges none
//    ("We never charge any registration fee", "Registration fee: nil").

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

const INVISIBLE = /[­​-‏‪-‮⁠-⁤﻿]/g;

// Letters from other alphabets that look like Latin ones.
const LOOKALIKES: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ӏ": "l",
  "ο": "o", "ν": "v", "ρ": "p", "ι": "i", "α": "a", "κ": "k", "τ": "t", "ɡ": "g", "ɑ": "a",
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "g");

/** "w h a t s a p p", "w.h.a.t.s.a.p.p", "w-h-a-t-s-a-p-p": single letters held apart by one separator. */
const SPACED_LETTERS = /(?<![a-z0-9])(?:[a-z][ .\-_*]){2,24}[a-z](?![a-z0-9])/g;

/** The text as a rule should see it: composed, lower-case, no invisible or look-alike characters, no letter-spacing. */
export function normaliseForScan(text: string): string {
  return text
    .slice(0, MAX_PARSE_CHARS)
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .toLowerCase()
    .replace(LOOKALIKE_RE, (c) => LOOKALIKES[c] ?? c)
    .replace(SPACED_LETTERS, (m) => m.replace(/[ .\-_*]/g, ""))
    .replace(/[ \t]+/g, " ");
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const MAIL = String.raw`(?:gmail|googlemail|yahoo|ymail|rocketmail|hotmail|outlook|live|msn|rediffmail|rediff|protonmail|proton|pm|icloud|aol|gmx|zohomail|yandex|mail)\.(?:com|in|co\.in|me|net|ru)`;
const APP = String.raw`(?:whatsapp|whatsap|watsapp|wapp|wa|telegram|tg|signal)`;
const RUPEE = String.raw`(?:rs\.?|₹|inr|रु\.?|रुपये?)`;

/** Devanagari has no word boundaries for \b, so Hindi rules are written without them and normalised like the text. */
const hindi = (source: string) => new RegExp(source.normalize("NFKC"), "gu");
const latin = (source: string) => new RegExp(source, "gi");

interface Rule {
  flag: string;
  /** Any one of these matching is enough. All are global so every match can be checked. */
  tests: RegExp[];
  /** Also required somewhere in the text (for claims that are only suspicious in context). */
  alsoNeeds?: RegExp;
  /** Skip a match that sits in a sentence saying the opposite ("no registration fee"). */
  negatable?: boolean;
}

const FEE_FLAG = "Asks for an upfront fee or deposit";
const MESSAGING_FLAG = "Hires only through a messaging app";
const EARNINGS_FLAG = "Promises unrealistic pay for little work";

const RULES: Rule[] = [
  {
    flag: FEE_FLAG,
    negatable: true,
    tests: [
      latin(String.raw`\b(?:registration|registeration|training|processing|application|joining|onboarding|enrol(?:l)?ment|admission|kit|laptop|verification|documentation|id[- ]?card|security|refundable|caution|lab|exam|uniform|courier|background[- ]check|login|activation)\s+(?:fees?|charges?|amount|deposit)\b`),
      latin(String.raw`\b(?:insurance|membership|software|account|starter|course|trial)\s+(?:fees?|charges?)\b`),
      latin(String.raw`\b(?:security|refundable|caution|advance)\s+(?:deposit|amount|money|payment)\b`),
      latin(String.raw`\b(?:refundable|non[- ]refundable)\s+(?:\w+\s+){0,2}(?:deposit|amount|fees?)\b`),
      latin(String.raw`\bpay\s+(?:a\s+|an\s+|the\s+|your\s+|some\s+|only\s+|just\s+)?(?:small\s+)?(?:deposit|fees?|charges?|registration)\b`),
      latin(String.raw`\bpay\s+${RUPEE}\s*\d`),
      latin(String.raw`\b(?:deposit|fees?|charges?)\s*(?:of|:|-|is|=)\s*${RUPEE}\s*\d`),
      latin(String.raw`\bupfront\s+(?:payment|fees?|amount|cost)\b`),
      latin(String.raw`\b(?:initial|starting|joining)\s+investment\b`),
      // Hinglish
      latin(String.raw`\b(?:paise|paisa|rupay\w*|amount|fees?)\s+(?:jama|deposit|bhej\w*|transfer)\b`),
      latin(String.raw`\bjama\s+kar(?:na|o|e|ein|en|wana|wao)\b`),
      // Hindi: registration / security / processing fee, and "deposit ₹…"
      hindi(String.raw`(?:पंजीकरण|रजिस्ट्रेशन|प्रोसेसिंग|सिक्योरिटी|सुरक्षा|जॉइनिंग|जोइनिंग|ट्रेनिंग|किट|आईडी कार्ड|वेरिफिकेशन|सत्यापन)\s*(?:शुल्क|फीस|फ़ीस|राशि|चार्ज|डिपॉजिट|जमा)`),
      hindi(String.raw`(?:शुल्क|फीस|राशि|डिपॉजिट)[^.\n]{0,20}(?:₹|रु\.?|रुपये?)\s*\d`),
    ],
  },
  {
    flag: "Charges for an offer letter or interview",
    negatable: true,
    tests: [
      latin(String.raw`\b(?:offer letter|interview|appointment letter|joining letter)[^.\n]{0,30}\b(?:fees?|charges?|payment)\b`),
      latin(String.raw`\bpay[^.\n]{0,20}\b(?:for|to get) (?:the |your )?(?:offer|appointment|joining) letter\b`),
    ],
  },
  {
    flag: MESSAGING_FLAG,
    negatable: true,
    tests: [
      latin(String.raw`\b(?:telegram|whatsapp|whatsap|watsapp|wapp|signal)\s+(?:me|us|interview|chat|group|number|num|no\.?|only|id|link|call)\b`),
      latin(String.raw`\b(?:interview|hiring|contact|apply|application|connect|reach|message|msg|dm|text|ping|call|chat|send\w*|share)\b[^.\n]{0,40}\b(?:on|via|through|at|to|over|using)\s+${APP}\b`),
      latin(String.raw`\b(?:dm|msg|message|text|ping)\s+(?:me|us|on|to)\b[^.\n]{0,20}\b(?:wa|whatsapp|telegram|tg|instagram|insta)\b`),
      latin(String.raw`\bwhatsapp\s*(?:only|number|no\.?)\s*[:\-]?\s*(?:\+91)?\s*\d`),
      latin(String.raw`\bwa\s*(?:no\.?|number|only|:|-)\s*\+?\d`),
      latin(String.raw`\b${APP}\s*(?:id|handle|username|channel|group)?\s*[:\-]?\s*@[a-z0-9_]{4,}`),
      latin(String.raw`\b(?:wa\.me|t\.me|telegram\.me|chat\.whatsapp\.com|api\.whatsapp\.com)/`),
      // Hinglish and Hindi
      latin(String.raw`\bwhatsapp\s+(?:par|pe|karein|kare|karo)\b`),
      hindi(String.raw`(?:व्हाट्सएप|व्हाट्सऐप|वॉट्सऐप|वाट्सएप|व्हॉट्सअ‍ॅप|टेलीग्राम)[^.\n]{0,25}(?:संपर्क|भेजें|मैसेज|नंबर|ग्रुप|करें)`),
      hindi(String.raw`(?:संपर्क|मैसेज|भेजें)[^.\n]{0,25}(?:व्हाट्सएप|व्हाट्सऐप|वॉट्सऐप|वाट्सएप|टेलीग्राम)`),
    ],
  },
  {
    flag: "Requests bank or ID details before an interview",
    tests: [
      latin(String.raw`(?:bank account|social security|passport|aadhaar|aadhar|pan card)(?: number| details| card)?.{0,40}(?:before|to apply|to proceed|to confirm)`),
    ],
  },
  {
    flag: EARNINGS_FLAG,
    tests: [
      // "Earn ₹5,000 daily", "earn 30k per week": a short time frame is enough.
      latin(String.raw`\bearn\w*\s+(?:up\s*to\s+|upto\s+|minimum\s+|min\.?\s+|around\s+)?(?:${RUPEE}\s*)?\d[\d,]*(?:\s*k)?(?:\s*(?:-|–|to)\s*(?:${RUPEE}\s*)?\d[\d,]*(?:\s*k)?)?\s*(?:/|per|a|every|each)?\s*(?:day|daily|week|weekly)\b`),
      latin(String.raw`\bearn\s+(?:lakhs?|crores?)\b`),
      latin(String.raw`\bno\s+experience.{0,30}(?:\$\d{4,}|₹\s?\d{2},?\d{3,})`),
      latin(String.raw`\b(?:simple|easy)\s+(?:typing|copy[- ]paste|form filling|data entry|captcha|like|review|rating)\s+(?:job|work|task)s?\b`),
      latin(String.raw`\b(?:copy[- ]paste|captcha|ad[- ]posting)\s+(?:jobs?|work|typing|entry|filling)\b`),
      latin(String.raw`\b(?:like|share|subscribe|follow|rate|review)s?\s+(?:and|&)\s+earn\b`),
      // Hinglish and Hindi: "earn from home sitting at home"
      latin(String.raw`\bghar\s*baithe\s*(?:paise|kamai|kama\w*|earn|income)\b`),
      hindi(String.raw`घर\s*बैठे\s*(?:कमाएं|कमाओ|कमाई|कमायें|पैसे|पैसा|रोज)`),
    ],
  },
  {
    // A monthly figure alone is how real salaries are written; it is only a warning beside "from home",
    // "part time" or "just a few hours".
    flag: EARNINGS_FLAG,
    alsoNeeds: latin(String.raw`\b(?:from home|work from home|wfh|work online|online work|part[- ]?time|mobile|smartphone|few hours|\d\s*(?:-|to)?\s*\d?\s*hours?\s*(?:a|per|/)\s*day)\b`),
    tests: [
      latin(String.raw`\bearn\w*\s+(?:up\s*to\s+|upto\s+|minimum\s+|min\.?\s+|around\s+)?(?:${RUPEE}\s*)?\d[\d,]*(?:\s*k)?(?:\s*(?:-|–|to)\s*(?:${RUPEE}\s*)?\d[\d,]*(?:\s*k)?)?\s*(?:/|per|a|every|each)?\s*(?:month|monthly)\b`),
    ],
  },
  {
    flag: "Promises a guaranteed job or income",
    tests: [
      latin(String.raw`\b(?:guaranteed|assured)\s+(?:income|earnings?|salary|job|placement|returns?)\b`),
      latin(String.raw`\b100\s*%\s*(?:job|placement)\s*(?:guarantee|guaranteed|assured)\b`),
    ],
  },
  {
    flag: "Network marketing or pay-to-join scheme",
    tests: [
      latin(String.raw`\b(?:network marketing|mlm|multi[- ]level marketing|chain (?:system|marketing)|referral income)\b`),
      latin(String.raw`\b(?:buy|purchase|invest)\b[^.\n]{0,30}\b(?:to join|before joining|to start|to get (?:the )?job)\b`),
    ],
  },
  {
    flag: "No interview, direct joining",
    tests: [
      latin(String.raw`\b(?:no|without|zero)\s+interview\b`),
      latin(String.raw`\bdirect\s+(?:joining|selection|hiring|placement)\b`),
      latin(String.raw`\bbina\s+interview\b`),
      latin(String.raw`\bseedhi\s+bharti\b`),
      hindi(String.raw`बिना\s*(?:इंटरव्यू|साक्षात्कार)|सीधी?\s*(?:भर्ती|जॉइनिंग|जोइनिंग|नियुक्ति)`),
    ],
  },
  {
    flag: "Uses a personal email address to apply",
    tests: [
      latin(String.raw`\b(?:apply|send|mail|email|share|forward|submit|reach|contact|write|drop)\b[^\n]{0,60}@${MAIL}\b`),
    ],
  },
];

// ---------------------------------------------------------------------------
// "We don't charge a registration fee" is not a registration fee.
// ---------------------------------------------------------------------------

const NEGATION_BEFORE = /(?:^|[^a-z])(?:no|not|never|nor|without|zero|nil|neither|cannot|can't|don't|doesn't|won't|do not|does not|will not|free of|beware|fraud\w*|scam\w*|fake|warning)(?![a-z])|नहीं|निःशुल्क|मुफ्त|मुफ़्त|बिना किसी/;
const NEGATION_AFTER = /^\s*(?:is|are|will be|shall be)?\s*(?:[:=\-–]\s*)?(?:nil|none|zero|free|waived|not\s+(?:required|charged|applicable|collected|taken|asked|needed)|never|n\/a|no\b|₹\s*0\b|rs\.?\s*0\b)|^\s*(?:नहीं|निःशुल्क|मुफ्त|मुफ़्त)/;

function negated(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 60), start);
  const cut = Math.max(before.lastIndexOf("\n"), before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "), before.lastIndexOf(";"));
  if (NEGATION_BEFORE.test(cut >= 0 ? before.slice(cut + 1) : before)) return true;
  return NEGATION_AFTER.test(text.slice(end, end + 40));
}

export function scamFlags(job: Pick<NormalizedJob, "description" | "title">): string[] {
  const text = normaliseForScan(`${job.title}\n${job.description}`);
  const flags = new Set<string>();
  for (const rule of RULES) {
    if (flags.has(rule.flag)) continue;
    if (rule.alsoNeeds && !new RegExp(rule.alsoNeeds.source, rule.alsoNeeds.flags.replace("g", "")).test(text)) continue;
    outer: for (const test of rule.tests) {
      for (const m of text.matchAll(test)) {
        if (rule.negatable && negated(text, m.index, m.index + m[0].length)) continue;
        flags.add(rule.flag);
        break outer;
      }
    }
  }
  return [...flags];
}
