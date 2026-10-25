import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    // Disable StrictMode to avoid duplicate effect execution (and duplicated API calls) in dev.
    // If we want StrictMode back later, consider adding request de-duping/caching first.
    <App />,
)
