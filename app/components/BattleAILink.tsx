"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type BattleAILinkProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
};

function scrollToBattle() {
  const tryScroll = (attempt = 0) => {
    const battle = document.getElementById("battle-ai");
    if (battle) {
      battle.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", "/#battle-ai");
      return;
    }

    if (attempt < 15) {
      window.setTimeout(() => tryScroll(attempt + 1), 90);
    }
  };

  tryScroll();
}

export default function BattleAILink({ children, className, onClick, ariaLabel }: BattleAILinkProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.();

    if (pathname === "/") {
      event.preventDefault();
      scrollToBattle();
      return;
    }

    event.preventDefault();
    router.push("/#battle-ai");

    window.setTimeout(() => {
      if (window.location.pathname === "/") {
        scrollToBattle();
      }
    }, 80);
  };

  return (
    <Link href="/#battle-ai" className={className} aria-label={ariaLabel} onClick={handleClick}>
      {children}
    </Link>
  );
}
