'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Contrast, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The four branded variants plus System. Order is the menu order.
// `value` must match the names registered in <ThemeProvider themes={...}> (layout.tsx).
const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'amoled', label: 'AMOLED', icon: Contrast },
  { value: 'brand', label: 'Brand', icon: Palette },
] as const

// Dependency-free dropdown — avoids pulling in @radix-ui/react-dropdown-menu.
// Handles outside-click + Escape to close, and uses menuitemradio semantics.
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // next-themes is client-only; defer theme-dependent rendering until mounted
  // to avoid a hydration mismatch on the trigger icon.
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const active = THEME_OPTIONS.find((opt) => opt.value === theme) ?? THEME_OPTIONS[0]
  // Stable placeholder (Sun) before mount keeps server and first client render in sync.
  const TriggerIcon = mounted ? active.icon : Sun

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Select color theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <TriggerIcon className="h-5 w-5" />
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Color theme"
          className="bg-popover text-popover-foreground absolute right-0 z-50 mt-2 min-w-44 overflow-hidden rounded-md border p-1 shadow-md"
        >
          {THEME_OPTIONS.map((opt) => {
            const ItemIcon = opt.icon
            const isActive = mounted && theme === opt.value
            return (
              <button
                key={opt.value}
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setTheme(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
                  isActive && 'font-medium'
                )}
              >
                <ItemIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{opt.label}</span>
                {isActive && <Check className="h-4 w-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
