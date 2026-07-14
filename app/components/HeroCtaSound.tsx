"use client";

import { Button, type ButtonProps } from "./ui/Button";
import { UI_SFX } from "@/lib/uiSound";

// app/page.tsx is a Server Component (it exports `metadata`), so it can't
// pass an inline onClick closure to Button directly -- Next disallows
// handing event handlers down from a Server Component. This is the small
// client boundary that lets the homepage's primary CTA get a soft click
// tone without making the whole page a client component.
export function HeroCtaSound(props: ButtonProps) {
  const { onClick, ...rest } = props as ButtonProps & {
    onClick?: (event: React.MouseEvent) => void;
  };

  return (
    <Button
      {...(rest as ButtonProps)}
      onClick={(event: React.MouseEvent) => {
        UI_SFX.click();
        onClick?.(event);
      }}
    />
  );
}
