// Generates test data: a LiDAR point cloud and GIS layers (GeoJSON) for one power line.
// Run: node scripts/generate-data.ts
// GIS pole positions are a bit off from the "real" ones in the scan, like in real life.

import { writeFileSync } from 'node:fs'

// map origin (somewhere near Lviv)
const LON0 = 24.03
const LAT0 = 49.84
const M_PER_DEG_LAT = 111320
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180)

// simple random with seed, so the data is the same every time
let seed = 42
function random() {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
function between(min: number, max: number) {
  return min + random() * (max - min)
}

function groundZ(x: number, y: number) {
  return 0.02 * x + 1.5 * Math.sin(y / 25) + 0.8 * Math.sin(x / 40)
}

function lineY(x: number) {
  return 6 * Math.sin(x / 80)
}

const lines: string[] = []
function addPoint(x: number, y: number, z: number, cls: number) {
  lines.push(`${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)} ${cls}`)
}

// ASPRS classes: 2 ground, 5 high vegetation, 14 wire, 15 tower/pole
// ground
for (let i = 0; i < 35000; i++) {
  const x = between(-200, 200)
  const y = between(-40, 40)
  addPoint(x, y, groundZ(x, y) + between(-0.05, 0.05), 2)
}

// trees (not too close to the line)
for (let t = 0; t < 30; t++) {
  const x = between(-195, 195)
  let y = between(-38, 38)
  if (Math.abs(y - lineY(x)) < 8) y += y > lineY(x) ? 8 : -8

  const base = groundZ(x, y)
  const height = between(6, 11)
  const radius = between(1.5, 3)

  for (let i = 0; i < 40; i++) addPoint(x + between(-0.2, 0.2), y + between(-0.2, 0.2), base + between(0, height * 0.5), 5)
  for (let i = 0; i < 350; i++) {
    const angle = between(0, Math.PI * 2)
    const r = radius * Math.sqrt(random())
    addPoint(x + Math.cos(angle) * r, y + Math.sin(angle) * r, base + height * 0.5 + between(0, height * 0.5), 5)
  }
}

// poles
const poles: { id: string; x: number; y: number; height: number; material: string }[] = []
for (let i = 0; i < 8; i++) {
  const x = -175 + i * 50
  poles.push({
    id: `P-${String(i + 1).padStart(2, '0')}`,
    x,
    y: lineY(x),
    height: between(9, 10.5),
    material: i % 3 === 0 ? 'concrete' : 'wood',
  })
}

for (const pole of poles) {
  const base = groundZ(pole.x, pole.y)
  for (let i = 0; i < 160; i++) {
    const angle = between(0, Math.PI * 2)
    addPoint(pole.x + Math.cos(angle) * 0.14, pole.y + Math.sin(angle) * 0.14, base + between(0, pole.height), 15)
  }
}

// wires between pole tops, 2 wires, with sag
for (let i = 0; i < poles.length - 1; i++) {
  const a = poles[i]
  const b = poles[i + 1]
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  // perpendicular direction for wire offset
  const px = -(b.y - a.y) / length
  const py = (b.x - a.x) / length

  for (const offset of [-0.6, 0.6]) {
    for (let d = 0; d <= length; d += 0.3) {
      const t = d / length
      const x = a.x + (b.x - a.x) * t + px * offset
      const y = a.y + (b.y - a.y) * t + py * offset
      const topA = groundZ(a.x, a.y) + a.height - 0.3
      const topB = groundZ(b.x, b.y) + b.height - 0.3
      const sag = 0.9 * 4 * t * (1 - t)
      addPoint(x, y, topA + (topB - topA) * t - sag + between(-0.03, 0.03), 14)
    }
  }
}

writeFileSync('public/data/scan.xyz', lines.join('\n'))
console.log(`scan.xyz: ${lines.length} points`)

// GIS layer: positions with 0.5 - 2.5 m error
function toLonLat(x: number, y: number) {
  return [+(LON0 + x / M_PER_DEG_LON).toFixed(7), +(LAT0 + y / M_PER_DEG_LAT).toFixed(7)]
}

const gisCoords = poles.map((pole) => {
  const angle = between(0, Math.PI * 2)
  const error = between(0.5, 2.5)
  return toLonLat(pole.x + Math.cos(angle) * error, pole.y + Math.sin(angle) * error)
})

const features: object[] = poles.map((pole, i) => {
  return {
    type: 'Feature',
    properties: {
      id: pole.id,
      material: pole.material,
      height: pole.material === 'concrete' ? 10 : 9.5, // height from the passport, not measured
    },
    geometry: {
      type: 'Point',
      coordinates: gisCoords[i],
    },
  }
})

for (let i = 0; i < poles.length - 1; i++) {
  features.push({
    type: 'Feature',
    properties: { id: `L-${i + 1}`, from: poles[i].id, to: poles[i + 1].id, voltage: '10 kV' },
    geometry: { type: 'LineString', coordinates: [gisCoords[i], gisCoords[i + 1]] },
  })
}

const geojson = {
  type: 'FeatureCollection',
  properties: { origin: [LON0, LAT0] },
  features,
}
writeFileSync('public/data/network.geojson', JSON.stringify(geojson, null, 2))
console.log(`network.geojson: ${poles.length} poles, ${poles.length - 1} spans`)
