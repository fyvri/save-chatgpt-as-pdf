import Link from 'next/link'
import Image from 'next/image'
import { Github } from 'lucide-react'
import { ThemeSwitcher } from '@/components/shared/ThemeSwitcher'
import { Button } from '@/components/ui/button'
import { APP_NAME, GITHUB_URL } from '@/constants/app'

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold transition-opacity hover:opacity-80"
        >
          <Image
            src="/images/original-bg-transparent.png"
            alt={`${APP_NAME} logo`}
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
            priority
          />
          <span>{APP_NAME}</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <Button variant="ghost" size="icon" asChild aria-label="GitHub">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Github className="h-5 w-5" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}
