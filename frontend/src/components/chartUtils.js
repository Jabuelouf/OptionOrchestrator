import { LineStyle } from 'lightweight-charts';

// ── Helpers ──────────────────────────────────────────────────────────────────
export function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function toTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
    if (!value) return null;
    let str = String(value);
    // Normalize "YYYY-MM-DD HH:MM:SS..." to ISO 8601 by replacing first space with T
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(str)) str = str.replace(' ', 'T');
    const ms = Date.parse(str);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function normalizeBars(rows = []) {
    return rows
        .map((row) => {
            const time = toTimestamp(row.time ?? row.timestamp ?? row.date ?? row.datetime ?? row.t);
            const open = Number(row.open);
            const high = Number(row.high);
            const low = Number(row.low);
            const close = Number(row.close);
            const volume = Number(row.volume);
            if (!time || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
            return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);
}

export function buildHeikinAshi(bars = []) {
    if (!bars.length) return [];
    const result = [];
    let prevOpen = bars[0].open;
    let prevClose = bars[0].close;
    for (let i = 0; i < bars.length; i += 1) {
        const b = bars[i];
        const haClose = (b.open + b.high + b.low + b.close) / 4;
        const haOpen = i === 0 ? (b.open + b.close) / 2 : (prevOpen + prevClose) / 2;
        const haHigh = Math.max(b.high, haOpen, haClose);
        const haLow = Math.min(b.low, haOpen, haClose);
        result.push({ ...b, open: haOpen, high: haHigh, low: haLow, close: haClose });
        prevOpen = haOpen;
        prevClose = haClose;
    }
    return result;
}

export function makeBusinessTime(ts) {
    return Number.isFinite(ts) ? ts : null;
}

export function cssVar(element, name, fallback) {
    if (!element) return fallback;
    const value = getComputedStyle(element).getPropertyValue(name)?.trim();
    return value || fallback;
}

// ── Math / Indicators ────────────────────────────────────────────────────────
export function extractSource(bar, source = 'close') {
    if (source === 'hl2') return (bar.high + bar.low) / 2;
    if (source === 'hlc3') return (bar.high + bar.low + bar.close) / 3;
    if (source === 'ohlc4') return (bar.open + bar.high + bar.low + bar.close) / 4;
    return bar.close;
}

export function sma(values, length) {
    const out = new Array(values.length).fill(null);
    if (!Number.isFinite(length) || length < 1) return out;
    let sum = 0;
    for (let i = 0; i < values.length; i += 1) {
        sum += values[i];
        if (i >= length) sum -= values[i - length];
        if (i >= length - 1) out[i] = sum / length;
    }
    return out;
}

export function ema(values, length) {
    const out = new Array(values.length).fill(null);
    if (!Number.isFinite(length) || length < 1 || !values.length) return out;
    const alpha = 2 / (length + 1);
    let prev = values[0];
    for (let i = 0; i < values.length; i += 1) {
        prev = i === 0 ? values[0] : (values[i] * alpha + prev * (1 - alpha));
        out[i] = prev;
    }
    return out;
}

export function calcRsi(values, length = 14) {
    const out = new Array(values.length).fill(null);
    if (values.length < 2 || length < 2) return out;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= length && i < values.length; i += 1) {
        const diff = values[i] - values[i - 1];
        if (diff >= 0) gain += diff;
        else loss += Math.abs(diff);
    }
    if (values.length <= length) return out;
    let avgGain = gain / length;
    let avgLoss = loss / length;
    out[length] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    for (let i = length + 1; i < values.length; i += 1) {
        const diff = values[i] - values[i - 1];
        const up = diff > 0 ? diff : 0;
        const down = diff < 0 ? Math.abs(diff) : 0;
        avgGain = ((avgGain * (length - 1)) + up) / length;
        avgLoss = ((avgLoss * (length - 1)) + down) / length;
        const rs = avgLoss === 0 ? 999 : avgGain / avgLoss;
        out[i] = 100 - (100 / (1 + rs));
    }
    return out;
}

function stdDev(values, length) {
    const out = new Array(values.length).fill(null);
    if (length < 2) return out;
    for (let i = length - 1; i < values.length; i += 1) {
        const slice = values.slice(i - length + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / length;
        const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / length;
        out[i] = Math.sqrt(variance);
    }
    return out;
}

export function calcVwap(bars) {
    const out = new Array(bars.length).fill(null);
    let cumPV = 0;
    let cumV = 0;
    for (let i = 0; i < bars.length; i += 1) {
        const typical = (bars[i].high + bars[i].low + bars[i].close) / 3;
        cumPV += typical * (bars[i].volume || 0);
        cumV += bars[i].volume || 0;
        out[i] = cumV > 0 ? cumPV / cumV : null;
    }
    return out;
}

export function calcStochastic(bars, kLen = 14, dLen = 3) {
    const kOut = new Array(bars.length).fill(null);
    for (let i = kLen - 1; i < bars.length; i += 1) {
        let hi = -Infinity, lo = Infinity;
        for (let j = i - kLen + 1; j <= i; j += 1) {
            if (bars[j].high > hi) hi = bars[j].high;
            if (bars[j].low < lo) lo = bars[j].low;
        }
        kOut[i] = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100;
    }
    const dOut = sma(kOut.map(v => v ?? 0), dLen);
    return { k: kOut, d: dOut };
}

export function calcAtr(bars, length = 14) {
    const out = new Array(bars.length).fill(null);
    if (bars.length < 2) return out;
    const tr = bars.map((b, i) => {
        if (i === 0) return b.high - b.low;
        const prev = bars[i - 1].close;
        return Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
    });
    let sum = 0;
    for (let i = 0; i < length && i < tr.length; i += 1) sum += tr[i];
    if (tr.length >= length) out[length - 1] = sum / length;
    for (let i = length; i < tr.length; i += 1) {
        out[i] = (out[i - 1] * (length - 1) + tr[i]) / length;
    }
    return out;
}

export function toLinePoints(bars, values) {
    const points = [];
    for (let i = 0; i < bars.length; i += 1) {
        const v = values[i];
        if (Number.isFinite(v)) points.push({ time: bars[i].time, value: v });
    }
    return points;
}

export function toVolumeHistogram(bars) {
    return bars.map((b) => ({
        time: b.time,
        value: b.volume || 0,
        color: b.close >= b.open ? 'rgba(41,209,125,0.45)' : 'rgba(255,90,95,0.45)',
    }));
}

// ── Indicator computation ────────────────────────────────────────────────────
export const INDICATOR_PRESETS = {
    sma: { label: 'SMA', cat: 'overlay', defaults: { length: 20, source: 'close', color: '#ffd166', lineWidth: 2 } },
    ema: { label: 'EMA', cat: 'overlay', defaults: { length: 21, source: 'close', color: '#4cc9f0', lineWidth: 2 } },
    bbands: { label: 'Bollinger', cat: 'overlay', defaults: { length: 20, std: 2, source: 'close', basisColor: '#cdb4db', bandColor: '#6fa8dc', lineWidth: 1 } },
    vwap: { label: 'VWAP', cat: 'overlay', defaults: { color: '#ff6b6b', lineWidth: 2 } },
    rsi: { label: 'RSI', cat: 'pane', defaults: { length: 14, color: '#f4a261', lineWidth: 2, overbought: 70, oversold: 30 } },
    macd: { label: 'MACD', cat: 'pane', defaults: { fast: 12, slow: 26, signal: 9, macdColor: '#5aa2ff', signalColor: '#ffafcc', histPos: '#29d17d', histNeg: '#ff5a5f' } },
    stoch: { label: 'Stochastic', cat: 'pane', defaults: { kLength: 14, dLength: 3, kColor: '#5aa2ff', dColor: '#f4a261', lineWidth: 2, overbought: 80, oversold: 20 } },
    atr: { label: 'ATR', cat: 'pane', defaults: { length: 14, color: '#59c9a5', lineWidth: 2 } },
};

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];

export function computeOverlayIndicators(bars, layers) {
    const result = [];
    layers.forEach((layer) => {
        if (!layer.visible) return;
        if (layer.type === 'sma') {
            const source = bars.map((b) => extractSource(b, layer.params.source));
            result.push({ type: 'line', options: { color: layer.params.color, lineWidth: Number(layer.params.lineWidth || 2) }, data: toLinePoints(bars, sma(source, Number(layer.params.length || 20))) });
        }
        if (layer.type === 'ema') {
            const source = bars.map((b) => extractSource(b, layer.params.source));
            result.push({ type: 'line', options: { color: layer.params.color, lineWidth: Number(layer.params.lineWidth || 2) }, data: toLinePoints(bars, ema(source, Number(layer.params.length || 21))) });
        }
        if (layer.type === 'bbands') {
            const source = bars.map((b) => extractSource(b, layer.params.source));
            const length = Number(layer.params.length || 20);
            const basis = sma(source, length);
            const sd = stdDev(source, length);
            const mult = Number(layer.params.std || 2);
            const upper = basis.map((v, i) => (Number.isFinite(v) && Number.isFinite(sd[i]) ? v + sd[i] * mult : null));
            const lower = basis.map((v, i) => (Number.isFinite(v) && Number.isFinite(sd[i]) ? v - sd[i] * mult : null));
            result.push({ type: 'line', options: { color: layer.params.basisColor, lineWidth: Number(layer.params.lineWidth || 1) }, data: toLinePoints(bars, basis) });
            result.push({ type: 'line', options: { color: layer.params.bandColor, lineWidth: Number(layer.params.lineWidth || 1), lineStyle: LineStyle.Dashed }, data: toLinePoints(bars, upper) });
            result.push({ type: 'line', options: { color: layer.params.bandColor, lineWidth: Number(layer.params.lineWidth || 1), lineStyle: LineStyle.Dashed }, data: toLinePoints(bars, lower) });
        }
        if (layer.type === 'vwap') {
            result.push({ type: 'line', options: { color: layer.params.color, lineWidth: Number(layer.params.lineWidth || 2) }, data: toLinePoints(bars, calcVwap(bars)) });
        }
    });
    return result;
}

export function computeRsiPanels(bars, layers) {
    const close = bars.map((b) => b.close);
    return layers.filter((l) => l.visible && l.type === 'rsi').map((layer) => ({
        id: layer.id, color: layer.params.color, lineWidth: Number(layer.params.lineWidth || 2),
        overbought: Number(layer.params.overbought || 70), oversold: Number(layer.params.oversold || 30),
        data: toLinePoints(bars, calcRsi(close, Number(layer.params.length || 14))),
    }));
}

export function computeMacdPanels(bars, layers) {
    const close = bars.map((b) => b.close);
    return layers.filter((l) => l.visible && l.type === 'macd').map((layer) => {
        const fast = ema(close, Number(layer.params.fast || 12));
        const slow = ema(close, Number(layer.params.slow || 26));
        const macdLine = fast.map((v, i) => (Number.isFinite(v) && Number.isFinite(slow[i]) ? v - slow[i] : null));
        const signal = ema(macdLine.map((v) => (Number.isFinite(v) ? v : 0)), Number(layer.params.signal || 9));
        const hist = macdLine.map((v, i) => (Number.isFinite(v) && Number.isFinite(signal[i]) ? v - signal[i] : null));
        return {
            id: layer.id, macdColor: layer.params.macdColor, signalColor: layer.params.signalColor,
            histPos: layer.params.histPos, histNeg: layer.params.histNeg,
            macdData: toLinePoints(bars, macdLine), signalData: toLinePoints(bars, signal),
            histData: bars.map((b, i) => { const v = hist[i]; if (!Number.isFinite(v)) return null; return { time: b.time, value: v, color: v >= 0 ? layer.params.histPos : layer.params.histNeg }; }).filter(Boolean),
        };
    });
}

export function computeStochPanels(bars, layers) {
    return layers.filter((l) => l.visible && l.type === 'stoch').map((layer) => {
        const { k, d } = calcStochastic(bars, Number(layer.params.kLength || 14), Number(layer.params.dLength || 3));
        return {
            id: layer.id, kColor: layer.params.kColor, dColor: layer.params.dColor,
            lineWidth: Number(layer.params.lineWidth || 2),
            overbought: Number(layer.params.overbought || 80), oversold: Number(layer.params.oversold || 20),
            kData: toLinePoints(bars, k), dData: toLinePoints(bars, d),
        };
    });
}

export function computeAtrPanels(bars, layers) {
    return layers.filter((l) => l.visible && l.type === 'atr').map((layer) => ({
        id: layer.id, color: layer.params.color, lineWidth: Number(layer.params.lineWidth || 2),
        data: toLinePoints(bars, calcAtr(bars, Number(layer.params.length || 14))),
    }));
}

export function parseStoredLayers(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((l) => {
        if (!l || !l.id || !l.type || !INDICATOR_PRESETS[l.type]) return null;
        return { id: l.id, type: l.type, visible: l.visible !== false, params: { ...INDICATOR_PRESETS[l.type].defaults, ...(l.params || {}) } };
    }).filter(Boolean);
}

export function parseStoredDrawings(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((d) => {
        if (!d || !d.id || !d.type) return null;
        if (!Array.isArray(d.points) || d.points.some((p) => !Number.isFinite(p.time) || !Number.isFinite(p.price))) return null;
        return d;
    }).filter(Boolean);
}
