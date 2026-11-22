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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
