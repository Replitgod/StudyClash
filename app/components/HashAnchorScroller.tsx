"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function scrollToHashTarget() {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return;

  const targetId = decodeURIComponent(hash.slice(1));
  const tryScroll = (attempt = 0) => {
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (attempt < 12) {
      window.setTimeout(() => tryScroll(attempt + 1), 100);
    }
  };

  tryScroll();
}

export default function HashAnchorScroller() {
  const pathname = usePathname();

  useEffect(() => {
    scrollToHashTarget();
  }, [pathname]);

  useEffect(() => {
    const onHashChange = () => scrollToHashTarget();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return null;
}
