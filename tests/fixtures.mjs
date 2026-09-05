export const featureCollection = {
  type: 'FeatureCollection',
  features: [
    feature('441900001', '莞城街道', 0),
    feature('441900002', '南城街道', 1),
    feature('441900003', '东城街道', 2),
    feature('441900004', '万江街道', 3),
  ],
};

function feature(code, name, offset) {
  return {
    type: 'Feature',
    properties: { adcode: code, name },
    geometry: {
      type: 'Polygon',
      coordinates: [[[offset, 0], [offset + 0.8, 0], [offset + 0.8, 0.8], [offset, 0.8], [offset, 0]]],
    },
  };
}

export const messyRows = [
  ['东莞市街道产业指标（单位：家）'],
  ['行政区划代码', '街道名称', '企业数'],
  ['441900001', '松山湖', 0],
  ['441900002', '南城街道', 12],
  ['441900003', '东城街道', 30],
  ['441900004', '万江街道', 5],
  ['合计', '', 47],
  [],
];
