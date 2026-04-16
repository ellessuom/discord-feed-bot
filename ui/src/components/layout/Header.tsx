import { Link } from 'react-router'
import { Settings, HelpCircle, Gamepad2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGitHubStore } from '@/stores/github'

export function Header() {
  const { isAuthenticated, user } = useGitHubStore()

  return (
    <header className="bg-background-header border-b border-background-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gamepad2 className="h-8 w-8 text-steam-blue" />
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Discord Feed Bot</h1>
            <p className="text-xs text-text-secondary">
              {isAuthenticated ? `Connected as ${user?.login}` : 'Not connected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/settings">
            <Button
              variant="ghost"
              size="icon"
              className="text-text-secondary hover:text-text-primary"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">
            <Button
              variant="ghost"
              size="icon"
              className="text-text-secondary hover:text-text-primary"
            >
              <HelpCircle className="h-5 w-5" />
            </Button>
          </a>
        </div>
      </div>
    </header>
  )
}
