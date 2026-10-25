import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, CrosshairMode, LineStyle, createChart } from 'lightweight-charts';
import {
    uid, normalizeBars, buildHeikinAshi, makeBusinessTime, cssVar,
    toVolumeHistogram, computeOverlayIndicators, computeRsiPanels, computeMacdPanels,
    computeStochPanels, computeAtrPanels, parseStoredLayers, parseStoredDrawings,
    INDICATOR_PRESETS, FIB_LEVELS,
} from './chartUtils';

const STORAGE_KEY = 'oo_prochart_settings_v4';
const drawingStoreKey = (symbol) => `oo_prochart_drawings_${String(symbol || '').toUpperCase()}`;

const SWATCH_COLORS = ['#29d17d', '#ff5a5f', '#5aa2ff', '#ffd166', '#9b5de5', '#4cc9f0', '#ff9f43', '#a8a8b3'];

const DEFAULT_SETTINGS = {
    chartType: 'candles', showVolume: true, logScale: false, magnet: false,
    candleUp: '#29d17d', candleDown: '#ff5a5f', wickUp: '#29d17d', wickDown: '#ff5a5f',
    borderUp: '#29d17d', borderDown: '#ff5a5f', lineColor: '#5aa2ff',
    areaTopColor: 'rgba(90,162,255,0.35)', areaBottomColor: 'rgba(90,162,255,0.05)',
    compareSymbol: '', activeTool: 'none', defaultText: 'Note',
};

const DRAWING_TOOLS = [
    { key: 'none', label: 'Cursor' },
    { key: 'trend', label: 'Trend' },
    { key: 'hline', label: 'H-Line' },
    { key: 'ray', label: 'Ray' },
    { key: 'rect', label: 'Rect' },
    { key: 'channel', label: 'Channel' },
    { key: 'fib', label: 'Fib' },
    { key: 'text', label: 'Text' },
];

const CHART_TYPES = [
    { key: 'candles', label: 'Candles' },
    { key: 'heikin', label: 'Heikin-Ashi' },
    { key: 'bars', label: 'OHLC' },
    { key: 'line', label: 'Line' },
    { key: 'area', label: 'Area' },
];

const DRAWING_LABELS = { hline: 'H-Line', trend: 'Trend', ray: 'Ray', rect: 'Rect', channel: 'Channel', fib: 'Fib', text: 'Text' };

function chipLabel(layer) {
    const base = INDICATOR_PRESETS[layer.type]?.label || layer.type;
    if (layer.type === 'macd') return `${base}(${layer.params.fast || 12},${layer.params.slow || 26},${layer.params.signal || 9})`;
    if (layer.type === 'stoch') return `${base}(${layer.params.kLength || 14},${layer.params.dLength || 3})`;
    if (layer.params.length) return `${base}(${layer.params.length})`;
    return base;
}

