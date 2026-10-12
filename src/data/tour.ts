import type { CameraPose, TourStep } from '../types'

export const ISO_POSE: CameraPose = { position: [130, 95, 120], target: [5, 4, 0] }
export const DEFAULT_TIME = 11 * 60 + 30

export const TOUR: TourStep[] = [
  {
    title: 'Centre for Advanced Studies',
    narration: 'Welcome to the BB Digital Twin of the SCAS block at Sathyabama Institute of Science and Technology, Chennai. Every surface you see is procedurally generated in WebGL.',
    pose: { position: [130, 90, 125], target: [5, 4, 0] },
    floor: 'ALL', explode: 0, time: DEFAULT_TIME, weather: 'clear', heatmap: 'off', select: null,
  },
  {
    title: 'Site & Orientation',
    narration: 'The block sits at 12.87° N, 80.23° E. The long north bar runs west, the entrance wing faces the approach road to the east, and two open-air wells cut through the plan: an elongated light-well and the square central courtyard.',
    pose: { position: [10, 200, 70], target: [5, 0, 0] },
  },
  {
    title: 'Grand Entrance Portico',
    narration: 'Three striped pillars carry the layered canopy over a raised flight of steps and a railed access ramp, framed by the timber-clad east facade.',
    pose: { position: [100, 8, -12], target: [64, 4, -18] },
  },
  {
    title: 'Illuminated Signage',
    narration: '“SATHYABAMA CENTRE FOR ADVANCED STUDIES” is rendered as extruded emissive voxel lettering along the top of the canopy, picked up by the bloom pass.',
    pose: { position: [86, 9, -18], target: [70, 7, -18] },
  },
  {
    title: 'Central Courtyard',
    narration: 'The square courtyard, with its checkerboard paving, shrine and blue columns, and the elongated north light-well bring daylight and cross-ventilation into the corridors. The sun you see is computed from the real solar ephemeris.',
    pose: { position: [45, 55, 60], target: [29, 0, 22] },
  },
  {
    title: 'Floor Explosion',
    narration: 'Exploding the stack separates Floor 1, Floor 2 and Floor 3 along the vertical axis so every teaching space is visible at once.',
    pose: { position: [140, 90, 130], target: [5, 12, 0] },
    explode: 1,
  },
  {
    title: 'Floor 1 Isolation',
    narration: 'Isolating Floor 1 ghosts the upper levels to wireframe. Rooms 303–318 host the ICT, computing and embedded systems labs.',
    pose: { position: [90, 60, 95], target: [0, 2, 0] },
    floor: 'F1', explode: 0.4,
  },
  {
    title: 'Room 303 · ICT Computer Lab',
    narration: 'Room 303 is the verified ICT Computer Lab & ABHS, backed by IQAC photographic evidence and monitored by CAM-07.',
    pose: { position: [62, 28, 86], target: [40, 0, 41] },
    select: { kind: 'room', id: 'R303' },
  },
  {
    title: 'Floor 2 Research Labs',
    narration: 'Floor 2 carries AI/ML, Data Science, Cloud and the Cyber Security Lab in Room 345, the origin point of our fire-drill scenario.',
    pose: { position: [40, 32, -32], target: [16, 5, -2] },
    floor: 'F2', select: { kind: 'room', id: 'R345' },
  },
  {
    title: 'CCTV Coverage',
    narration: 'Seven 4K camera nodes, CAM-01 to CAM-07, project their viewing frustums into 3D space so blind spots are obvious at a glance.',
    pose: { position: [100, 45, -70], target: [60, 2, -18] },
    floor: 'ALL', explode: 0, select: { kind: 'camera', id: 'CAM-01' },
  },
  {
    title: 'Rooftop Solar Farm',
    narration: 'A 180 kW array of 400 modules in four strings. String D is flagged for soiling: its output trails the others by about 14 percent.',
    pose: { position: [25, 45, 80], target: [25, 12, 40] },
    select: { kind: 'solar', id: 'D' },
  },
  {
    title: 'Volumetric CO₂ Heatmap',
    narration: 'The CO₂ heatmap rises as a volumetric glow inside each room. Room 482 on Floor 3 stands out above 1,000 ppm.',
    pose: { position: [130, 95, 110], target: [0, 10, 0] },
    explode: 0.7, heatmap: 'co2', select: { kind: 'room', id: 'R482' },
  },
  {
    title: 'Golden Hour',
    narration: 'Dragging time toward sunset swings the directional sun west and warms the light, while solar output tapers in step.',
    pose: { position: [-110, 40, 100], target: [0, 6, 0] },
    explode: 0, heatmap: 'off', time: 17 * 60 + 55, select: null,
  },
  {
    title: 'Night Operations',
    narration: 'After dusk the interiors glow and the eight LoRa mesh streetlights switch on, pooling light along the approach road.',
    pose: { position: [120, 40, 70], target: [50, 0, -10] },
    time: 21 * 60 + 30,
  },
  {
    title: 'Command Center Ready',
    narration: 'That concludes the tour. Explore freely, run the fire drill, or open the CCTV feeds. Built by Bharath Kumar.',
    pose: ISO_POSE,
    floor: 'ALL', explode: 0, time: DEFAULT_TIME, weather: 'clear', heatmap: 'off',
  },
]
