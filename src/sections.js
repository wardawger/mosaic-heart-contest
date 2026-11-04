// The 17 donation sections. Their shapes come from src/heart-paths.json, traced
// from design/heart-reference.png by scripts/trace_heart.py; the colors here
// are the stroke colors in that picture (keep them in step with the script).
export const SECTIONS = [
  { id: 'brachiocephalic-artery', name: 'Brachiocephalic artery', price: 5, color: '#FEBB58' },
  { id: 'left-common-carotid-artery', name: 'Left common carotid artery', price: 5, color: '#FD904C' },
  { id: 'left-subclavian-artery', name: 'Left subclavian artery', price: 5, color: '#FDDC5A' },
  { id: 'right-pulmonary-vein', name: 'Right pulmonary vein', price: 10, color: '#577BEA' },
  { id: 'left-pulmonary-vein', name: 'Left pulmonary vein', price: 10, color: '#FE1202' },
  { id: 'pulmonary-valve', name: 'Pulmonary valve', price: 25, color: '#5C3DF6' },
  { id: 'tricuspid-valve', name: 'Tricuspid valve', price: 25, color: '#7BDCDB' },
  { id: 'aortic-valve', name: 'Aortic valve', price: 25, color: '#FEC6BC' },
  { id: 'mitral-valve', name: 'Mitral valve', price: 25, color: '#EC9EBD' },
  { id: 'inferior-vena-cava', name: 'Inferior vena cava', price: 30, color: '#34B5C4' },
  { id: 'superior-vena-cava', name: 'Superior vena cava', price: 30, color: '#1D94F8' },
  { id: 'pulmonary-artery', name: 'Pulmonary artery', price: 40, color: '#7536EC' },
  { id: 'right-ventricle', name: 'Right ventricle', price: 50, color: '#0149AB' },
  { id: 'right-atrium', name: 'Right atrium', price: 50, color: '#1C70AB' },
  { id: 'left-atrium', name: 'Left atrium', price: 50, color: '#EC5B8A' },
  { id: 'left-ventricle', name: 'Left ventricle', price: 50, color: '#F01579' },
  { id: 'aorta', name: 'Aorta', price: 65, color: '#FD6E63' },
];

export const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
