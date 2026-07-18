// Named re-export, zero new logic: app/components/ui/Reveal.tsx already IS
// this primitive (viewport-triggered rise, `once: true`, deliberately never
// animates from opacity:0 -- see that file's comment for why, it's a real
// SEO/crawler constraint, not an oversight). Kept as its own file so code
// following this redesign's primitive naming can `import { RevealOnScroll }
// from "@/app/components/motion/RevealOnScroll"` without needing to know
// the pre-existing component was named differently.
export { Reveal as RevealOnScroll } from "@/app/components/ui/Reveal";
