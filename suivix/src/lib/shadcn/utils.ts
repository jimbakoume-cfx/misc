import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the theme's custom spacing scale (p-density-lg, gap-density-md, …)
// so a className passed to a component overrides its default padding instead of stacking.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ['density-xs', 'density-sm', 'density-md', 'density-lg', 'density-xl', '4.5'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
