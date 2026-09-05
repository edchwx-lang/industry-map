const TITLE_FONT = 'Source Han Serif SC, Noto Serif CJK SC, SimSun, 宋体, serif';

export function buildPublicationLayout({ width = 3840, height = 2160, title, subtitle, source, note }) {
  const scale = Math.min(width / 3840, height / 2160);
  const mapFrame = {
    left: Math.round(width * 0.05),
    right: Math.round(width * 0.84),
    top: Math.round(250 * scale),
    bottom: Math.round(90 * scale),
  };
  mapFrame.centerX = Math.round((mapFrame.left + mapFrame.right) / 2);
  const legendFrame = {
    align: 'lower-right',
    x: Math.round(width * 0.87),
    y: Math.round(1380 * scale),
    width: Math.round(430 * scale),
    rowHeight: Math.round(108 * scale),
    titleGap: Math.round(76 * scale),
    bottom: Math.round(120 * scale),
  };
  const graphics = [];
  if (source) graphics.push(textGraphic(source, 'right', Math.round(50 * scale)));
  if (note) graphics.push(textGraphic(note, 'left', Math.round(50 * scale)));
  return {
    title: {
      text: title ?? '',
      ...(subtitle ? { subtext: subtitle } : {}),
      left: Math.round(width / 2), top: Math.round(80 * scale), textAlign: 'center', padding: 0,
      textStyle: { fontFamily: TITLE_FONT, fontSize: Math.round(64 * scale), fontWeight: 400, color: '#172033' },
      ...(subtitle ? { subtextStyle: { fontFamily: 'Arial', fontSize: Math.round(32 * scale), color: '#5F6B7A' } } : {}),
    },
    legend: { orient: 'vertical', right: '3%', top: 'middle' },
    mapFrame,
    legendFrame,
    geo: { left: mapFrame.left, right: width - mapFrame.right, top: mapFrame.top, bottom: mapFrame.bottom },
    graphics,
  };
}

export function bubbleDiameters(classes, minimum = 32, maximum = 144) {
  if (![3, 4, 5, 6, 7].includes(classes)) throw new Error('bubble classes must be from 3 through 7');
  const minArea = minimum ** 2;
  const areaStep = (maximum ** 2 - minArea) / (classes - 1);
  return Array.from({ length: classes }, (_, index) => Math.sqrt(minArea + areaStep * index));
}

function textGraphic(text, side, bottom) {
  return { type: 'text', z:100, [side]: '3%', bottom, style: { text, fontSize:24, fontFamily:'Arial', fill: '#5F6B7A' } };
}
