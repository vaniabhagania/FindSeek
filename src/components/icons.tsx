// A handful of 16px line icons drawn to one grid, so the interface needs no icon library.
type IconProps = { className?: string; title?: string };

function Svg({ className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const Check = (p: IconProps) => <Svg {...p}><path d="M3 8.5 6.5 12 13 4.5" /></Svg>;
export const Cross = (p: IconProps) => <Svg {...p}><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
export const Caution = (p: IconProps) => <Svg {...p}><path d="M8 2.5 14 13H2L8 2.5Z" /><path d="M8 6.5v3M8 11.3v.2" /></Svg>;
export const Shield = (p: IconProps) => <Svg {...p}><path d="M8 1.8 13 3.6v4.1c0 3.1-2.1 5.4-5 6.5-2.9-1.1-5-3.4-5-6.5V3.6L8 1.8Z" /><path d="m5.6 8 1.7 1.7L10.6 6.4" /></Svg>;
export const Pulse = (p: IconProps) => <Svg {...p}><path d="M1.5 8.5h3l1.5-4 3 7 1.5-3h4" /></Svg>;
export const Plus = (p: IconProps) => <Svg {...p}><path d="M8 3v10M3 8h10" /></Svg>;
export const Home = (p: IconProps) => <Svg {...p}><path d="M2.5 7 8 2.5 13.5 7v6.5h-11V7Z" /><path d="M6.5 13.5V9.5h3v4" /></Svg>;
export const Search = (p: IconProps) => <Svg {...p}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></Svg>;
export const Columns = (p: IconProps) => <Svg {...p}><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M6 2.5v11M10 2.5v11" /></Svg>;
export const Person = (p: IconProps) => <Svg {...p}><circle cx="8" cy="5.5" r="2.8" /><path d="M2.8 14c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3" /></Svg>;
export const Lock = (p: IconProps) => <Svg {...p}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></Svg>;
export const Building = (p: IconProps) => <Svg {...p}><path d="M3 14V3.5h6.5V14M9.5 7H13v7M1.5 14h13M5.3 6h2M5.3 8.5h2M5.3 11h2" /></Svg>;
export const External = (p: IconProps) => <Svg {...p}><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5V13a.5.5 0 0 1-.5.5h-8.5A.5.5 0 0 1 2.5 13V4.5a.5.5 0 0 1 .5-.5H6.5" /></Svg>;
export const Flag = (p: IconProps) => <Svg {...p}><path d="M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8" /></Svg>;
export const Spark = (p: IconProps) => <Svg {...p}><path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2 12 12M12 4l-1.8 1.8M5.8 10.2 4 12" /></Svg>;

/** A quarter-circle that turns while something is working. Stands still for people who ask for less motion. */
export const Spinner = (p: IconProps) => (
  <Svg {...p} className={`motion-safe:animate-spin ${p.className ?? ""}`}>
    <circle cx="8" cy="8" r="5.5" opacity="0.25" />
    <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" />
  </Svg>
);
