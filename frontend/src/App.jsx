import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { ThemeProvider, NavBar } from './components'
import Dashboard from './pages/Dashboard'
import StockAnalysis from './pages/StockAnalysis'
import Screener from './pages/Screener'
import Portfolio from './pages/Portfolio'
import Calendar from './pages/Calendar'
import Backtests from './pages/Backtests'
import Alerts from './pages/Alerts'
import './index.css'

function App() {
    return (
        <ThemeProvider>
            <Router>
                <div className="app">
                    <NavBar />
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/analysis/:symbol" element={<StockAnalysis />} />
                        <Route path="/screener" element={<Screener />} />
                        <Route path="/portfolio" element={<Portfolio />} />
                        <Route path="/calendar" element={<Calendar />} />
                        <Route path="/backtests" element={<Backtests />} />
                        <Route path="/alerts" element={<Alerts />} />
                    </Routes>
                </div>
            </Router>
        </ThemeProvider>
    )
}

export default App
