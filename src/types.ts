export interface PointCloud {
  positions: Float32Array // x, y, z for each point
  classes: Uint8Array
  count: number
}

export interface Pole {
  id: string
  material: string
  gisX: number // position from GIS (meters from origin)
  gisY: number
  x: number // current position in the model
  y: number
  baseZ: number // ground level
  height: number
  passportHeight: number
  snapped: boolean
  shift: number | null // meters, null = not found in scan
}

export interface Span {
  id: string
  from: string
  to: string
}
