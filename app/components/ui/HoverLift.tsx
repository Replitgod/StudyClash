"use client";

import { motion } from "framer-motion";
import { springSmooth } from "@/lib/motion";

// Card hover-lift as its own client-component boundary, so pages that are
// Server Components (app/page.tsx, which exports `metadata`) can still use
// it without becoming client components themselves. `<article>` semantics
// are preserved since this wraps marketing/list cards, not decorative rows.
export function HoverLiftArticle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.article whileHover={{ y: -4, scale: 1.01 }} transition={springSmooth} className={className}>
      {children}
    </motion.article>
  );
}
