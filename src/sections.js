// The 17 donation sections and their 3D shapes.
// World units: +Y up, +X = viewer's right (the patient's left), +Z toward the viewer.
//
// Shape kinds:
//   chamber: an egg-shaped volume. c = center, r = radii, rot = [x,y,z] radians,
//            taper narrows the lower half (0 = ellipsoid), axis = peel direction [from, to].
//   vessel:  tubes along point paths, radius r (or radii[i] per path). The black outline peels along each path.
//   valve:   a ring of radius R at c, facing along n.
export const SECTIONS = [
  {
    id: 'brachiocephalic-artery', name: 'Brachiocephalic artery', price: 5, color: '#F2B85C',
    shape: { kind: 'vessel', r: 0.2, paths: [[[-0.2, 2.9, 0.05], [-0.35, 3.6, 0.1], [-0.55, 4.25, 0.1]]] },
  },
  {
    id: 'left-common-carotid-artery', name: 'Left common carotid artery', price: 5, color: '#EE9A5A',
    shape: { kind: 'vessel', r: 0.18, paths: [[[0.3, 3.2, -0.3], [0.32, 3.9, -0.3], [0.35, 4.45, -0.3]]] },
  },
  {
    id: 'left-subclavian-artery', name: 'Left subclavian artery', price: 5, color: '#F9DC6B',
    shape: { kind: 'vessel', r: 0.19, paths: [[[0.75, 3.0, -0.7], [0.95, 3.7, -0.8], [1.2, 4.2, -0.8]]] },
  },
  {
    id: 'right-pulmonary-vein', name: 'Right pulmonary vein', price: 10, color: '#6B7EEA',
    shape: {
      kind: 'vessel', r: 0.2,
      paths: [
        [[-0.1, 1.0, -1.25], [-0.9, 1.15, -1.5], [-1.5, 1.3, -1.6]],
        [[-0.1, 0.55, -1.3], [-0.9, 0.5, -1.55], [-1.5, 0.45, -1.7]],
      ],
    },
  },
  {
    id: 'left-pulmonary-vein', name: 'Left pulmonary vein', price: 10, color: '#E8301E',
    shape: {
      kind: 'vessel', r: 0.2,
      paths: [
        [[1.2, 1.0, -1.2], [2.0, 1.15, -1.3], [2.55, 1.3, -1.3]],
        [[1.2, 0.55, -1.3], [2.0, 0.5, -1.4], [2.55, 0.42, -1.45]],
      ],
    },
  },
  {
    id: 'pulmonary-valve', name: 'Pulmonary valve', price: 25, color: '#5B3DF5',
    shape: { kind: 'valve', c: [0.1, 0.62, 0.86], n: [0.25, 1, -0.05], R: 0.5 },
  },
  {
    id: 'tricuspid-valve', name: 'Tricuspid valve', price: 25, color: '#8AD8D8',
    shape: { kind: 'valve', c: [-1.0, -0.15, 0.55], n: [1, -0.7, 0.35], R: 0.62 },
  },
  {
    id: 'aortic-valve', name: 'Aortic valve', price: 25, color: '#F5C4B8',
    shape: { kind: 'valve', c: [-0.22, 0.95, 0.3], n: [-0.25, 1, 0.2], R: 0.5 },
  },
  {
    id: 'mitral-valve', name: 'Mitral valve', price: 25, color: '#E8A0BE',
    shape: { kind: 'valve', c: [0.85, 0.15, -0.85], n: [0.2, -1, 0.45], R: 0.62 },
  },
  {
    id: 'inferior-vena-cava', name: 'Inferior vena cava', price: 30, color: '#5BB4C4',
    shape: { kind: 'vessel', r: 0.4, paths: [[[-1.45, -0.2, -0.25], [-1.4, -1.2, -0.4], [-1.35, -2.1, -0.5]]] },
  },
  {
    id: 'superior-vena-cava', name: 'Superior vena cava', price: 30, color: '#4A90F5',
    shape: { kind: 'vessel', r: 0.38, paths: [[[-1.55, 1.0, 0.0], [-1.6, 2.1, -0.05], [-1.62, 3.15, -0.05]]] },
  },
  {
    id: 'pulmonary-artery', name: 'Pulmonary artery', price: 40, color: '#7B3FE4',
    shape: {
      kind: 'vessel', r: 0.42, radii: [0.42, 0.28, 0.28],
      paths: [
        [[0.0, 0.2, 0.85], [0.25, 1.3, 0.85], [0.65, 2.0, 0.3]],
        [[0.65, 2.0, 0.3], [1.5, 2.05, -0.15], [2.3, 1.9, -0.45]],
        [[0.65, 2.0, 0.3], [-0.2, 2.05, -0.65], [-1.05, 1.95, -0.8]],
      ],
    },
  },
  {
    id: 'right-ventricle', name: 'Right ventricle', price: 50, color: '#1E4AA8',
    shape: { kind: 'chamber', c: [-0.2, -0.65, 0.7], r: [1.35, 1.45, 0.8], rot: [0, 0, 0.35], taper: 0.25, axis: [[-0.5, 0.7, 0.7], [0.3, -2.0, 0.7]] },
  },
  {
    id: 'right-atrium', name: 'Right atrium', price: 50, color: '#3772A8',
    shape: { kind: 'chamber', c: [-1.55, 0.45, 0.1], r: [0.95, 1.05, 0.95], rot: [0, 0, -0.15], taper: 0, axis: [[-1.55, 1.5, 0.1], [-1.55, -0.6, 0.1]] },
  },
  {
    id: 'left-atrium', name: 'Left atrium', price: 50, color: '#E06C90',
    shape: { kind: 'chamber', c: [0.55, 0.75, -1.0], r: [1.15, 0.72, 0.85], rot: [0, 0, 0.05], taper: 0, axis: [[-0.6, 0.75, -1.0], [1.7, 0.75, -1.0]] },
  },
  {
    id: 'left-ventricle', name: 'Left ventricle', price: 50, color: '#E0377A',
    shape: { kind: 'chamber', c: [0.75, -0.95, -0.15], r: [1.25, 1.9, 1.2], rot: [0.15, 0, 0.45], taper: 0.45, axis: [[0.0, 0.7, -0.4], [1.6, -2.7, 0.1]] },
  },
  {
    id: 'aorta', name: 'Aorta', price: 65, color: '#EE7A66',
    shape: {
      kind: 'vessel', r: 0.42,
      paths: [[[0.0, 0.1, 0.0], [-0.35, 1.4, 0.3], [-0.3, 2.6, 0.15], [0.3, 3.2, -0.3], [0.95, 2.85, -0.95], [1.05, 1.8, -1.5], [1.0, 0.2, -1.8], [0.95, -1.2, -1.9]]],
    },
  },
];

export const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
