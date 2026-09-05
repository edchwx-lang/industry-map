const LEGEND_FONT = 'Source Han Serif SC, Noto Serif CJK SC, SimSun, 宋体, serif';

export function formatLegendTitle(metricName, unit) {
  const metric = String(metricName ?? '指标').trim() || '指标';
  const normalizedUnit = String(unit ?? '').trim();
  return normalizedUnit ? `${metric}（${normalizedUnit}）` : metric;
}

export function formatClassIntervals(classification, values = []) {
  if (classification?.method === 'custom') {
    const thresholds = classification.thresholds ?? [];
    return thresholds.map((minimum, index) => index === thresholds.length - 1
      ? `${formatNumber(minimum)}及以上`
      : `${formatNumber(minimum)}–<${formatNumber(thresholds[index + 1])}`);
  }
  const breaks = classification?.breaks ?? [];
  if (breaks.length < 2) return [];
  if (classification?.method === 'diverging-equal' && breaks.length === 6) {
    const [minimum, negativeHalf, , , positiveHalf, maximum] = breaks;
    const integers = [minimum, negativeHalf, positiveHalf, maximum].every(Number.isInteger)
      && values.every(value => !Number.isFinite(value) || Number.isInteger(value));
    if (integers) return [
      `${minimum}–${negativeHalf - 1}`,
      `${negativeHalf}–-1`,
      '0',
      `1–${positiveHalf}`,
      `${positiveHalf + 1}–${maximum}`,
    ];
    return [`${minimum}–<${negativeHalf}`, `${negativeHalf}–<0`, '0', `0–${positiveHalf}`, `${positiveHalf}–${maximum}`];
  }
  const integerScale = breaks.every(Number.isInteger) && values.every(value => !Number.isFinite(value) || Number.isInteger(value));
  return breaks.slice(0, -1).map((minimum, index) => {
    const maximum = breaks[index + 1];
    const last = index === breaks.length - 2;
    const displayedMinimum = index === 0 && minimum >= 0 ? 0 : minimum;
    if (last) return `${formatNumber(displayedMinimum)}及以上`;
    if (integerScale) return `${formatNumber(displayedMinimum)}–${formatNumber(maximum - 1)}`;
    return `${formatNumber(displayedMinimum)}–<${formatNumber(maximum)}`;
  });
}

export function buildLegendGraphics({ mode, classification, colors, diameters = [], metricName, metricNameEnglish, unit, frame, values = [], hideLowestClass = false }) {
  if (!['choropleth', 'bubble'].includes(mode)) throw new Error('legend mode must be choropleth or bubble');
  const intervals = formatClassIntervals(classification, values);
  const title = formatLegendTitle(metricName, unit);
  const scale = frame.rowHeight / 108;
  const titleFontSize = Math.max(8, Math.round(32 * scale));
  const rowFontSize = Math.max(6, Math.round(28 * scale));
  const rectangleWidth = Math.round(72 * scale);
  const rectangleHeight = Math.round(42 * scale);
  const textX = Math.round(105 * scale);
  const strokeWidth = Math.max(1, Math.round(2 * scale));
  const children = [{
    type: 'text', x: 0, y: 0,
    style: { text: title, fill: '#283746', fontSize: titleFontSize, fontFamily: LEGEND_FONT, fontWeight: 'normal' },
  }];
  if (metricNameEnglish) children.push({type:'text',x:0,y:Math.round(43*scale),style:{text:metricNameEnglish,fill:'#5F6B7A',fontSize:Math.round(24*scale),fontFamily:'Arial',fontWeight:'normal'}});
  const maximumMapDiameter = Math.max(...diameters, 1);
  const maximumLegendDiameter = frame.rowHeight * 0.72;
  intervals.forEach((interval, index) => {
    const rowTop = frame.titleGap + (metricNameEnglish ? 24*scale : 0) + index * frame.rowHeight;
    const fill = colors[index] ?? colors.at(-1);
    if (mode === 'choropleth' || (hideLowestClass && index === 0)) {
      children.push({
        type: 'rect',
        shape: { x: 0, y: rowTop + (frame.rowHeight - rectangleHeight) / 2, width: rectangleWidth, height: rectangleHeight },
        style: { fill: hideLowestClass && index === 0 ? '#e6e6e6' : fill, stroke: '#344454', lineWidth: strokeWidth },
      });
    } else {
      const diameter = (diameters[index] ?? maximumMapDiameter) / maximumMapDiameter * maximumLegendDiameter;
      children.push({
        type: 'circle',
        shape: { cx: maximumLegendDiameter / 2, cy: rowTop + frame.rowHeight / 2, r: diameter / 2 },
        style: { fill, stroke: colors.includes('#F7F7F7') ? '#75808E' : '#FFFFFF', lineWidth: strokeWidth, opacity: 0.9 },
      });
    }
    children.push({
      type: 'text', x: textX, y: rowTop + frame.rowHeight / 2,
      style: { text: interval, fill: '#344454', fontSize: rowFontSize, fontFamily: LEGEND_FONT, verticalAlign: 'middle' },
    });
  });
  return {
    graphics: { type: 'group', x: frame.x, y: frame.y, silent: true, children },
    metadata: {
      type: mode === 'bubble' ? 'graduated-circles' : 'rectangles',
      title,
      intervals,
      colors: [...colors],
      order: 'low-to-high',
      lowestClassSymbol: hideLowestClass ? 'base-map-only' : 'normal',
    },
  };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(Number(value).toFixed(6)));
}
