import type { PointCloud, Pole } from './types'

const GROUND = 2
const POLE = 15

// average height of ground points around (x, y)
export function getGroundZ(cloud: PointCloud, x: number, y: number, radius = 2): number {
  let sum = 0
  let count = 0

  for (let i = 0; i < cloud.count; i++) {
    if (cloud.classes[i] !== GROUND) continue

    const dx = cloud.positions[i * 3] - x
    const dy = cloud.positions[i * 3 + 1] - y
    if (dx * dx + dy * dy < radius * radius) {
      sum += cloud.positions[i * 3 + 2]
      count++
    }
  }

  return count > 0 ? sum / count : 0
}

// looks for pole points near the GIS position and moves the pole to their center
export function snapPoleToScan(cloud: PointCloud, pole: Pole, searchRadius = 4) {
  let sumX = 0
  let sumY = 0
  let maxZ = -Infinity
  let count = 0

  for (let i = 0; i < cloud.count; i++) {
    if (cloud.classes[i] !== POLE) continue

    const x = cloud.positions[i * 3]
    const y = cloud.positions[i * 3 + 1]
    const dx = x - pole.gisX
    const dy = y - pole.gisY

    if (dx * dx + dy * dy < searchRadius * searchRadius) {
      sumX += x
      sumY += y
      maxZ = Math.max(maxZ, cloud.positions[i * 3 + 2])
      count++
    }
  }

  // too few points, probably not a pole
  if (count < 20) {
    pole.shift = null
    return
  }

  pole.x = sumX / count
  pole.y = sumY / count
  pole.baseZ = getGroundZ(cloud, pole.x, pole.y)
  pole.height = maxZ - pole.baseZ
  pole.shift = Math.hypot(pole.x - pole.gisX, pole.y - pole.gisY)
  pole.snapped = true
}

export function resetPole(cloud: PointCloud, pole: Pole) {
  pole.x = pole.gisX
  pole.y = pole.gisY
  pole.baseZ = getGroundZ(cloud, pole.x, pole.y)
  pole.height = pole.passportHeight
  pole.shift = null
  pole.snapped = false
}
