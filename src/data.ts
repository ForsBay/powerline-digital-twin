import type { PointCloud, Pole, Span } from './types'

const M_PER_DEG_LAT = 111320

async function fetchFile(url: string): Promise<Response> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url} (status ${res.status})`)
  return res
}

// file format: "x y z class" on each line
export async function loadPointCloud(url: string): Promise<PointCloud> {
  const text = await (await fetchFile(url)).text()
  const lines = text.trim().split('\n')

  const positions = new Float32Array(lines.length * 3)
  const classes = new Uint8Array(lines.length)
  let count = 0

  for (const line of lines) {
    const [x, y, z, cls] = line.split(' ').map(Number)
    if ([x, y, z, cls].some(isNaN)) continue // skip broken lines

    positions[count * 3] = x
    positions[count * 3 + 1] = y
    positions[count * 3 + 2] = z
    classes[count] = cls
    count++
  }

  return { positions, classes, count }
}

// converts lon/lat to meters from the origin
// simple equirectangular projection, good enough for a few km
function lonLatToMeters(lon: number, lat: number, origin: [number, number]) {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((origin[1] * Math.PI) / 180)
  return {
    x: (lon - origin[0]) * mPerDegLon,
    y: (lat - origin[1]) * M_PER_DEG_LAT,
  }
}

export async function loadNetwork(url: string): Promise<{ poles: Pole[]; spans: Span[] }> {
  const geojson = await (await fetchFile(url)).json()
  const origin: [number, number] = geojson.properties.origin

  const poles: Pole[] = []
  const spans: Span[] = []

  for (const feature of geojson.features) {
    if (feature.geometry.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates
      const { x, y } = lonLatToMeters(lon, lat, origin)

      poles.push({
        id: feature.properties.id,
        material: feature.properties.material,
        gisX: x,
        gisY: y,
        x,
        y,
        baseZ: 0,
        height: feature.properties.height,
        passportHeight: feature.properties.height,
        snapped: false,
        shift: null,
      })
    } else if (feature.geometry.type === 'LineString') {
      spans.push({
        id: feature.properties.id,
        from: feature.properties.from,
        to: feature.properties.to,
      })
    }
  }

  return { poles, spans }
}
