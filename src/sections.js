// The 16 donation sections. Coordinates are hand-traced from the Canva heart
// (493 x 680 px, y down). Each section has one or more centerline paths that
// become 3D tubes. Tweak points here to refine the shape.
export const SECTIONS = [
  {
    id: 'brachiocephalic-artery', name: 'Brachiocephalic artery', price: 5, color: '#F2B85C',
    paths: [[[192, 92], [178, 62], [183, 32], [205, 20], [222, 40], [236, 78]]],
  },
  {
    id: 'left-common-carotid-artery', name: 'Left common carotid artery', price: 5, color: '#EE9A5A',
    paths: [[[236, 78], [245, 42], [255, 14], [275, 10], [285, 40], [286, 76]]],
  },
  {
    id: 'left-subclavian-artery', name: 'Left subclavian artery', price: 5, color: '#F9DC6B',
    paths: [[[286, 76], [298, 42], [318, 26], [340, 44], [348, 84]]],
  },
  {
    id: 'right-pulmonary-vein', name: 'Right pulmonary vein', price: 10, color: '#6B7EEA',
    paths: [[[72, 148], [40, 140], [17, 160], [24, 188], [72, 186]]],
  },
  {
    id: 'left-pulmonary-vein', name: 'Left pulmonary vein', price: 10, color: '#E8301E',
    paths: [
      [[385, 236], [440, 225], [456, 250], [432, 268]],
      [[430, 276], [465, 280], [470, 310], [433, 322]],
    ],
  },
  {
    id: 'pulmonary-valve', name: 'Pulmonary valve', price: 25, color: '#5B3DF5',
    paths: [[[184, 340], [206, 330], [232, 350], [256, 364]]],
  },
  {
    id: 'tricuspid-valve', name: 'Tricuspid valve', price: 25, color: '#8AD8D8',
    paths: [
      [[195, 296], [168, 340], [150, 384], [156, 410]],
      [[150, 410], [108, 408], [74, 436], [54, 468]],
    ],
  },
  {
    id: 'aortic-valve', name: 'Aortic valve', price: 25, color: '#F5C4B8',
    paths: [[[268, 372], [294, 352], [326, 342]]],
  },
  {
    id: 'mitral-valve', name: 'Mitral valve', price: 25, color: '#E8A0BE',
    paths: [
      [[336, 340], [352, 352], [354, 376], [340, 386]],
      [[374, 382], [384, 356], [406, 346], [410, 362], [396, 384]],
    ],
  },
  {
    id: 'inferior-vena-cava', name: 'Inferior vena cava', price: 30, color: '#5BB4C4',
    paths: [[[68, 505], [70, 570], [80, 614], [115, 626], [146, 608], [150, 576]]],
  },
  {
    id: 'superior-vena-cava', name: 'Superior vena cava', price: 30, color: '#4A90F5',
    paths: [[[58, 268], [68, 200], [72, 104], [95, 88], [130, 90], [150, 106], [155, 180], [165, 250]]],
  },
  {
    id: 'pulmonary-artery', name: 'Pulmonary artery', price: 40, color: '#7B3FE4',
    paths: [
      [[225, 232], [208, 262], [190, 286], [184, 338]],
      [[298, 166], [340, 150], [398, 138], [424, 142], [432, 160], [420, 172], [380, 200], [330, 216], [292, 256], [266, 300], [258, 354]],
    ],
  },
  {
    id: 'right-ventricle', name: 'Right ventricle', price: 50, color: '#1E4AA8',
    paths: [
      [[255, 360], [258, 420], [275, 496], [320, 528], [334, 568], [304, 596], [240, 572], [180, 546], [132, 502], [100, 456], [88, 430]],
      [[60, 470], [100, 544], [180, 600], [280, 640], [360, 657]],
    ],
  },
  {
    id: 'right-atrium', name: 'Right atrium', price: 50, color: '#3772A8',
    paths: [[[58, 268], [110, 248], [165, 255], [195, 292]], [[58, 268], [32, 322], [36, 392], [60, 440], [54, 468]]],
  },
  {
    id: 'left-atrium', name: 'Left atrium', price: 50, color: '#E06C90',
    paths: [
      [[336, 222], [385, 238], [414, 262], [425, 300], [432, 332]],
      [[290, 276], [298, 306], [328, 334], [346, 344]],
    ],
  },
  {
    id: 'left-ventricle', name: 'Left ventricle', price: 50, color: '#E0377A',
    paths: [
      [[432, 332], [470, 384], [480, 480], [466, 580], [420, 640], [360, 657]],
      [[262, 362], [282, 408], [322, 474], [362, 540], [402, 570], [430, 548], [440, 490], [426, 440], [410, 392]],
    ],
  },
  {
    id: 'aorta', name: 'Aorta', price: 65, color: '#EE7A66',
    paths: [
      [[192, 92], [168, 124], [154, 168]],
      [[348, 84], [352, 108], [366, 132]],
      [[225, 232], [222, 184], [238, 156], [268, 148], [298, 166]],
    ],
  },
];

export const TOTAL_PRICE = SECTIONS.reduce((s, x) => s + x.price, 0);
export const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