function ToolIcon({ type }) {
    return (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
            {type === 'none' && <path d="M4 2l8 6-8 6z" fill="currentColor" stroke="none" />}
            {type === 'trend' && <line x1="3" y1="13" x2="13" y2="3" />}
            {type === 'hline' && <><line x1="1" y1="8" x2="15" y2="8" /><circle cx="4" cy="8" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" /></>}
            {type === 'ray' && <><line x1="3" y1="11" x2="13" y2="5" /><polyline points="10,3.5 13,5 11.5,8" fill="none" /></>}
            {type === 'rect' && <rect x="3" y="4" width="10" height="8" rx="0.5" />}
            {type === 'channel' && <><line x1="2" y1="12" x2="14" y2="8" /><line x1="2" y1="8" x2="14" y2="4" /><line x1="2" y1="12" x2="2" y2="8" strokeDasharray="2" /><line x1="14" y1="8" x2="14" y2="4" strokeDasharray="2" /></>}
            {type === 'fib' && <><line x1="2" y1="2" x2="14" y2="2" /><line x1="2" y1="6" x2="14" y2="6" strokeDasharray="2" /><line x1="2" y1="10" x2="14" y2="10" /><line x1="2" y1="14" x2="14" y2="14" /></>}
            {type === 'text' && <text x="4" y="13" fontSize="13" fontWeight="bold" fill="currentColor" stroke="none">T</text>}
            {type === 'drawings' && <><rect x="2" y="2" width="12" height="3" rx="0.5" /><rect x="2" y="7" width="12" height="3" rx="0.5" /><rect x="2" y="12" width="8" height="2" rx="0.5" /></>}
        </svg>
    );
}

function dashArray(style) { return style === 'dashed' ? '8,4' : style === 'dotted' ? '2,4' : undefined; }
const LINE_STYLES = ['solid', 'dashed', 'dotted'];

function fmtOhlc(v) { return Number.isFinite(v) ? v.toFixed(2) : '--'; }
function fmtVol(v) {
    if (!Number.isFinite(v) || v <= 0) return '--';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(Math.round(v));
}

function ProChart({ symbol, data, height = 600, range: _range, onLoadCompareHistory, intervals, activeInterval, onIntervalChange, ranges, activeRange, onRangeChange, loading }) {
    const wrapRef = useRef(null);
    const chartContainerRef = useRef(null);
    const rsiContainerRef = useRef(null);
    const macdContainerRef = useRef(null);
    const stochContainerRef = useRef(null);
    const atrContainerRef = useRef(null);
    const overlayRef = useRef(null);
    const chartRef = useRef(null);
    const rsiChartRef = useRef(null);
    const macdChartRef = useRef(null);
    const stochChartRef = useRef(null);
    const atrChartRef = useRef(null);
    const mainSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const compareSeriesRef = useRef(null);
    const indicatorSeriesRef = useRef([]);
    const indicatorGuidesRef = useRef([]);
    const dragRef = useRef(null);
    const magnetRef = useRef(false);
    const priceBarsRef = useRef([]);
    const [viewportTick, setViewportTick] = useState(0);
    const mainHRef = useRef(600);

    const [settings, setSettings] = useState(() => {
        try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
        catch { return { ...DEFAULT_SETTINGS }; }
    });
    const [layers, setLayers] = useState(() => {
        try { return parseStoredLayers(JSON.parse(localStorage.getItem(`${STORAGE_KEY}_layers`) || '[]')); }
        catch { return []; }
    });
    const [drawings, setDrawings] = useState(() => {
        try { return parseStoredDrawings(JSON.parse(localStorage.getItem(drawingStoreKey(symbol)) || '[]')); }
        catch { return []; }
    });
    const [selectedDrawingId, setSelectedDrawingId] = useState(null);
    const [hoveredDrawingId, setHoveredDrawingId] = useState(null);
    const [inlineEditId, setInlineEditId] = useState(null);
    const [draftPoint, setDraftPoint] = useState(null);
    const [draftPoint2, setDraftPoint2] = useState(null);
    const [compareBars, setCompareBars] = useState([]);
    const [compareStatus, setCompareStatus] = useState('');
    const [modal, setModal] = useState({ open: false, mode: 'layer', targetId: null });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [legendData, setLegendData] = useState(null);
    const [rsiLegend, setRsiLegend] = useState(null);
    const [macdLegend, setMacdLegend] = useState(null);
    const [stochLegend, setStochLegend] = useState(null);
    const [atrLegend, setAtrLegend] = useState(null);
    const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
    const [drawingHistory, setDrawingHistory] = useState([]);
    const [historyPointer, setHistoryPointer] = useState(-1);
    const [showDrawingPanel, setShowDrawingPanel] = useState(false);
    const [panelH, setPanelH] = useState(140);
    const paneResizeRef = useRef(null);

    const baseBars = useMemo(() => normalizeBars(data), [data]);
    const priceBars = useMemo(() => (settings.chartType === 'heikin' ? buildHeikinAshi(baseBars) : baseBars), [baseBars, settings.chartType]);
    const rsiPanels = useMemo(() => computeRsiPanels(priceBars, layers), [priceBars, layers]);
    const macdPanels = useMemo(() => computeMacdPanels(priceBars, layers), [priceBars, layers]);
    const stochPanels = useMemo(() => computeStochPanels(priceBars, layers), [priceBars, layers]);
    const atrPanels = useMemo(() => computeAtrPanels(priceBars, layers), [priceBars, layers]);
    const showRsi = rsiPanels.length > 0;
    const showMacd = macdPanels.length > 0;
    const showStoch = stochPanels.length > 0;
    const showAtr = atrPanels.length > 0;
    const paneCount = (showRsi ? 1 : 0) + (showMacd ? 1 : 0) + (showStoch ? 1 : 0) + (showAtr ? 1 : 0);
    const totalH = isFullscreen ? window.innerHeight - 36 : height;
    const mainH = Math.max(200, totalH - (paneCount * panelH));
    mainHRef.current = mainH; // keep ref in sync for ResizeObserver closure
    const rsiLabel = useMemo(() => { const l = layers.find((x) => x.type === 'rsi' && x.visible !== false); return l ? `RSI(${l.params.length || 14})` : 'RSI'; }, [layers]);
    const macdLabel = useMemo(() => { const l = layers.find((x) => x.type === 'macd' && x.visible !== false); return l ? `MACD(${l.params.fast || 12},${l.params.slow || 26},${l.params.signal || 9})` : 'MACD'; }, [layers]);
    const stochLabel = useMemo(() => { const l = layers.find((x) => x.type === 'stoch' && x.visible !== false); return l ? `STOCH(${l.params.kLength || 14},${l.params.dLength || 3})` : 'STOCH'; }, [layers]);
    const atrLabel = useMemo(() => { const l = layers.find((x) => x.type === 'atr' && x.visible !== false); return l ? `ATR(${l.params.length || 14})` : 'ATR'; }, [layers]);

    useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }, [settings]);
    useEffect(() => { localStorage.setItem(`${STORAGE_KEY}_layers`, JSON.stringify(layers)); }, [layers]);
    useEffect(() => { localStorage.setItem(drawingStoreKey(symbol), JSON.stringify(drawings)); }, [drawings, symbol]);
    // Keep refs in sync so drag handler always reads current values without re-registering
    useEffect(() => { magnetRef.current = settings.magnet; }, [settings.magnet]);
    useEffect(() => { priceBarsRef.current = priceBars; }, [priceBars]);
    useEffect(() => {
        try { setDrawings(parseStoredDrawings(JSON.parse(localStorage.getItem(drawingStoreKey(symbol)) || '[]'))); }
        catch { setDrawings([]); }
        setSelectedDrawingId(null); setDraftPoint(null); setDraftPoint2(null);
    }, [symbol]);

    // ── Main chart creation (stable — does NOT depend on mainH) ──────────
    useEffect(() => {
        if (!chartContainerRef.current) return undefined;
        const el = chartContainerRef.current;
        const textColor = cssVar(el, '--fg', '#d7dbe2');
        const fontFamily = cssVar(el, '--font', 'Verdana, Arial, Helvetica, sans-serif');
        const chart = createChart(el, {
            width: el.clientWidth, height: mainHRef.current,
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor, fontFamily },
            grid: { vertLines: { color: 'rgba(100,120,150,0.12)' }, horzLines: { color: 'rgba(100,120,150,0.12)' } },
            rightPriceScale: { borderColor: 'rgba(130,150,175,0.28)', scaleMargins: { top: 0.06, bottom: 0.25 }, mode: settings.logScale ? 1 : 0 },
            leftPriceScale: { visible: false },
            timeScale: { borderColor: 'rgba(130,150,175,0.28)', timeVisible: true, secondsVisible: false },
            crosshair: { mode: CrosshairMode.Normal },
            localization: { priceFormatter: (v) => Number(v).toFixed(2) },
        });
        chartRef.current = chart;
        // Bump viewportTick on any pan/zoom so drawings re-render
        const onRangeChange = () => setViewportTick((t) => t + 1);
        chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);
        const ro = new ResizeObserver(() => { if (el) chart.applyOptions({ width: el.clientWidth, height: mainHRef.current }); onRangeChange(); });
        ro.observe(el);
        return () => { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange); ro.disconnect(); chart.remove(); chartRef.current = null; mainSeriesRef.current = null; volumeSeriesRef.current = null; compareSeriesRef.current = null; indicatorSeriesRef.current = []; indicatorGuidesRef.current = []; };
    }, [settings.showVolume, settings.logScale]);

    // ── Resize chart without recreating (fullscreen / pane count changes) ─
    useEffect(() => {
        if (chartRef.current && chartContainerRef.current) {
            chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height: mainH });
        }
    }, [mainH]);

    // ── Main series ─────────────────────────────────────────────────────────
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        if (mainSeriesRef.current) { chart.removeSeries(mainSeriesRef.current); mainSeriesRef.current = null; }
        const ct = settings.chartType;
        if (ct === 'line') {
            mainSeriesRef.current = chart.addLineSeries({ color: settings.lineColor, lineWidth: 2, priceScaleId: 'right' });
            mainSeriesRef.current.setData(priceBars.map((b) => ({ time: makeBusinessTime(b.time), value: b.close })));
        } else if (ct === 'area') {
            mainSeriesRef.current = chart.addAreaSeries({ lineColor: settings.lineColor, topColor: settings.areaTopColor, bottomColor: settings.areaBottomColor, priceScaleId: 'right' });
            mainSeriesRef.current.setData(priceBars.map((b) => ({ time: makeBusinessTime(b.time), value: b.close })));
        } else if (ct === 'bars') {
            mainSeriesRef.current = chart.addBarSeries({ upColor: settings.candleUp, downColor: settings.candleDown, thinBars: false, priceScaleId: 'right' });
            mainSeriesRef.current.setData(priceBars.map((b) => ({ time: makeBusinessTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
        } else {
            mainSeriesRef.current = chart.addCandlestickSeries({ upColor: settings.candleUp, downColor: settings.candleDown, wickUpColor: settings.wickUp, wickDownColor: settings.wickDown, borderUpColor: settings.borderUp, borderDownColor: settings.borderDown, priceScaleId: 'right' });
            mainSeriesRef.current.setData(priceBars.map((b) => ({ time: makeBusinessTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close })));
        }
        if (volumeSeriesRef.current) { chart.removeSeries(volumeSeriesRef.current); volumeSeriesRef.current = null; }
        if (settings.showVolume) {
            volumeSeriesRef.current = chart.addHistogramSeries({ priceScaleId: 'volume', priceFormat: { type: 'volume' }, base: 0, lastValueVisible: false, priceLineVisible: false });
            chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, drawTicks: false, borderVisible: false });
            volumeSeriesRef.current.setData(toVolumeHistogram(baseBars).map((r) => ({ time: makeBusinessTime(r.time), value: r.value, color: r.color })));
        }
        if (priceBars.length > 0) chart.timeScale().fitContent();
    }, [priceBars, baseBars, settings]);

    // ── Crosshair legend ────────────────────────────────────────────────────
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || !mainSeriesRef.current) return undefined;
        const handler = (param) => {
            if (!param.time) {
                const last = priceBars[priceBars.length - 1];
                if (last) setLegendData({ o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume });
                return;
            }
            const d = param.seriesData.get(mainSeriesRef.current);
            if (d) setLegendData({ o: d.open ?? d.value, h: d.high ?? d.value, l: d.low ?? d.value, c: d.close ?? d.value, v: null });
        };
        chart.subscribeCrosshairMove(handler);
        if (priceBars.length) { const last = priceBars[priceBars.length - 1]; setLegendData({ o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume }); }
        return () => chart.unsubscribeCrosshairMove(handler);
    }, [priceBars]);

    // ── Overlay indicators ──────────────────────────────────────────────────
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || !mainSeriesRef.current) return;
        indicatorSeriesRef.current.forEach((s) => chart.removeSeries(s));
        indicatorSeriesRef.current = [];
        indicatorGuidesRef.current.forEach((pl) => pl.series.removePriceLine(pl.line));
        indicatorGuidesRef.current = [];
        computeOverlayIndicators(priceBars, layers).forEach((overlay) => {
            const series = overlay.type === 'histogram' ? chart.addHistogramSeries(overlay.options || {}) : chart.addLineSeries(overlay.options || {});
            series.setData(overlay.data.map((p) => ({ ...p, time: makeBusinessTime(p.time) })));
            indicatorSeriesRef.current.push(series);
        });
    }, [layers, priceBars]);

    // ── Pane helper ─────────────────────────────────────────────────────────
    const createPane = useCallback((containerRef, chartRefObj, panels, buildFn) => {
        if (!panels.length || !containerRef.current || !chartRef.current) {
            if (chartRefObj.current) { chartRefObj.current.remove(); chartRefObj.current = null; }
            return undefined;
        }
        const el = containerRef.current;
        const chart = createChart(el, {
            width: el.clientWidth, height: panelH,
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssVar(el, '--fg', '#d7dbe2'), fontFamily: cssVar(el, '--font', 'Verdana') },
            grid: { vertLines: { color: 'rgba(100,120,150,0.10)' }, horzLines: { color: 'rgba(100,120,150,0.10)' } },
            rightPriceScale: { borderColor: 'rgba(130,150,175,0.28)', scaleMargins: { top: 0.10, bottom: 0.10 } },
            leftPriceScale: { visible: false },
            timeScale: { visible: false, borderColor: 'rgba(130,150,175,0.18)' },
            crosshair: { mode: CrosshairMode.Normal },
            localization: { priceFormatter: (v) => Number(v).toFixed(2) },
        });
        chartRefObj.current = chart;
        const seriesMap = buildFn(chart, panels);
        const syncRange = (r) => { if (r) chart.timeScale().setVisibleLogicalRange(r); };
        const mainTs = chartRef.current.timeScale();
        mainTs.subscribeVisibleLogicalRangeChange(syncRange);
        const ir = mainTs.getVisibleLogicalRange();
        if (ir) chart.timeScale().setVisibleLogicalRange(ir);
        const ro = new ResizeObserver(() => { if (el) chart.applyOptions({ width: el.clientWidth, height: panelH }); });
        ro.observe(el);
        return { chart, syncRange, mainTs, ro, seriesMap };
    }, [panelH]);

    // ── RSI pane ────────────────────────────────────────────────────────────
    useEffect(() => {
        const res = createPane(rsiContainerRef, rsiChartRef, rsiPanels, (chart, panels) => {
            const map = {};
            panels.forEach((p) => {
                const line = chart.addLineSeries({ color: p.color, lineWidth: p.lineWidth, lastValueVisible: false });
                line.setData(p.data.map((d) => ({ ...d, time: makeBusinessTime(d.time) })));
                line.createPriceLine({ price: p.overbought, color: 'rgba(130,150,175,0.7)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '' });
                line.createPriceLine({ price: p.oversold, color: 'rgba(130,150,175,0.7)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '' });
                map[p.id] = line;
            });
            return map;
        });
        if (!res) return undefined;
        const crossHandler = (param) => {
            if (!param.time) { setRsiLegend(null); return; }
            const vals = {};
            Object.entries(res.seriesMap).forEach(([id, s]) => { const d = param.seriesData.get(s); if (d) vals[id] = d.value; });
            setRsiLegend(vals);
        };
        res.chart.subscribeCrosshairMove(crossHandler);
        return () => { res.mainTs.unsubscribeVisibleLogicalRangeChange(res.syncRange); res.ro.disconnect(); res.chart.remove(); if (rsiChartRef.current === res.chart) rsiChartRef.current = null; };
    }, [showRsi, rsiPanels, panelH, createPane]);

    // ── MACD pane ───────────────────────────────────────────────────────────
    useEffect(() => {
        const res = createPane(macdContainerRef, macdChartRef, macdPanels, (chart, panels) => {
            const map = {};
            panels.forEach((p) => {
                const hist = chart.addHistogramSeries({ base: 0, lastValueVisible: false, priceLineVisible: false });
                hist.setData(p.histData.map((d) => ({ ...d, time: makeBusinessTime(d.time) })));
                const ml = chart.addLineSeries({ color: p.macdColor, lineWidth: 2, lastValueVisible: false });
                ml.setData(p.macdData.map((d) => ({ ...d, time: makeBusinessTime(d.time) })));
                const sl = chart.addLineSeries({ color: p.signalColor, lineWidth: 2, lineStyle: LineStyle.Dashed, lastValueVisible: false });
                sl.setData(p.signalData.map((d) => ({ ...d, time: makeBusinessTime(d.time) })));
                map[p.id] = { macd: ml, signal: sl, hist };
            });
            return map;
        });
        if (!res) return undefined;
        const crossHandler = (param) => {
            if (!param.time) { setMacdLegend(null); return; }
            const vals = {};
            Object.entries(res.seriesMap).forEach(([id, obj]) => {
                const md = param.seriesData.get(obj.macd); const sd = param.seriesData.get(obj.signal); const hd = param.seriesData.get(obj.hist);
                vals[id] = { macd: md?.value, signal: sd?.value, hist: hd?.value };
            });
            setMacdLegend(vals);
        };
        res.chart.subscribeCrosshairMove(crossHandler);
        return () => { res.mainTs.unsubscribeVisibleLogicalRangeChange(res.syncRange); res.ro.disconnect(); res.chart.remove(); if (macdChartRef.current === res.chart) macdChartRef.current = null; };
    }, [showMacd, macdPanels, panelH, createPane]);

    // ── Stochastic pane ─────────────────────────────────────────────────────
    useEffect(() => {
        const res = createPane(stochContainerRef, stochChartRef, stochPanels, (chart, panels) => {
            const map = {};
            panels.forEach((p) => {
                const kl = chart.addLineSeries({ color: p.kColor, lineWidth: p.lineWidth, lastValueVisible: false });
                kl.setData(p.kData.map((d) => ({ ...d, time: makeBusinessTime(d.time) })));
                const dl = chart.addLineSeries({ color: p.dColor, lineWidth: p.lineWidth, lineStyle: LineStyle.Dashed, lastValueVisible: false });
                dl.setData(p.dData.map((d) => ({ ...d, time: makeBusinessTime(d.time) })));
                kl.createPriceLine({ price: p.overbought, color: 'rgba(130,150,175,0.7)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '' });
                kl.createPriceLine({ price: p.oversold, color: 'rgba(130,150,175,0.7)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '' });
                map[p.id] = { k: kl, d: dl };
            });
            return map;
        });
        if (!res) return undefined;
        const crossHandler = (param) => {
            if (!param.time) { setStochLegend(null); return; }
            const vals = {};
            Object.entries(res.seriesMap).forEach(([id, obj]) => { const kd = param.seriesData.get(obj.k); const dd = param.seriesData.get(obj.d); vals[id] = { k: kd?.value, d: dd?.value }; });
            setStochLegend(vals);
        };
        res.chart.subscribeCrosshairMove(crossHandler);
        return () => { res.mainTs.unsubscribeVisibleLogicalRangeChange(res.syncRange); res.ro.disconnect(); res.chart.remove(); if (stochChartRef.current === res.chart) stochChartRef.current = null; };
    }, [showStoch, stochPanels, panelH, createPane]);

    // ── ATR pane ────────────────────────────────────────────────────────────
    useEffect(() => {
        const res = createPane(atrContainerRef, atrChartRef, atrPanels, (chart, panels) => {
            const map = {};
            panels.forEach((p) => {
                const line = chart.addLineSeries({ color: p.color, lineWidth: p.lineWidth, lastValueVisible: false });
                line.setData(p.data.map((d) => ({ ...d, time: makeBusinessTime(d.time) })));
                map[p.id] = line;
            });
            return map;
        });
        if (!res) return undefined;
        const crossHandler = (param) => {
            if (!param.time) { setAtrLegend(null); return; }
            const vals = {};
            Object.entries(res.seriesMap).forEach(([id, s]) => { const d = param.seriesData.get(s); if (d) vals[id] = d.value; });
            setAtrLegend(vals);
        };
        res.chart.subscribeCrosshairMove(crossHandler);
        return () => { res.mainTs.unsubscribeVisibleLogicalRangeChange(res.syncRange); res.ro.disconnect(); res.chart.remove(); if (atrChartRef.current === res.chart) atrChartRef.current = null; };
    }, [showAtr, atrPanels, panelH, createPane]);

    // ── Compare series ──────────────────────────────────────────────────────
    useEffect(() => {
        let alive = true;
        (async () => {
            const cmp = String(settings.compareSymbol || '').trim().toUpperCase();
            if (!cmp || !onLoadCompareHistory) { setCompareBars([]); setCompareStatus(''); return; }
            setCompareStatus('loading');
            try { const rows = await onLoadCompareHistory(cmp); if (!alive) return; setCompareBars(normalizeBars(rows)); setCompareStatus('ok'); }
            catch { if (!alive) return; setCompareBars([]); setCompareStatus('error'); }
        })();
        return () => { alive = false; };
    }, [settings.compareSymbol, onLoadCompareHistory, activeInterval, activeRange]);

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        if (compareSeriesRef.current) { chart.removeSeries(compareSeriesRef.current); compareSeriesRef.current = null; }
        if (!compareBars.length) return;
        const base = compareBars[0].close || 1;
        compareSeriesRef.current = chart.addLineSeries({ color: '#9b5de5', lineWidth: 2, priceScaleId: 'right', priceLineVisible: false, lastValueVisible: false });
        compareSeriesRef.current.setData(compareBars.map((b) => ({ time: makeBusinessTime(b.time), value: ((b.close / base) - 1) * 100 })));
    }, [compareBars]);

    // ── Click handler (drawings) ────────────────────────────────────────────
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || !mainSeriesRef.current) return undefined;
        const onClick = (param) => {
            if (!param.point || !Number.isFinite(param.point.x) || !Number.isFinite(param.point.y)) return;
            const tool = settings.activeTool;
            if (tool === 'none') return;
            const clickedTime = Number(param.time);
            let clickedPrice = Number(mainSeriesRef.current.coordinateToPrice(param.point.y));
            if (!Number.isFinite(clickedTime) || !Number.isFinite(clickedPrice)) return;
            if (settings.magnet && priceBars.length) {
                const bar = priceBars.find((b) => b.time === clickedTime);
                if (bar) {
                    const prices = [bar.open, bar.high, bar.low, bar.close];
                    clickedPrice = prices.reduce((best, p) => (Math.abs(p - clickedPrice) < Math.abs(best - clickedPrice) ? p : best));
                }
            }
            const point = { time: clickedTime, price: clickedPrice };
            const pushDrawing = (d) => {
                setDrawings((prev) => [...prev, d]);
                setSelectedDrawingId(d.id);
                setDrawingHistory((h) => [...h.slice(0, historyPointer + 1), { action: 'add', drawing: d }]);
                setHistoryPointer((p) => p + 1);
                setSettings((s) => ({ ...s, activeTool: 'none' }));
            };
            if (tool === 'hline') { pushDrawing({ id: uid('draw'), type: 'hline', points: [point], color: '#f4a261', lineWidth: 2 }); return; }
            if (tool === 'text') { pushDrawing({ id: uid('draw'), type: 'text', points: [point], color: '#e9ecef', text: settings.defaultText || 'Note', fontSize: 12 }); return; }
            if (tool === 'channel') {
                if (!draftPoint) { setDraftPoint(point); return; }
                if (!draftPoint2) { setDraftPoint2(point); return; }
                pushDrawing({ id: uid('draw'), type: 'channel', points: [draftPoint, draftPoint2, point], color: '#4cc9f0', fillColor: 'rgba(76,201,240,0.10)', lineWidth: 1 });
                setDraftPoint(null); setDraftPoint2(null); return;
            }
            if (!draftPoint) { setDraftPoint(point); return; }
            if (tool === 'trend') { pushDrawing({ id: uid('draw'), type: 'trend', points: [draftPoint, point], color: '#ffd166', lineWidth: 2 }); }
            else if (tool === 'ray') { pushDrawing({ id: uid('draw'), type: 'ray', points: [draftPoint, point], color: '#ffd166', lineWidth: 2 }); }
            else if (tool === 'rect') { pushDrawing({ id: uid('draw'), type: 'rect', points: [draftPoint, point], color: '#4cc9f0', fillColor: 'rgba(76,201,240,0.18)', lineWidth: 1 }); }
            else if (tool === 'fib') { pushDrawing({ id: uid('draw'), type: 'fib', points: [draftPoint, point], color: '#ffafcc', lineWidth: 1 }); }
            setDraftPoint(null); setDraftPoint2(null);
        };
        chart.subscribeClick(onClick);
        return () => chart.unsubscribeClick(onClick);
    }, [settings.activeTool, draftPoint, draftPoint2, settings.defaultText, settings.magnet, priceBars, historyPointer]);

    // ── Drag handler ────────────────────────────────────────────────────────
    useEffect(() => {
        const onMove = (event) => {
            if (!dragRef.current || !chartRef.current || !mainSeriesRef.current || !chartContainerRef.current) return;
            // Use the chart's internal canvas for correct coordinate mapping
            const canvas = chartContainerRef.current.querySelector('canvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const time = Number(chartRef.current.timeScale().coordinateToTime(x));
            let price = Number(mainSeriesRef.current.coordinateToPrice(y));
            if (!Number.isFinite(time) || !Number.isFinite(price)) return;
            // Apply magnet snap via ref (avoids stale closure without re-registering listener)
            if (magnetRef.current && priceBarsRef.current.length) {
                const bar = priceBarsRef.current.find((b) => b.time === time);
                if (bar) {
                    const prices = [bar.open, bar.high, bar.low, bar.close];
                    price = prices.reduce((best, p) => (Math.abs(p - price) < Math.abs(best - price) ? p : best));
                }
            }
            const { id, handleIdx } = dragRef.current;
            if (handleIdx === -1) {
                // Whole-drawing drag: move all points by same delta
                const dr = dragRef.current;
                if (!dr.anchorTime) { dr.anchorTime = time; dr.anchorPrice = price; return; }
                const dt = time - dr.anchorTime;
                const dp = price - dr.anchorPrice;
                dr.anchorTime = time;
                dr.anchorPrice = price;
                setDrawings((prev) => prev.map((d) => {
                    if (d.id !== id) return d;
                    return { ...d, points: d.points.map((p) => ({ time: p.time + dt, price: p.price + dp })) };
                }));
            } else {
                setDrawings((prev) => prev.map((d) => { if (d.id !== id) return d; const nextPoints = d.points.map((p, idx) => (idx === handleIdx ? { time, price } : p)); return { ...d, points: nextPoints }; }));
            }
        };
        const onUp = () => { dragRef.current = null; };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, []);

    // ── Keyboard shortcuts ──────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') { setSettings((s) => ({ ...s, activeTool: 'none' })); setDraftPoint(null); setDraftPoint2(null); setSelectedDrawingId(null); setInlineEditId(null); }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
                e.preventDefault();
                const removed = drawings.find((d) => d.id === selectedDrawingId);
                setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
                setSelectedDrawingId(null);
                if (removed) { setDrawingHistory((h) => [...h.slice(0, historyPointer + 1), { action: 'remove', drawing: removed }]); setHistoryPointer((p) => p + 1); }
            }
            if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                e.preventDefault();
                if (historyPointer < 0) return;
                const entry = drawingHistory[historyPointer];
                if (entry?.action === 'add') setDrawings((prev) => prev.filter((d) => d.id !== entry.drawing.id));
                if (entry?.action === 'remove') setDrawings((prev) => [...prev, entry.drawing]);
                setHistoryPointer((p) => p - 1);
            }
            if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
                e.preventDefault();
                if (historyPointer >= drawingHistory.length - 1) return;
                const entry = drawingHistory[historyPointer + 1];
                if (entry?.action === 'add') setDrawings((prev) => [...prev, entry.drawing]);
                if (entry?.action === 'remove') setDrawings((prev) => prev.filter((d) => d.id !== entry.drawing.id));
                setHistoryPointer((p) => p + 1);
            }
        };
        const el = wrapRef.current;
        if (el) el.addEventListener('keydown', handler);
        return () => { if (el) el.removeEventListener('keydown', handler); };
    }, [selectedDrawingId, drawings, drawingHistory, historyPointer]);

    // ── Fullscreen ──────────────────────────────────────────────────────────
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);
    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else wrapRef.current?.requestFullscreen();
    };
    const takeScreenshot = () => {
        const chart = chartRef.current;
        if (!chart) return;
        const canvas = chart.takeScreenshot();
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${symbol || 'chart'}_screenshot.png`; a.click();
            URL.revokeObjectURL(url);
        });
    };

    // ── Pane resize handler ──────────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e) => {
            if (!paneResizeRef.current) return;
            const delta = e.clientY - paneResizeRef.current.startY;
            const newH = Math.max(60, Math.min(300, paneResizeRef.current.startH + delta));
            setPanelH(newH);
        };
        const onUp = () => { paneResizeRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);
    const startPaneResize = (e) => { paneResizeRef.current = { startY: e.clientY, startH: panelH }; document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; };

    // ── Actions ─────────────────────────────────────────────────────────────
    const startHandleDrag = (id, handleIdx) => { dragRef.current = { id, handleIdx }; };
    const startBodyDrag = (id) => {
        const d = drawings.find((x) => x.id === id);
        if (!d) return;
        dragRef.current = { id, handleIdx: -1, startPoints: d.points.map((p) => ({ ...p })), anchorTime: null, anchorPrice: null };
    };
    const addLayer = (type) => {
        const preset = INDICATOR_PRESETS[type];
        if (!preset) return;
        setLayers((prev) => [...prev, { id: uid('layer'), type, visible: true, params: { ...preset.defaults } }]);
        setShowIndicatorMenu(false);
    };
    const removeLayer = (layerId) => { setLayers((prev) => prev.filter((l) => l.id !== layerId)); if (modal.targetId === layerId) setModal({ open: false, mode: 'layer', targetId: null }); };
    const toggleLayerVisibility = (layerId) => setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, visible: l.visible === false } : l)));
    const updateLayerParam = (layerId, key, value) => setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, params: { ...l.params, [key]: value } } : l)));
    const removeDrawing = (id) => { setDrawings((prev) => prev.filter((d) => d.id !== id)); if (selectedDrawingId === id) setSelectedDrawingId(null); };
    const selectedLayer = layers.find((l) => l.id === modal.targetId);
    const selectedDrawing = drawings.find((d) => d.id === modal.targetId);
    const legendDir = legendData && Number.isFinite(legendData.c) && Number.isFinite(legendData.o) ? (legendData.c >= legendData.o ? 'up' : 'down') : '';

    const updateDrawing = (id, patch) => setDrawings((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

    // ── Drawing SVG ─────────────────────────────────────────────────────────
    const drawingSvg = useMemo(() => {
        if (!chartRef.current || !mainSeriesRef.current) return null;
        const chart = chartRef.current; const series = mainSeriesRef.current;
        const toCoord = (p) => { const x = chart.timeScale().timeToCoordinate(p.time); const y = series.priceToCoordinate(p.price); if (!Number.isFinite(x) || !Number.isFinite(y)) return null; return { x, y }; };
        const selected = drawings.find((d) => d.id === selectedDrawingId);
        const handles = (d, ...indices) => selected?.id === d.id ? indices.map((i) => { const c = toCoord(d.points[i]); return c ? <circle key={i} cx={c.x} cy={c.y} r={4} fill={d.color} stroke="#fff" strokeWidth={1} style={{ cursor: 'grab' }} onPointerDown={(e) => { e.stopPropagation(); startHandleDrag(d.id, i); }} /> : null; }) : null;

        const gProps = (d) => {
            const isSel = selectedDrawingId === d.id;
            const isHov = hoveredDrawingId === d.id;
            return {
                style: { pointerEvents: 'auto', cursor: isSel ? 'move' : 'pointer', opacity: isHov && !isSel ? 0.85 : 1 },
                onPointerDown: (e) => { if (isSel) { e.stopPropagation(); startBodyDrag(d.id); } else { setSelectedDrawingId(d.id); } },
                onPointerEnter: () => setHoveredDrawingId(d.id),
                onPointerLeave: () => setHoveredDrawingId((prev) => prev === d.id ? null : prev),
            };
        };
        // Transparent wider hit line rendered behind visible line for easier click targets
        const hitLine = (x1, y1, x2, y2) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />;

        return (
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} onClick={(e) => { if (e.target.tagName === 'svg') { setSelectedDrawingId(null); setInlineEditId(null); } }}>
                {drawings.map((d) => {
                    const da = dashArray(d.lineStyle);
                    if (d.type === 'hline') {
                        const p = toCoord(d.points[0]); if (!p) return null;
                        return (<g key={d.id} {...gProps(d)}>{hitLine(0, p.y, 5000, p.y)}<line x1={0} y1={p.y} x2={5000} y2={p.y} stroke={d.color} strokeWidth={d.lineWidth || 2} strokeDasharray={da} />{handles(d, 0)}</g>);
                    }
                    if (d.type === 'trend') {
                        const a = toCoord(d.points[0]); const b = toCoord(d.points[1]); if (!a || !b) return null;
                        return (<g key={d.id} {...gProps(d)}>{hitLine(a.x, a.y, b.x, b.y)}<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={d.color} strokeWidth={d.lineWidth || 2} strokeDasharray={da} />{handles(d, 0, 1)}</g>);
                    }
                    if (d.type === 'ray') {
                        const a = toCoord(d.points[0]); const b = toCoord(d.points[1]); if (!a || !b) return null;
                        const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.sqrt(dx * dx + dy * dy) || 1;
                        const ex = b.x + (dx / len) * 5000; const ey = b.y + (dy / len) * 5000;
                        return (<g key={d.id} {...gProps(d)}>{hitLine(a.x, a.y, ex, ey)}<line x1={a.x} y1={a.y} x2={ex} y2={ey} stroke={d.color} strokeWidth={d.lineWidth || 2} strokeDasharray={da} />{handles(d, 0, 1)}</g>);
                    }
                    if (d.type === 'channel') {
                        const a = toCoord(d.points[0]); const b = toCoord(d.points[1]); const c = toCoord(d.points[2]); if (!a || !b || !c) return null;
                        const offX = c.x - a.x; const offY = c.y - a.y;
                        return (<g key={d.id} {...gProps(d)}>
                            <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${b.x + offX},${b.y + offY} ${a.x + offX},${a.y + offY}`} fill={d.fillColor || 'rgba(76,201,240,0.10)'} />
                            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={d.color} strokeWidth={d.lineWidth || 1} strokeDasharray={da} />
                            <line x1={a.x + offX} y1={a.y + offY} x2={b.x + offX} y2={b.y + offY} stroke={d.color} strokeWidth={d.lineWidth || 1} strokeDasharray={da} />
                            {handles(d, 0, 1, 2)}
                        </g>);
                    }
                    if (d.type === 'rect') {
                        const a = toCoord(d.points[0]); const b = toCoord(d.points[1]); if (!a || !b) return null;
                        const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
                        return (<g key={d.id} {...gProps(d)}><rect x={x} y={y} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)} fill={d.fillColor || 'rgba(76,201,240,0.15)'} stroke={d.color} strokeWidth={d.lineWidth || 1} strokeDasharray={da} />{handles(d, 0, 1)}</g>);
                    }
                    if (d.type === 'fib') {
                        const a = toCoord(d.points[0]); const b = toCoord(d.points[1]); if (!a || !b) return null;
                        const dy = b.y - a.y;
                        return (<g key={d.id} {...gProps(d)}>{FIB_LEVELS.map((lvl) => { const y = a.y + dy * lvl; return (<g key={`${d.id}_${lvl}`}><line x1={Math.min(a.x, b.x)} y1={y} x2={Math.max(a.x, b.x)} y2={y} stroke={d.color} strokeWidth={1} strokeDasharray={da} /><text x={Math.max(a.x, b.x) + 6} y={y + 3} fill={d.color} fontSize="10">{(lvl * 100).toFixed(1)}%</text></g>); })}{handles(d, 0, 1)}</g>);
                    }
                    if (d.type === 'text') {
                        const a = toCoord(d.points[0]); if (!a) return null;
                        return (<g key={d.id} {...gProps(d)} onDoubleClick={() => setInlineEditId(d.id)}>
                            <rect x={a.x} y={a.y - 18} width={Math.max(60, String(d.text || '').length * 7)} height={18} fill="rgba(30,35,43,0.9)" stroke={d.color} strokeWidth={1} />
                            <text x={a.x + 4} y={a.y - 5} fill={d.color} fontSize={d.fontSize || 12}>{d.text || 'Note'}</text>
                            {handles(d, 0)}
                        </g>);
                    }
                    return null;
                })}
                {draftPoint && (() => { const p = toCoord(draftPoint); if (!p) return null; return <circle cx={p.x} cy={p.y} r={4} fill="#ffd166" />; })()}
                {draftPoint2 && (() => { const p = toCoord(draftPoint2); if (!p) return null; return <circle cx={p.x} cy={p.y} r={4} fill="#ffd166" />; })()}
            </svg>
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawings, selectedDrawingId, hoveredDrawingId, draftPoint, draftPoint2, viewportTick]);

    // ── Popover position for selected drawing ─────────────────────────────
    const popoverPos = useMemo(() => {
        if (!selectedDrawingId || !chartRef.current || !mainSeriesRef.current) return null;
        const d = drawings.find((x) => x.id === selectedDrawingId);
        if (!d) return null;
        const ts = chartRef.current.timeScale();
        const ser = mainSeriesRef.current;
        // Use midpoint of first two points (or sole point for hline/text)
        const pts = d.points;
        let midTime, midPrice;
        if (pts.length >= 2) { midTime = (pts[0].time + pts[1].time) / 2; midPrice = (pts[0].price + pts[1].price) / 2; }
        else { midTime = pts[0].time; midPrice = pts[0].price; }
        const px = ts.timeToCoordinate(midTime);
        const py = ser.priceToCoordinate(midPrice);
        if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
        return { x: px, y: Math.max(0, py - 42) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDrawingId, drawings, viewportTick]);

    // ── Inline text edit position ───────────────────────────────────────
    const inlineEditPos = useMemo(() => {
        if (!inlineEditId || !chartRef.current || !mainSeriesRef.current) return null;
        const d = drawings.find((x) => x.id === inlineEditId);
        if (!d || d.type !== 'text') return null;
        const px = chartRef.current.timeScale().timeToCoordinate(d.points[0].time);
        const py = mainSeriesRef.current.priceToCoordinate(d.points[0].price);
        if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
        return { x: px, y: py - 18, text: d.text || '' };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inlineEditId, drawings, viewportTick]);

    // ── RENDER ───────────────────────────────────────────────────────────────
    const PaneDiv = ({ onMouseDown: omd }) => <div className="prochart-pane-divider" onMouseDown={omd || startPaneResize} onDoubleClick={() => setPanelH(140)} title="Drag to resize · Double-click to reset" />;
    return (
        <div ref={wrapRef} className={`prochart-wrap${isFullscreen ? ' fullscreen' : ''}`} tabIndex={0} style={{ outline: 'none' }}>
            {/* Top bar */}
            <div className="prochart-toolbar">
                <span className="prochart-legend-sym" style={{ pointerEvents: 'auto' }}>{String(symbol || '').toUpperCase()}</span>
                {legendData && (<>
                    <span className={`prochart-legend-val ${legendDir}`}>O {fmtOhlc(legendData.o)}</span>
                    <span className={`prochart-legend-val ${legendDir}`}>H {fmtOhlc(legendData.h)}</span>
                    <span className={`prochart-legend-val ${legendDir}`}>L {fmtOhlc(legendData.l)}</span>
                    <span className={`prochart-legend-val ${legendDir}`}>C {fmtOhlc(legendData.c)}</span>
                    {legendData.v != null && <span className="prochart-legend-val">V {fmtVol(legendData.v)}</span>}
                </>)}
                <span className="tb-sep" />
                <select className="prochart-tb-select" value={settings.chartType} onChange={(e) => setSettings((s) => ({ ...s, chartType: e.target.value }))}>
                    {CHART_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                {intervals && intervals.length > 0 && (
                    <select className="prochart-tb-select" value={activeInterval || ''} onChange={(e) => onIntervalChange?.(e.target.value)}>
                        {intervals.map((iv) => <option key={iv.key} value={iv.key}>{iv.label}</option>)}
                    </select>
                )}
                {ranges && ranges.length > 0 && (
                    <select className="prochart-tb-select" value={activeRange || ''} onChange={(e) => onRangeChange?.(e.target.value)}>
                        {ranges.map((r) => <option key={r.period} value={r.period}>{r.label}</option>)}
                    </select>
                )}
                {loading && <span className="prochart-loading-dot" title="Loading…" />}
                <span className="tb-sep" />
                <div style={{ position: 'relative' }}>
                    <button className="prochart-tb-btn" onClick={() => setShowIndicatorMenu((v) => !v)}>Indicators</button>
                    {showIndicatorMenu && (
                        <div className="prochart-dropdown" onMouseLeave={() => setShowIndicatorMenu(false)}>
                            <div className="prochart-dropdown-header">Overlays</div>
                            {Object.entries(INDICATOR_PRESETS).filter(([, v]) => v.cat === 'overlay').map(([k, v]) => (
                                <div key={k} className="prochart-dropdown-item" onClick={() => addLayer(k)}>{v.label}</div>
                            ))}
                            <div className="prochart-dropdown-header">Oscillators</div>
                            {Object.entries(INDICATOR_PRESETS).filter(([, v]) => v.cat === 'pane').map(([k, v]) => (
                                <div key={k} className="prochart-dropdown-item" onClick={() => addLayer(k)}>{v.label}</div>
                            ))}
                        </div>
                    )}
                </div>
                <button className={`prochart-tb-btn${settings.showVolume ? ' on' : ''}`} onClick={() => setSettings((s) => ({ ...s, showVolume: !s.showVolume }))}>Vol</button>
                <button className={`prochart-tb-btn${settings.logScale ? ' on' : ''}`} onClick={() => setSettings((s) => ({ ...s, logScale: !s.logScale }))}>Log</button>
                <button className={`prochart-tb-btn${settings.magnet ? ' on' : ''}`} onClick={() => setSettings((s) => ({ ...s, magnet: !s.magnet }))}>Mag</button>
                <div style={{ flex: 1 }} />
                {layers.length > 0 && (
                    <div className="prochart-indicator-chips">
                        {layers.map((l) => (
                            <span key={l.id} className={`prochart-chip${l.visible === false ? ' hidden' : ''}`} onClick={() => setModal({ open: true, mode: 'layer', targetId: l.id })}>
                                <span className="chip-dot" title={l.visible !== false ? 'Click to hide' : 'Click to show'} style={{ background: l.visible !== false ? (l.params.color || l.params.macdColor || l.params.kColor || '#888') : 'var(--muted)' }} onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(l.id); }} />
                                {chipLabel(l)}
                                <span className="chip-x" onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }}>x</span>
                            </span>
                        ))}
                    </div>
                )}
                {compareStatus === 'loading' && <span style={{ fontSize: 10, color: 'var(--muted)' }}>cmp...</span>}
                <input className="prochart-tb-select" style={{ width: 60 }} placeholder="Cmp" value={settings.compareSymbol} onChange={(e) => setSettings((s) => ({ ...s, compareSymbol: e.target.value.toUpperCase() }))} title="Compare symbol" />
                <button className="prochart-tb-btn" onClick={takeScreenshot} title="Screenshot">PNG</button>
                <button className="prochart-tb-btn" onClick={toggleFullscreen}>{isFullscreen ? 'Exit' : 'Full'}</button>
            </div>

            {/* Main body: left toolbar + charts + drawing panel */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {/* Left vertical icon toolbar */}
                <div className="prochart-left-toolbar">
                    {DRAWING_TOOLS.map((t) => (
                        <button key={t.key} className={settings.activeTool === t.key ? 'active' : ''} title={t.label} onClick={() => { setSettings((s) => ({ ...s, activeTool: t.key })); setDraftPoint(null); setDraftPoint2(null); }}>
                            <ToolIcon type={t.key} />
                        </button>
                    ))}
                    <div className="tb-sep-h" />
                    <button className={showDrawingPanel ? 'active' : ''} title="Drawings list" onClick={() => setShowDrawingPanel((v) => !v)}>
                        <ToolIcon type="drawings" />
                    </button>
                </div>

                {/* Chart + panes stack */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                    {/* Main chart */}
                    <div style={{ position: 'relative', height: mainH, minWidth: 0 }}>
                        <div className="prochart-watermark">{String(symbol || '').toUpperCase()}</div>
                        <div ref={chartContainerRef} style={{ height: mainH, width: '100%' }} />
                        <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{drawingSvg}</div>
                        {legendData && (
                            <div style={{
                                position: 'absolute', bottom: 28, left: 8, pointerEvents: 'none',
                                background: 'rgba(20,23,30,0.82)', border: '1px solid rgba(130,150,175,0.25)',
                                padding: '4px 7px', fontFamily: 'var(--mono, monospace)', fontSize: 10,
                                lineHeight: 1.55, color: 'rgba(200,210,220,0.9)', zIndex: 4, minWidth: 110,
                            }}>
                                {[['O', legendData.o], ['H', legendData.h], ['L', legendData.l], ['C', legendData.c]].map(([k, v]) => (
                                    <div key={k}>
                                        <span style={{ color: 'rgba(150,160,175,0.7)', width: 12, display: 'inline-block' }}>{k}</span>
                                        {' '}
                                        <span className={`prochart-legend-val ${legendDir}`}>{fmtOhlc(v)}</span>
                                    </div>
                                ))}
                                {legendData.v != null && (
                                    <div>
                                        <span style={{ color: 'rgba(150,160,175,0.7)', width: 12, display: 'inline-block' }}>V</span>
                                        {' '}{fmtVol(legendData.v)}
                                    </div>
                                )}
                            </div>
                        )}
                        {draftPoint && <div className="prochart-draft-hint">Click next point{settings.activeTool === 'channel' && !draftPoint2 ? ' (2/3)' : settings.activeTool === 'channel' ? ' (3/3)' : ''}</div>}
                        {/* Click-away dismiss layer */}
                        {popoverPos && selectedDrawingId && settings.activeTool === 'none' && (
                            <div style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'auto' }} onClick={() => { setSelectedDrawingId(null); setInlineEditId(null); }} />
                        )}
                        {/* Inline edit popover */}
                        {popoverPos && selectedDrawingId && settings.activeTool === 'none' && (() => {
                            const d = drawings.find((x) => x.id === selectedDrawingId);
                            if (!d) return null;
                            const hasLine = ['hline', 'trend', 'ray', 'channel', 'fib'].includes(d.type);
                            const hasFill = ['rect', 'channel'].includes(d.type);
                            const isText = d.type === 'text';
                            return (
                                <div className="prochart-popover" style={{ left: popoverPos.x, top: popoverPos.y }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                                    {/* Header with close */}
                                    <div className="popover-row" style={{ justifyContent: 'space-between' }}>
                                        <span className="popover-label" style={{ minWidth: 0 }}>{DRAWING_LABELS[d.type] || d.type}</span>
                                        <button className="popover-btn" onClick={() => setSelectedDrawingId(null)} title="Close (Esc)">x</button>
                                    </div>
                                    {/* Color swatches */}
                                    <div className="popover-row">
                                        {SWATCH_COLORS.map((sw) => (
                                            <button key={sw} className={`popover-swatch${d.color === sw ? ' active' : ''}`} style={{ background: sw }} onClick={() => updateDrawing(d.id, { color: sw })} />
                                        ))}
                                    </div>
                                    {/* Line width */}
                                    {(hasLine || d.type === 'rect') && (
                                        <div className="popover-row">
                                            <span className="popover-label">Width</span>
                                            <button className="popover-btn" onClick={() => updateDrawing(d.id, { lineWidth: Math.max(1, (d.lineWidth || 2) - 1) })}>-</button>
                                            <span className="popover-val">{d.lineWidth || 2}</span>
                                            <button className="popover-btn" onClick={() => updateDrawing(d.id, { lineWidth: Math.min(8, (d.lineWidth || 2) + 1) })}>+</button>
                                        </div>
                                    )}
                                    {/* Line style */}
                                    {hasLine && (
                                        <div className="popover-row">
                                            <span className="popover-label">Style</span>
                                            {LINE_STYLES.map((ls) => (
                                                <button key={ls} className={`popover-btn${(d.lineStyle || 'solid') === ls ? ' active' : ''}`} onClick={() => updateDrawing(d.id, { lineStyle: ls })}>{ls}</button>
                                            ))}
                                        </div>
                                    )}
                                    {/* Fill color for rect/channel */}
                                    {hasFill && (
                                        <div className="popover-row">
                                            <span className="popover-label">Fill</span>
                                            <input type="color" value={String(d.fillColor || '#4cc9f0').slice(0, 7)} onChange={(e) => updateDrawing(d.id, { fillColor: e.target.value + '30' })} style={{ width: 22, height: 18, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                                        </div>
                                    )}
                                    {/* Text + fontSize */}
                                    {isText && (
                                        <>
                                            <div className="popover-row">
                                                <input className="popover-input" value={d.text || ''} onChange={(e) => updateDrawing(d.id, { text: e.target.value })} placeholder="Text" />
                                            </div>
                                            <div className="popover-row">
                                                <span className="popover-label">Size</span>
                                                <button className="popover-btn" onClick={() => updateDrawing(d.id, { fontSize: Math.max(8, (d.fontSize || 12) - 1) })}>-</button>
                                                <span className="popover-val">{d.fontSize || 12}</span>
                                                <button className="popover-btn" onClick={() => updateDrawing(d.id, { fontSize: Math.min(32, (d.fontSize || 12) + 1) })}>+</button>
                                            </div>
                                        </>
                                    )}
                                    {/* Delete */}
                                    <div className="popover-row" style={{ borderTop: '1px solid rgba(130,150,175,0.2)', paddingTop: 4, marginTop: 2 }}>
                                        <button className="popover-btn del" onClick={() => { removeDrawing(d.id); setSelectedDrawingId(null); }}>Delete</button>
                                    </div>
                                </div>
                            );
                        })()}
                        {/* Inline text edit */}
                        {inlineEditPos && inlineEditId && (() => {
                            const d = drawings.find((x) => x.id === inlineEditId);
                            if (!d || d.type !== 'text') return null;
                            return (
                                <input
                                    className="prochart-inline-text"
                                    style={{ left: inlineEditPos.x, top: inlineEditPos.y }}
                                    autoFocus
                                    defaultValue={inlineEditPos.text}
                                    onBlur={(e) => { updateDrawing(d.id, { text: e.target.value || 'Note' }); setInlineEditId(null); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } if (e.key === 'Escape') { setInlineEditId(null); } }}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                />
                            );
                        })()}
                    </div>

                    {/* RSI */}
                    {showRsi && (<>
                        <PaneDiv />
                        <div style={{ height: panelH, position: 'relative' }}>
                            <span className="prochart-pane-label">{rsiLabel}</span>
                            <div className="prochart-pane-legend">{rsiLegend && Object.values(rsiLegend).map((v, i) => { const p = rsiPanels[i]; const c = p && Number.isFinite(v) ? (v > p.overbought ? 'var(--neg)' : v < p.oversold ? 'var(--pos)' : p.color) : p?.color; return <span key={i} style={{ color: c }}>{fmtOhlc(v)}</span>; })}</div>
                            <div ref={rsiContainerRef} style={{ height: panelH, width: '100%' }} />
                        </div>
                    </>)}
                    {/* MACD */}
                    {showMacd && (<>
                        <PaneDiv />
                        <div style={{ height: panelH, position: 'relative' }}>
                            <span className="prochart-pane-label">{macdLabel}</span>
                            <div className="prochart-pane-legend">{macdLegend && Object.values(macdLegend).map((v, i) => (<span key={i}><span style={{ color: macdPanels[i]?.macdColor }}>M {fmtOhlc(v.macd)}</span> <span style={{ color: macdPanels[i]?.signalColor }}>S {fmtOhlc(v.signal)}</span> <span style={{ color: v.hist >= 0 ? macdPanels[i]?.histPos : macdPanels[i]?.histNeg }}>H {fmtOhlc(v.hist)}</span></span>))}</div>
                            <div ref={macdContainerRef} style={{ height: panelH, width: '100%' }} />
                        </div>
                    </>)}
                    {/* Stochastic */}
                    {showStoch && (<>
                        <PaneDiv />
                        <div style={{ height: panelH, position: 'relative' }}>
                            <span className="prochart-pane-label">{stochLabel}</span>
                            <div className="prochart-pane-legend">{stochLegend && Object.values(stochLegend).map((v, i) => (<span key={i}><span style={{ color: stochPanels[i]?.kColor }}>%K {fmtOhlc(v.k)}</span> <span style={{ color: stochPanels[i]?.dColor }}>%D {fmtOhlc(v.d)}</span></span>))}</div>
                            <div ref={stochContainerRef} style={{ height: panelH, width: '100%' }} />
                        </div>
                    </>)}
                    {/* ATR */}
                    {showAtr && (<>
                        <PaneDiv />
                        <div style={{ height: panelH, position: 'relative' }}>
                            <span className="prochart-pane-label">{atrLabel}</span>
                            <div className="prochart-pane-legend">{atrLegend && Object.values(atrLegend).map((v, i) => <span key={i} style={{ color: atrPanels[i]?.color }}>{fmtOhlc(v)}</span>)}</div>
                            <div ref={atrContainerRef} style={{ height: panelH, width: '100%' }} />
                        </div>
                    </>)}
                </div>

                {/* Drawing management panel */}
                {showDrawingPanel && (
                    <div className="prochart-drawing-panel">
                        <div className="prochart-drawing-panel-header">
                            <span>Drawings ({drawings.length})</span>
                            <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowDrawingPanel(false)}>x</button>
                        </div>
                        {drawings.length === 0 && <div style={{ padding: 8, fontSize: 11, color: 'var(--muted)' }}>No drawings yet</div>}
                        {drawings.map((d) => (
                            <div key={d.id} className={`prochart-drawing-item${selectedDrawingId === d.id ? ' selected' : ''}`} onClick={() => setSelectedDrawingId(d.id)}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                                <span>{DRAWING_LABELS[d.type] || d.type}{d.type === 'text' ? `: ${d.text}` : ''}</span>
                                <span className="drawing-actions">
                                    <button className="drawing-btn edit-btn" title="Edit" onClick={(e) => { e.stopPropagation(); setModal({ open: true, mode: 'drawing', targetId: d.id }); }}>E</button>
                                    <button className="drawing-btn" title="Delete" onClick={(e) => { e.stopPropagation(); removeDrawing(d.id); }}>x</button>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Settings modal */}
            {modal.open && (
                <div className="prochart-modal-backdrop" onClick={() => setModal({ open: false, mode: 'layer', targetId: null })}>
                    <div className="prochart-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 8 }}>
                            <strong>{modal.mode === 'layer' ? 'Indicator Settings' : 'Drawing Settings'}</strong>
                            <div className="spacer" />
                            <button className="btn" onClick={() => setModal({ open: false, mode: 'layer', targetId: null })}>Close</button>
                        </div>
                        {modal.mode === 'layer' && selectedLayer && (
                            <div style={{ display: 'grid', gap: 6 }}>
                                <div className="mono" style={{ fontSize: 11 }}>{INDICATOR_PRESETS[selectedLayer.type]?.label}</div>
                                {Object.entries(selectedLayer.params).map(([k, v]) => (
                                    <label key={k} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 6, alignItems: 'center', fontSize: 11 }}>
                                        <span className="mono">{k}</span>
                                        {String(k).toLowerCase().includes('color') ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                                    {SWATCH_COLORS.map((sw) => (
                                                        <button key={sw} title={sw} onClick={() => updateLayerParam(selectedLayer.id, k, sw)} style={{ width: 16, height: 16, borderRadius: '50%', background: sw, cursor: 'pointer', padding: 0, border: String(v).toLowerCase() === sw.toLowerCase() ? '2px solid var(--fg)' : '1px solid rgba(130,150,175,0.3)' }} />
                                                    ))}
                                                </div>
                                                <input type="color" value={String(v).slice(0, 7)} onChange={(e) => updateLayerParam(selectedLayer.id, k, e.target.value)} />
                                            </div>
                                        ) : typeof v === 'number' ? <input className="input" type="number" step="0.1" value={v} onChange={(e) => updateLayerParam(selectedLayer.id, k, Number(e.target.value))} /> : <input className="input" value={String(v)} onChange={(e) => updateLayerParam(selectedLayer.id, k, e.target.value)} />}
                                    </label>
                                ))}
                            </div>
                        )}
                        {modal.mode === 'drawing' && selectedDrawing && (
                            <div style={{ display: 'grid', gap: 6 }}>
                                <label style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 6, alignItems: 'center', fontSize: 11 }}>
                                    <span className="mono">color</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                            {SWATCH_COLORS.map((sw) => (
                                                <button key={sw} title={sw} onClick={() => setDrawings((prev) => prev.map((d) => d.id === selectedDrawing.id ? { ...d, color: sw } : d))} style={{ width: 16, height: 16, borderRadius: '50%', background: sw, cursor: 'pointer', padding: 0, border: String(selectedDrawing.color || '').toLowerCase() === sw.toLowerCase() ? '2px solid var(--fg)' : '1px solid rgba(130,150,175,0.3)' }} />
                                            ))}
                                        </div>
                                        <input type="color" value={String(selectedDrawing.color || '#ffffff').slice(0, 7)} onChange={(e) => setDrawings((prev) => prev.map((d) => (d.id === selectedDrawing.id ? { ...d, color: e.target.value } : d)))} />
                                    </div>
                                </label>
                                {selectedDrawing.type === 'text' && (
                                    <label style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 6, alignItems: 'center', fontSize: 11 }}>
                                        <span className="mono">text</span>
                                        <input className="input" value={selectedDrawing.text || ''} onChange={(e) => setDrawings((prev) => prev.map((d) => (d.id === selectedDrawing.id ? { ...d, text: e.target.value } : d)))} />
                                    </label>
                                )}
                                <label style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 6, alignItems: 'center', fontSize: 11 }}>
                                    <span className="mono">lineWidth</span>
                                    <input className="input" type="number" min="1" max="5" value={selectedDrawing.lineWidth || 2} onChange={(e) => setDrawings((prev) => prev.map((d) => (d.id === selectedDrawing.id ? { ...d, lineWidth: Number(e.target.value) } : d)))} />
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ProChart;
