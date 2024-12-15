import { createChart, CrosshairMode, ISeriesApi, UTCTimestamp, Time } from 'lightweight-charts';

// Initialize the chart
const chart = createChart(document.getElementById('chart') as HTMLElement, {
    width: 1200,
    height: 600,
    layout: {
        background: { color: '#000000' },
        textColor: '#595656',
    },
    grid: {
        vertLines: { color: '#cfcaca', visible: false },
        horzLines: { color: '#bfb7b7', visible: false },
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: false,
    },
    crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
            color: '#afaaaf',
            labelBackgroundColor: '#afaaaf',
        },
        horzLine: {
            color: '#afaaaf',
            labelBackgroundColor: '#afaaaf',
        },
    },
});

// Add a candlestick series
const candleSeries: ISeriesApi<'Candlestick'> = chart.addCandlestickSeries({
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
});

// Tooltip setup
const ohlcTooltip = document.getElementById('ohlcTooltip') as HTMLElement;

import { OhlcData } from 'lightweight-charts';

chart.subscribeCrosshairMove((param) => {
    if (!param || !param.seriesData) {
        ohlcTooltip.style.display = 'none';
        return;
    }

    // Safely cast the series data to OhlcData
    const data = param.seriesData.get(candleSeries) as OhlcData<Time>;

    // Check if data exists and has the required properties
    if (!data) {
        ohlcTooltip.style.display = 'none';
        return;
    }

    // Extract properties
    const { open, high, low, close } = data;
    ohlcTooltip.style.display = 'block';

    // Calculate differences and display values
    const openCloseDiff = close - open;
    const openClosePercent = (openCloseDiff / open) * 100;
    ohlcTooltip.textContent = `O: ${open.toFixed(2)} H: ${high.toFixed(2)} L: ${low.toFixed(2)} C: ${close.toFixed(2)} ${openCloseDiff.toFixed(2)} (${openClosePercent.toFixed(2)}%)`;
});


// WebSocket and API integration
let firstWebSocketTimestamp: number | null = null;

interface Kline {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
}

async function fetchKlineData(endTimestamp: number): Promise<void> {
    const endpoint = `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=1&start=1731232860000&end=${endTimestamp}&limit=100`;

    try {
        const response = await fetch(endpoint);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.retCode === 0 && data.result && data.result.list) {
            const klines = data.result.list
                .map((kline: number[]) => ({
                    time: kline[0] / 1000 as UTCTimestamp,
                    open: kline[1],
                    high: kline[2],
                    low: kline[3],
                    close: kline[4],
                }))
                .filter((kline: Kline) => Object.values(kline).every((value) => !isNaN(value)));


            candleSeries.setData(klines);
        } else {
            throw new Error(`API error: ${data.retMsg}`);
        }
    } catch (error) {
        console.error('Error in fetchKlineData:', error);
    }
}

const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');

ws.onopen = () => {
    console.log('WebSocket connected');
    ws.send(
        JSON.stringify({
            op: 'subscribe',
            args: ['kline.1.BTCUSDT'],
        })
    );
};

ws.onmessage = (event) => {
    console.log('Received WebSocket message:', event.data);
    try {
        const message = JSON.parse(event.data);
        if (message.topic && message.topic.startsWith('kline.')) {
            const klineData = message.data[0];

            if (klineData && !klineData.confirm) {
                if (!firstWebSocketTimestamp) {
                    firstWebSocketTimestamp = klineData.start;
                }

                const updateData = {
                    time: klineData.start / 1000 as UTCTimestamp,
                    open: parseFloat(klineData.open),
                    high: parseFloat(klineData.high),
                    low: parseFloat(klineData.low),
                    close: parseFloat(klineData.close),
                };

                candleSeries.update(updateData);
            }
        }
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
    }
};

ws.onclose = () => console.log('WebSocket connection closed');
ws.onerror = (error) => console.error('WebSocket error:', error);

// Fetch initial data
const currentTimeInMillis = Date.now();
const endTimestamp = firstWebSocketTimestamp || currentTimeInMillis;
fetchKlineData(endTimestamp);
