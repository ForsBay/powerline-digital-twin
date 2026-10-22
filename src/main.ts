import './style.css'
import * as THREE from 'three'
import { loadPointCloud, loadNetwork } from './data'
import { snapPoleToScan, resetPole } from './analysis'
import { createViewer, createPointCloud, colorPoints, createNetworkModel, set3DView, setTopView } from './scene'
import type { PointCloud, Pole, Span } from './types'

const container = document.querySelector<HTMLDivElement>('#viewer')!
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const showPoints = document.querySelector<HTMLInputElement>('#show-points')!
const showModel = document.querySelector<HTMLInputElement>('#show-model')!
const colorMode = document.querySelector<HTMLSelectElement>('#color-mode')!
const snapBtn = document.querySelector<HTMLButtonElement>('#snap-btn')!
const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')!
const tableBody = document.querySelector<HTMLTableSectionElement>('#pole-table')!

const { scene, camera, controls } = createViewer(container)
set3DView(camera, controls)

let cloud: PointCloud
let points: THREE.Points
let poles: Pole[] = []
let spans: Span[] = []
let model: THREE.Group | null = null

function rebuildModel() {
  if (model) scene.remove(model)
  model = createNetworkModel(poles, spans)
  model.visible = showModel.checked
  scene.add(model)
}

function renderTable() {
  tableBody.innerHTML = poles
    .map((pole) => {
      let shift = '-'
      if (pole.snapped && pole.shift !== null) {
        // more than 1.5 m is a big error for a map
        const warn = pole.shift > 1.5 ? 'warn' : ''
        shift = `<span class="${warn}">${pole.shift.toFixed(2)} m</span>`
      }

      return `
        <tr>
          <td>${pole.id}</td>
          <td>${pole.material}</td>
          <td>${shift}</td>
          <td>${pole.height.toFixed(1)} m${pole.snapped ? '' : ' *'}</td>
        </tr>
      `
    })
    .join('')
}

async function init() {
  try {
    const base = import.meta.env.BASE_URL
    const [cloudData, network] = await Promise.all([
      loadPointCloud(`${base}data/scan.xyz`),
      loadNetwork(`${base}data/network.geojson`),
    ])

    cloud = cloudData
    poles = network.poles
    spans = network.spans

    points = createPointCloud(cloud)
    colorPoints(points, cloud, 'class')
    scene.add(points)

    poles.forEach((pole) => resetPole(cloud, pole))
    rebuildModel()
    renderTable()

    statusEl.textContent = `${cloud.count.toLocaleString()} points, ${poles.length} poles, ${spans.length} spans`
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : 'Could not load data'
    statusEl.classList.add('error')
  }
}

showPoints.addEventListener('change', () => {
  if (points) points.visible = showPoints.checked
})

showModel.addEventListener('change', () => {
  if (model) model.visible = showModel.checked
})

colorMode.addEventListener('change', () => {
  if (points) colorPoints(points, cloud, colorMode.value as 'class' | 'height')
})

snapBtn.addEventListener('click', () => {
  if (!cloud) return
  poles.forEach((pole) => snapPoleToScan(cloud, pole))
  rebuildModel()
  renderTable()

  const notFound = poles.filter((p) => p.shift === null).length
  statusEl.textContent = notFound > 0 ? `${notFound} pole(s) not found in the scan` : 'All poles snapped to the scan'
})

resetBtn.addEventListener('click', () => {
  if (!cloud) return
  poles.forEach((pole) => resetPole(cloud, pole))
  rebuildModel()
  renderTable()
  statusEl.textContent = 'Poles are back at GIS positions'
})

document.querySelector('#view-3d')!.addEventListener('click', () => set3DView(camera, controls))
document.querySelector('#view-top')!.addEventListener('click', () => setTopView(camera, controls))

init()
