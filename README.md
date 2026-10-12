# SCAS Smart Building Digital Twin

A browser-based 3D digital twin of the **Centre for Advanced Studies (SCAS)** block at Sathyabama Institute of Science and Technology, Chennai. It renders the building procedurally with Three.js and adds a command-centre dashboard for occupancy, air quality, energy, CCTV, weather and emergency simulation.

![Overview of the SCAS digital twin](screenshots/real-overview.png)

## Features

- **Procedural building model**: three floors, two light-well courtyards, bronze glazing, piers, glass partitions, desks and roof parapets, all generated in code with no imported 3D models.
- **East portico**: four terracotta double-height pillars, a cantilevered canopy, stairs, ramps and extruded signage.
- **Real sun position**: a solar ephemeris for the site's coordinates (12.8718° N, 80.2253° E) drives daylight, golden hour and night lighting.
- **Weather**: clear, overcast, rain with ground ripples, and storms with lightning.
- **Volumetric heatmaps** for temperature, CO₂ and energy density.
- **Fire drill simulation**: smoke in Room 345, an egress path to the eastern assembly point, and animated evacuee flow.
- **Live-style telemetry**: 48 room badges, 7 CCTV cameras, 4 × 45 kW solar strings and 8 LoRa streetlights.
- **15-step cinematic tour** of the building.
- **Command-centre UI** with a top bar, HUD, analytics rails, room inspector, dock and modals.

## Screenshots

| | |
| --- | --- |
| ![Courtyard](screenshots/real-courtyard.png) | ![Night view](screenshots/real-night.png) |
| Courtyard | Night lighting |
| ![Portico](screenshots/real-portico.png) | ![Room 303](screenshots/real-floor1-room303.png) |
| East portico | Floor 1, Room 303 |

## Tech stack

React 19 · TypeScript (strict) · Vite 7 · Three.js r186 · Tailwind CSS v4 · Lucide React

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

The project includes a `vercel.json`, so it deploys to Vercel as-is.

## Project structure

| Area | Location |
| --- | --- |
| Building geometry, portico, heatmaps | `src/three/building.ts` |
| Render loop, lighting, sensors and cameras | `src/three/Engine.ts` |
| Weather effects | `src/three/weather.ts` |
| Fire drill and evacuation | `src/three/fire.ts`, `src/lib/controllers.ts` |
| Sun position | `src/lib/sun.ts` |
| Guided tour | `src/data/tour.ts` |
| Campus data (rooms, cameras, solar, alerts) | `src/data/campus.ts` |
| Dashboard UI | `src/components/` |

## Data honesty

No real building management system is connected. Every card in the UI is tagged so viewers know what they're looking at:

- `[SOURCE-DERIVED]`: building proportions, room numbers (303–490) and room identities.
- `[SIMULATED]`: air quality, solar output, streetlights, CCTV streams and alerts, all generated in the browser.
- `[REAL]`: frame rate, local clock and sun position.
- `[DERIVED]`: aggregates such as occupancy and energy savings.

Room photos go in `public/evidence/room-<number>.jpg`. Until one exists, the inspector shows an illustrative render tagged `[ILLUSTRATIVE]` rather than a fake photo.

## Controls

- `/` search
- `Esc` close a modal or clear the selection
- During the tour: `←` `→` to step, `Space` to pause

From the browser console: `bbTwin.startTour()`, `bbTwin.startFireDrill()`, or `bbTwin.store.set({ time: 1290, weather: 'storm' })`.

## Author

**Bharath Kumar** · [@bharathkumar-496](https://github.com/bharathkumar-496)

Built as a college project at Sathyabama Institute of Science and Technology.
