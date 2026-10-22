import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PointCloud, Pole, Span } from './types'

// in the data Z is up, in three.js Y is up, so: (x, y, z) -> (x, z, -y)
function toScene(x: number, y: number, z: number) {
  return new THREE.Vector3(x, z, -y)
}

const CLASS_COLORS: Record<number, THREE.Color> = {
  2: new THREE.Color('#a1887f'),
  5: new THREE.Color('#66bb6a'),
  14: new THREE.Color('#ffee58'),
  15: new THREE.Color('#ff7043'),
}

export function createViewer(container: HTMLElement) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0f1419')

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.5, 2000)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  scene.add(new THREE.AmbientLight('#ffffff', 1.5))
  const sun = new THREE.DirectionalLight('#ffffff', 2)
  sun.position.set(100, 200, 50)
  scene.add(sun)

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  })

  renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
  })

  return { scene, camera, controls }
}

export function set3DView(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  camera.position.set(-120, 70, 110)
  controls.target.set(0, 0, 0)
}

export function setTopView(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  // small z so OrbitControls knows where "up" is
  camera.position.set(0, 320, 0.01)
  controls.target.set(0, 0, 0)
}

export function createPointCloud(cloud: PointCloud): THREE.Points {
  const positions = new Float32Array(cloud.count * 3)
  for (let i = 0; i < cloud.count; i++) {
    const p = toScene(cloud.positions[i * 3], cloud.positions[i * 3 + 1], cloud.positions[i * 3 + 2])
    positions[i * 3] = p.x
    positions[i * 3 + 1] = p.y
    positions[i * 3 + 2] = p.z
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cloud.count * 3), 3))

  const material = new THREE.PointsMaterial({ size: 0.35, vertexColors: true })
  return new THREE.Points(geometry, material)
}

export function colorPoints(points: THREE.Points, cloud: PointCloud, mode: 'class' | 'height') {
  const colors = points.geometry.getAttribute('color') as THREE.BufferAttribute

  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < cloud.count; i++) {
    minZ = Math.min(minZ, cloud.positions[i * 3 + 2])
    maxZ = Math.max(maxZ, cloud.positions[i * 3 + 2])
  }

  const color = new THREE.Color()
  for (let i = 0; i < cloud.count; i++) {
    if (mode === 'class') {
      color.copy(CLASS_COLORS[cloud.classes[i]] ?? new THREE.Color('#ffffff'))
    } else {
      // blue (low) -> red (high)
      const t = (cloud.positions[i * 3 + 2] - minZ) / (maxZ - minZ)
      color.setHSL(0.66 - t * 0.66, 0.9, 0.5)
    }
    colors.setXYZ(i, color.r, color.g, color.b)
  }

  colors.needsUpdate = true
}

export function createNetworkModel(poles: Pole[], spans: Span[]): THREE.Group {
  const group = new THREE.Group()

  const woodMaterial = new THREE.MeshStandardMaterial({ color: '#8d6e63' })
  const concreteMaterial = new THREE.MeshStandardMaterial({ color: '#b0bec5' })
  const armMaterial = new THREE.MeshStandardMaterial({ color: '#455a64' })
  const wireMaterial = new THREE.LineBasicMaterial({ color: '#4fc3f7' })
  const markerMaterial = new THREE.MeshBasicMaterial({ color: '#4fc3f7' })

  const polesById = new Map(poles.map((p) => [p.id, p]))

  for (const pole of poles) {
    const geometry = new THREE.CylinderGeometry(0.15, 0.2, pole.height, 12)
    const mesh = new THREE.Mesh(geometry, pole.material === 'concrete' ? concreteMaterial : woodMaterial)
    mesh.position.copy(toScene(pole.x, pole.y, pole.baseZ + pole.height / 2))
    group.add(mesh)

    // small ring on the ground where the GIS says the pole is
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 24), markerMaterial)
    marker.rotation.x = -Math.PI / 2
    marker.position.copy(toScene(pole.gisX, pole.gisY, pole.baseZ + 0.1))
    group.add(marker)
  }

  for (const span of spans) {
    const a = polesById.get(span.from)
    const b = polesById.get(span.to)
    if (!a || !b) continue

    // direction of the span and a perpendicular to it (for crossarms and 2 wires)
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const px = -(b.y - a.y) / length
    const py = (b.x - a.x) / length

    for (const pole of [a, b]) {
      const top = pole.baseZ + pole.height - 0.3
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), armMaterial)
      arm.position.copy(toScene(pole.x, pole.y, top))
      arm.lookAt(toScene(pole.x + px, pole.y + py, top))
      group.add(arm)
    }

    for (const offset of [-0.6, 0.6]) {
      const points: THREE.Vector3[] = []
      const topA = a.baseZ + a.height - 0.3
      const topB = b.baseZ + b.height - 0.3

      // parabola is close enough to a real catenary for short spans
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const sag = 0.9 * 4 * t * (1 - t)
        points.push(
          toScene(
            a.x + (b.x - a.x) * t + px * offset,
            a.y + (b.y - a.y) * t + py * offset,
            topA + (topB - topA) * t - sag,
          ),
        )
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), wireMaterial))
    }
  }

  return group
}
