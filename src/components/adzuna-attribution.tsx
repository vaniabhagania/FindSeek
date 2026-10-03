/** Required by the Adzuna API terms on every listing sourced from Adzuna. */
export function AdzunaAttribution({ countryCode }: { countryCode: string | null }) {
  const domain = countryCode === "us" ? "adzuna.com" : `adzuna.${countryCode === "gb" ? "co.uk" : countryCode ?? "com"}`;
  return (
    <a href={`https://www.${domain}`} target="_blank" rel="noopener" className="text-xs text-muted underline">
      Jobs by Adzuna
    </a>
  );
}
