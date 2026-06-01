export function Footer() {
  // Dynamic current year — never hardcoded
  const year = new Date().getFullYear()

  return (
    <footer className="sticky bottom-0 w-full border-t bg-background py-3 text-center text-sm text-muted-foreground">
      <span className="inline-flex items-center justify-center gap-1">
        © Made with
        <svg className="heart-svg mx-0.5" viewBox="0 0 32 29.6" role="img" aria-label="love">
          <path d="M23.6,0c-3.4,0-6.3,2.7-7.6,5.6C14.7,2.7,11.8,0,8.4,0C3.8,0,0,3.8,0,8.4c0,9.4,9.5,11.9,16,21.2c6.1-9.3,16-12.1,16-21.2C32,3.8,28.2,0,23.6,0z" />
        </svg>
        by
        <a
          href="https://membasuh.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium no-underline transition-colors hover:text-foreground"
        >
          Membasuh
        </a>
        {year}
      </span>
    </footer>
  )
}
