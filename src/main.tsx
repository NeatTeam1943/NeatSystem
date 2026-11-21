import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/rubik/hebrew-400.css'
import '@fontsource/rubik/hebrew-500.css'
import '@fontsource/rubik/hebrew-700.css'
import '@fontsource/rubik/latin-400.css'
import '@fontsource/rubik/latin-500.css'
import '@fontsource/rubik/latin-700.css'
import './styles/tokens.css'
import './styles/app.css'
import './styles/screens.css'
import { App } from './app/App'
import { MODULES } from './app/modules'
import { installTabs } from './app/tabs'

const render = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
// Sub-system tabs first (they add nav + routes), then the app. A failing tab
// is skipped and reported (Admin -> מערכות), never blocking the rest.
installTabs((m) => MODULES.push(m)).catch((e) => console.error('[NeatSystem] tabs', e)).finally(render)
