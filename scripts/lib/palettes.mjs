const PALETTES = Object.freeze({
  'blue-a': ['#EFF4FC', '#D9E5F7', '#B5CCED', '#88ACE0', '#5685C5'],
  'orange-a': ['#FFF3E6', '#FFD8AE', '#F6B66C', '#E68532', '#B94B1C'],
  // 红蓝白：ColorBrewer RdBu B版重新排序；保留 mixed-c 配置编号。
  'mixed-c': ['#F7F7F7', '#92C5DE', '#0571B0', '#F4A582', '#CA0020'],
});

export function resolvePalette({ paletteId, classes }) {
  const anchors = PALETTES[paletteId];
  if (!anchors) throw new Error('paletteId must be one of blue-a, orange-a, or mixed-c');
  if (![3, 4, 5, 6, 7].includes(classes)) throw new Error('palette classes must be from 3 through 7');
  if (classes === anchors.length) return [...anchors];
  return Array.from({ length: classes }, (_, index) => interpolateAnchors(anchors, index / (classes - 1)));
}

function interpolateAnchors(anchors, position) {
  const scaled = position * (anchors.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(anchors.length - 1, Math.ceil(scaled));
  const fraction = scaled - left;
  const a = hexToRgb(anchors[left]);
  const b = hexToRgb(anchors[right]);
  return rgbToHex(a.map((channel, index) => Math.round(channel + (b[index] - channel) * fraction)));
}

function hexToRgb(hex) { return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16)); }
function rgbToHex(rgb) { return `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase(); }

export const paletteAnchors = PALETTES;
