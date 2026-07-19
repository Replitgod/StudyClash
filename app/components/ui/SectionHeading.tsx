type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className = "",
}: SectionHeadingProps) {
  const alignClass = align === "center" ? "text-center mx-auto" : "";

  return (
    <header className={`max-w-2xl ${alignClass} ${className}`}>
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-primary">{eyebrow}</p>
      )}
      <h2
        className={`font-bold tracking-tight text-marketing-text dark:text-white ${
          eyebrow ? "mt-2" : ""
        } text-[clamp(1.5rem,3vw,2rem)] leading-tight`}
      >
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-sm leading-relaxed text-marketing-muted sm:text-base">{description}</p>
      )}
    </header>
  );
}
