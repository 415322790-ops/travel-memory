import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Cesium Ion 免费开发 token — 参与渲染管线初始化

if (import.meta.env.DEV) {
  performance.mark('travel-memory:app-start')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
