import { AUTHOR, APP_NAME } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white/60 py-4 text-sm dark:border-gray-800 dark:bg-gray-950/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-gray-500 sm:flex-row dark:text-gray-400">
        <span>
          {APP_NAME} — built by <span className="font-medium text-gray-700 dark:text-gray-200">{AUTHOR.name}</span>
        </span>
        <nav className="flex items-center gap-4" aria-label="Author links">
          <a className="hover:text-gray-900 hover:underline dark:hover:text-white" href={AUTHOR.github} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a className="hover:text-gray-900 hover:underline dark:hover:text-white" href={AUTHOR.linkedin} target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
        </nav>
      </div>
    </footer>
  );
}
