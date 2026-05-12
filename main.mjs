import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { layoutNextLine, prepareWithSegments } from '/pretext.js'
import {
  carveTextLineSlots,
  chooseSlot,
  clamp,
  getMaskIntervalForBand,
  getMouseBlackHoleInterval,
  mergeIntervals,
  splitParagraphs,
} from './mask-layout.mjs'

const MONO_FONT = '"Courier New","JetBrains Mono","Fira Code","Consolas",monospace'
const BODY_FONT_FAMILY = MONO_FONT
const BODY_FONT_SIZE = 13
const BODY_FONT = `${BODY_FONT_SIZE}px ${BODY_FONT_FAMILY}`
const BODY_LINE_HEIGHT = 16
const KICKER_FONT_SIZE = 9
const KICKER_LINE_HEIGHT = 13
const TITLE_FONT_SIZE = 20
const TITLE_LINE_HEIGHT = 22
const MIN_SLOT_WIDTH = 80
const MASK_SIZE = { width: 1024, height: 576 }
const MASK_PADDING = 10
const MIN_JUSTIFY_WIDTH = 9999

const GLITCH_RADIUS = 300
const GLITCH_VELOCITY_SCALE = 0.012
const copyLayer = requireElement('copy-layer')
const sceneLayer = requireElement('scene-layer')
const scrubFill = requireElement('scrub-fill')
const statusChip = requireElement('status-chip')

function generateFlightLogText() {
  const tokens = [
    'DATA_CORRUPTED', 'SECTOR_7G_OFFLINE', '0xBADF00D', 'MEMORY_FRAGMENT_LOST',
    'EJECT_SYSTEM_FAILED', 'RECOVERING_LOGS...', 'NAVIGATION_OFFLINE', '0xDEADBEEF',
    'LIFE_SUPPORT_CRITICAL', 'SOS_BEACON_ACTIVE', 'FUEL_CELL_DEPLETED', '0xCAFEBABE',
    'HULL_BREACH_DETECTED', 'EMERGENCY_PROTOCOL_7', 'OXYGEN_RESERVE_LOW', '0x8BADF00D',
    'COMMS_ARRAY_DAMAGED', 'ESCAPE_POD_JETTISONED', 'BLACK_BOX_RECORDING', '0xFEEDFACE',
    'REACTOR_CORE_UNSTABLE', 'STASIS_POD_MALFUNCTION', 'ASTROMETRICS_OFFLINE', '0xBADC0DE',
    'SALVAGE_CLAIM_ACTIVE', 'DERELICT_CLASS_OMEGA', 'ORBITAL_DECAY_IMMINENT', '0x00F0FF',
    'CRYOSLEEP_INTERRUPTED', 'UNKNOWN_SIGNAL_DETECTED', 'CARGO_BAY_DECOMPRESSED',
  ]
  const paragraphs = []
  for (let i = 0; i < 90; i++) {
    let para = []
    const count = Math.floor(Math.random() * 7) + 3
    for (let w = 0; w < count; w++) {
      para.push(tokens[Math.floor(Math.random() * tokens.length)])
    }
    paragraphs.push(para.join(' '))
  }
  return paragraphs.join('\n')
}

const BLOCKS = [
  {
    id: 'block-full',
    kicker: 'EMERGENCY LOG RECOVERY',
    title: `DERELICT
OMEGA-7`,
    bodyAlign: 'left',
    titleAlign: 'left',
    headerOffset: 14,
    text: generateFlightLogText(),
  },
]

const preparedBlocks = BLOCKS.map(block => {
  const titleLines = block.title.split(/\n+/).map(line => line.trim()).filter(Boolean)
  const leadLines = [
    {
      text: block.kicker.toUpperCase(),
      prepared: prepareWithSegments(block.kicker.toUpperCase(), `${KICKER_FONT_SIZE}px ${MONO_FONT}`),
      fontFamily: MONO_FONT,
      fontSize: `${KICKER_FONT_SIZE}px`,
      lineHeight: `${KICKER_LINE_HEIGHT}px`,
      letterSpacing: '0.22em',
      fontWeight: '700',
      textTransform: 'uppercase',
      slotHeight: KICKER_LINE_HEIGHT,
      advanceAfter: 6,
      align: 'left',
    },
    ...titleLines.map((text, index) => ({
      text,
      prepared: prepareWithSegments(text, `${TITLE_FONT_SIZE}px ${MONO_FONT}`),
      fontFamily: MONO_FONT,
      fontSize: `${TITLE_FONT_SIZE}px`,
      lineHeight: `${TITLE_LINE_HEIGHT}px`,
      letterSpacing: '0.12em',
      fontWeight: '700',
      textTransform: 'uppercase',
      slotHeight: TITLE_LINE_HEIGHT,
      advanceAfter: index === 0 ? 0 : 3,
      align: block.titleAlign,
    })),
  ]

  return {
    ...block,
    titleLines,
    leadLines,
    preparedParagraphs: splitParagraphs(block.text).map(paragraph => prepareWithSegments(paragraph, BODY_FONT)),
  }
})

const linePool = []
const visibleRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
const maskCanvas = document.createElement('canvas')
const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
const maskRenderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: false,
  preserveDrawingBuffer: true,
})
const scene = new THREE.Scene()
const maskScene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
const maskCamera = camera.clone()
const clock = new THREE.Clock()
const pointer = {
  dragging: false,
  progress: 0.5,
  target: 0.5,
  startX: 0,
  startProgress: 0.5,
}
let mouseX = null
let mouseY = null
let lastMouseX = null
let lastMouseY = null
let mouseVelocity = 0

let modelRotationY = 0
let modelRotationX = 0.15
let startRotationX = 0.15
let startRotationY = 0

let modelRoot = null
let maskRoot = null
let fitState = null
let viewportWidth = window.innerWidth
let viewportHeight = window.innerHeight
let lastLayoutKey = ''
let lastMask = null

initScene()
if (maskContext === null) {
  throw new Error('Unable to create a 2D context for the mask canvas.')
}
void loadModel()
window.addEventListener('resize', handleResize)
document.addEventListener('pointerdown', handlePointerDown)
document.addEventListener('pointermove', handlePointerMove)
document.addEventListener('pointerup', handlePointerUp)
document.addEventListener('pointercancel', handlePointerUp)
requestAnimationFrame(tick)

function initScene() {
  visibleRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  visibleRenderer.setSize(viewportWidth, viewportHeight)
  visibleRenderer.outputColorSpace = THREE.SRGBColorSpace
  sceneLayer.appendChild(visibleRenderer.domElement)

  maskRenderer.setSize(MASK_SIZE.width, MASK_SIZE.height, false)
  maskRenderer.setClearColor(0x000000, 1)
  maskRenderer.toneMapping = THREE.NoToneMapping
  maskRenderer.outputColorSpace = THREE.LinearSRGBColorSpace
  maskCanvas.width = MASK_SIZE.width
  maskCanvas.height = MASK_SIZE.height

  scene.background = new THREE.Color(0x05050A)
  maskScene.background = new THREE.Color(0x000000)
  maskScene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })

  const ambient = new THREE.AmbientLight(0x0a1a2a, 0.45)
  scene.add(ambient)

  const keyLight = new THREE.SpotLight(0xffffff, 120)
  keyLight.position.set(5, 1.5, 6)
  keyLight.angle = 0.45
  keyLight.penumbra = 0.35
  keyLight.decay = 1.0
  keyLight.distance = 22
  keyLight.target.position.set(0, 1.0, 0)
  scene.add(keyLight)
  scene.add(keyLight.target)

  const rimLight = new THREE.SpotLight(0x00F0FF, 80)
  rimLight.position.set(-4, 2.5, -3)
  rimLight.angle = 0.5
  rimLight.penumbra = 0.7
  rimLight.decay = 1.1
  rimLight.distance = 18
  rimLight.target.position.set(0, 1.8, 0)
  scene.add(rimLight)
  scene.add(rimLight.target)

  const fillLight = new THREE.PointLight(0x003344, 3)
  fillLight.position.set(0, -2, 4)
  scene.add(fillLight)

  camera.position.set(0, 0, 13)
  handleResize()
}

async function loadModel() {
  try {
    statusChip.textContent = 'RECOVERING FLIGHT DATA…'

    const loader = new GLTFLoader()
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
    loader.setDRACOLoader(dracoLoader)
    const gltf = await loader.loadAsync('./assets/model.glb')
    modelRoot = gltf.scene
    normalizeModel(modelRoot)
    addCyberWireframe(modelRoot)
    scene.add(modelRoot)

    maskRoot = modelRoot.clone(true)
    maskScene.add(maskRoot)

    fitState = computeFitState(modelRoot, camera, viewportWidth, viewportHeight)
    statusChip.textContent = 'DRAG TO ROTATE'
  } catch (_error) {
    statusChip.textContent = 'SIGNAL LOST — STANDBY'
    modelRoot = createProceduralModel(scene)
    maskRoot = createProceduralModel(maskScene)
    fitState = computeFitState(modelRoot, camera, viewportWidth, viewportHeight)
  }
}

function createProceduralModel(targetScene) {
  const group = new THREE.Group()
  const solidMat = new THREE.MeshStandardMaterial({
    color: 0x0a1018,
    roughness: 0.55,
    metalness: 0.25,
  })
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00F0FF, transparent: true, opacity: 0.45 })

  function addPart(w, h, d, x, y, z, segW = 3, segH = 3, segD = 2) {
    const geo = new THREE.BoxGeometry(w, h, d, segW, segH, segD)
    const solid = new THREE.Mesh(geo, solidMat)
    solid.position.set(x, y, z)
    group.add(solid)

    const edges = new THREE.EdgesGeometry(geo)
    const lines = new THREE.LineSegments(edges, lineMat)
    lines.position.copy(solid.position)
    group.add(lines)
  }

  // Hood (oversized, extends around head)
  addPart(3.4, 2.0, 2.6, 0, 5.8, 0, 5, 3, 3)
  addPart(3.0, 2.6, 2.4, 0, 5.0, 0, 5, 4, 3)

  // Head inside hood
  addPart(2.2, 2.4, 1.8, 0, 4.0, 0.2, 4, 4, 3)

  // Mask (thin bar across face)
  addPart(2.0, 0.9, 0.15, 0, 4.2, 1.2, 3, 2, 1)

  // Neck
  addPart(1.2, 1.0, 1.2, 0, 2.8, 0, 2, 2, 2)

  // Shoulders (wide hoodie shape)
  addPart(7.0, 0.7, 3.0, 0, 2.3, 0, 6, 2, 3)
  addPart(6.4, 0.6, 2.8, 0, 1.8, 0, 5, 2, 3)

  // Upper torso
  addPart(5.0, 2.0, 2.2, 0, 0.8, 0, 5, 3, 3)

  // Mid torso
  addPart(4.2, 1.8, 2.0, 0, -0.6, 0, 4, 3, 3)

  // Lower torso / waist
  addPart(3.4, 1.5, 1.8, 0, -1.8, 0, 3, 3, 3)

  // Hood side flaps
  addPart(0.6, 2.8, 1.4, -1.7, 4.8, -0.2, 1, 4, 2)
  addPart(0.6, 2.8, 1.4, 1.7, 4.8, -0.2, 1, 4, 2)

  group.scale.setScalar(0.55)
  group.position.set(0, 0.35, 0)
  targetScene.add(group)
  return group
}

function normalizeModel(root) {
  root.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.001)
  const scale = 5.0 / maxDim
  root.scale.setScalar(scale)
  root.updateWorldMatrix(true, true)

  const scaledBox = new THREE.Box3().setFromObject(root)
  const scaledSize = scaledBox.getSize(new THREE.Vector3())
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3())
  root.position.sub(scaledCenter)

  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = false
    child.receiveShadow = false
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material) continue
      material.side = THREE.DoubleSide
    }
  })
}

function addCyberWireframe(root) {
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x00F0FF,
    transparent: true,
    opacity: 0.25,
    depthTest: true,
    depthWrite: false,
  })

  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return
    const geo = child.geometry
    if (!geo || !geo.index && !geo.attributes.position) return
    try {
      const edges = new THREE.EdgesGeometry(geo, 22)
      const lines = new THREE.LineSegments(edges, lineMat)
      child.add(lines)
    } catch (_) {
      // skip degenerate geometry
    }
  })
}

function computeFitState(root, activeCamera, width, height) {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const halfFov = THREE.MathUtils.degToRad(activeCamera.fov * 0.5)
  const fitHeightDistance = (size.y * 0.64) / Math.tan(halfFov)
  const fitWidthDistance = (size.x * 0.56) / (Math.tan(halfFov) * activeCamera.aspect)
  const baseDistance = Math.max(fitHeightDistance, fitWidthDistance, 5.8)

  return {
    target: center.clone(),
    baseDistance,
  }
}

function handleResize() {
  viewportWidth = window.innerWidth
  viewportHeight = window.innerHeight
  camera.aspect = viewportWidth / viewportHeight
  camera.updateProjectionMatrix()
  maskCamera.copy(camera)
  visibleRenderer.setSize(viewportWidth, viewportHeight)
  fitState = modelRoot === null ? fitState : computeFitState(modelRoot, camera, viewportWidth, viewportHeight)
  if (fitState && modelRoot) {
    camera.position.set(
      fitState.target.x,
      fitState.target.y,
      fitState.target.z + fitState.baseDistance,
    )
    camera.lookAt(fitState.target)
    maskCamera.copy(camera)
  }
  lastLayoutKey = ''
}

function handlePointerDown(event) {
  pointer.dragging = true
  pointer.startX = event.clientX
  pointer.startY = event.clientY
  pointer.startProgress = pointer.target
  startRotationX = modelRotationX
  startRotationY = modelRotationY
}

function handlePointerMove(event) {
  if (lastMouseX != null) {
    const dx = event.clientX - lastMouseX
    const dy = event.clientY - lastMouseY
    mouseVelocity = Math.sqrt(dx * dx + dy * dy)
  }
  lastMouseX = event.clientX
  lastMouseY = event.clientY
  mouseX = event.clientX
  mouseY = event.clientY

  if (pointer.dragging) {
    const dx = (event.clientX - pointer.startX) / viewportWidth
    pointer.target = clamp(pointer.startProgress + dx, 0, 1)
    modelRotationY = pointer.target * Math.PI * 2
    const dy = (event.clientY - pointer.startY) / viewportHeight
    modelRotationX = clamp(startRotationX + dy * Math.PI * 0.5, -0.5, 0.5)
  }
}

function handlePointerUp() {
  pointer.dragging = false
}

function tick() {
  requestAnimationFrame(tick)
  if (modelRoot === null || maskRoot === null || fitState === null) return

  const dt = clock.getDelta()

  if (!pointer.dragging) {
    const idleSpeed = 0.12
    modelRotationY += dt * idleSpeed
    pointer.target = (modelRotationY % (Math.PI * 2)) / (Math.PI * 2)
    pointer.progress = pointer.target
  } else {
    pointer.progress += (pointer.target - pointer.progress) * clamp(dt * 8.0, 0.04, 0.15)
    modelRotationY = pointer.progress * Math.PI * 2
  }

  // Decay mouse velocity
  mouseVelocity *= Math.max(0, 1 - dt * 12)

  modelRoot.rotation.y = modelRotationY
  modelRoot.rotation.x = modelRotationX
  maskRoot.rotation.copy(modelRoot.rotation)

  scrubFill.style.width = '100%'
  scrubFill.style.transform = `scaleX(${clamp(pointer.progress, 0, 1)})`

  camera.position.set(
    fitState.target.x,
    fitState.target.y,
    fitState.target.z + fitState.baseDistance,
  )
  camera.lookAt(fitState.target)
  maskCamera.copy(camera)

  renderScene()
  layoutCopy(renderMask())
  applyGlitch()
}

function renderScene() {
  visibleRenderer.render(scene, camera)
}

function renderMask() {
  maskRenderer.render(maskScene, maskCamera)
  maskContext.clearRect(0, 0, MASK_SIZE.width, MASK_SIZE.height)
  maskContext.drawImage(maskRenderer.domElement, 0, 0, MASK_SIZE.width, MASK_SIZE.height)
  const image = maskContext.getImageData(0, 0, MASK_SIZE.width, MASK_SIZE.height)
  lastMask = image
  return image
}

function layoutCopy(mask) {
  const regions = getRegions(viewportWidth, viewportHeight)
  const layoutKey = `${viewportWidth}:${viewportHeight}:${modelRotationY.toFixed(4)}:${modelRotationX.toFixed(4)}:${mouseX ?? 0}:${mouseY ?? 0}`
  if (layoutKey === lastLayoutKey) return
  lastLayoutKey = layoutKey

  const lines = []
  for (const block of preparedBlocks) {
    const region = regions.find(entry => entry.id === block.id)
    const blockLines = layoutBlock(block, region, mask)
    lines.push(...blockLines)
  }

  syncLinePool(lines.length)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const node = linePool[index]
    node.textContent = line.text
    node.style.left = `${line.x}px`
    node.style.top = `${line.y}px`
    node.style.wordSpacing = line.wordSpacing
    node.style.width = `${Math.max(line.slotWidth, line.width)}px`
    node.style.textAlign = line.align
    node.style.fontFamily = line.fontFamily
    node.style.fontSize = line.fontSize
    node.style.lineHeight = line.lineHeight
    node.style.letterSpacing = line.letterSpacing
    node.style.fontWeight = line.fontWeight
    node.style.textTransform = line.textTransform
  }
}

function layoutBlock(block, region, mask) {
  const lines = []
  let y = region.y + block.headerOffset

  for (const leadLine of block.leadLines) {
    const placed = placeFlowLine(
      leadLine,
      region,
      mask,
      y,
      BODY_LINE_HEIGHT,
      { allowRightAlign: block.titleAlign === 'right' },
    )
    if (placed === null) {
      y += leadLine.slotHeight
      continue
    }

    lines.push(placed.line)
    y = placed.nextY
  }

  y += 6

  for (const preparedParagraph of block.preparedParagraphs) {
    let cursor = { segmentIndex: 0, graphemeIndex: 0 }

    while (y + BODY_LINE_HEIGHT <= region.y + region.height) {
      const interval = getMaskIntervalForBand(
        mask,
        y - 2,
        y + BODY_LINE_HEIGHT + 1,
        viewportWidth,
        viewportHeight,
        { threshold: 26, padding: MASK_PADDING, minPixels: 1 },
      )

      const allIntervals = []
      if (interval !== null) allIntervals.push(interval)

      const mouseHole = getMouseBlackHoleInterval(mouseX, mouseY, y, y + BODY_LINE_HEIGHT)
      if (mouseHole !== null) allIntervals.push(mouseHole)

      const merged = allIntervals.length === 0
        ? []
        : mergeIntervals(allIntervals, region.x, region.x + region.width)

      const slots = carveTextLineSlots(
        { left: region.x, right: region.x + region.width },
        merged,
        MIN_SLOT_WIDTH,
      )

      if (slots.length === 0) {
        y += BODY_LINE_HEIGHT
        continue
      }

      const slot = chooseSlot(slots, block.bodyAlign)
      const slotWidth = slot.right - slot.left
      const line = layoutNextLine(preparedParagraph, cursor, slotWidth)

      if (line === null) break

      lines.push({
        x: Math.round(slot.left),
        y: Math.round(y),
        text: line.text,
        width: line.width,
        slotWidth: Math.floor(slotWidth),
        align: 'left',
        wordSpacing: '0px',
        fontFamily: MONO_FONT,
        fontSize: `${BODY_FONT_SIZE}px`,
        lineHeight: `${BODY_LINE_HEIGHT}px`,
        letterSpacing: '0.02em',
        fontWeight: '400',
        textTransform: 'none',
      })

      cursor = line.end
      y += BODY_LINE_HEIGHT
    }

    y += BODY_LINE_HEIGHT * 0.3
  }

  return lines
}

function placeFlowLine(lineSpec, region, mask, y, fallbackLineHeight, options = {}) {
  let currentY = y
  const lineHeight = parseFloat(lineSpec.lineHeight) || fallbackLineHeight

  while (currentY + lineHeight <= region.y + region.height) {
    const interval = getMaskIntervalForBand(
      mask,
      currentY - 2,
      currentY + lineHeight + 1,
      viewportWidth,
      viewportHeight,
      { threshold: 26, padding: MASK_PADDING, minPixels: 1 },
    )

    const allIntervals = []
    if (interval !== null) allIntervals.push(interval)

    const mouseHole = getMouseBlackHoleInterval(mouseX, mouseY, currentY, currentY + lineHeight)
    if (mouseHole !== null) allIntervals.push(mouseHole)

    const merged = allIntervals.length === 0
      ? []
      : mergeIntervals(allIntervals, region.x, region.x + region.width)

    const slots = carveTextLineSlots(
      { left: region.x, right: region.x + region.width },
      merged,
      MIN_SLOT_WIDTH,
    )

    if (slots.length === 0) {
      currentY += lineHeight
      continue
    }

    const slot = chooseSlot(slots, options.allowRightAlign ? 'right' : 'left')
    const slotWidth = slot.right - slot.left
    const line = layoutNextLine(lineSpec.prepared, { segmentIndex: 0, graphemeIndex: 0 }, slotWidth)
    if (line === null) {
      currentY += lineHeight
      continue
    }

    return {
      line: {
        x: Math.round(slot.left),
        y: Math.round(currentY),
        text: line.text,
        width: line.width,
        slotWidth: Math.floor(slotWidth),
        align: lineSpec.align,
        wordSpacing: '0px',
        fontFamily: lineSpec.fontFamily,
        fontSize: lineSpec.fontSize,
        lineHeight: lineSpec.lineHeight,
        letterSpacing: lineSpec.letterSpacing,
        fontWeight: lineSpec.fontWeight,
        textTransform: lineSpec.textTransform,
      },
      nextY: currentY + lineHeight + (lineSpec.advanceAfter ?? 0),
    }
  }

  return null
}

function getRegions(width, height) {
  const pad = 28
  return [
    { id: 'block-full', x: pad, y: 20, width: width - pad * 2, height: height - 60 },
  ]
}

function applyGlitch() {
  if (mouseX == null || mouseY == null) return
  const veloBoost = Math.min(mouseVelocity * GLITCH_VELOCITY_SCALE, 0.6)
  for (const node of linePool) {
    const left = parseFloat(node.style.left) || 0
    const top = parseFloat(node.style.top) || 0
    const width = parseFloat(node.style.width) || 0
    const cx = left + width / 2
    const cy = top + BODY_LINE_HEIGHT / 2
    const dist = Math.sqrt((cx - mouseX) ** 2 + (cy - mouseY) ** 2)
    if (dist < GLITCH_RADIUS) {
      const proximity = 1 - dist / GLITCH_RADIUS
      const intensity = proximity + veloBoost * (1 - proximity * 0.4)
      const clampedIntensity = Math.min(intensity, 1)
      const jitter = (Math.random() - 0.5) * 0.6 * clampedIntensity * clampedIntensity
      node.style.letterSpacing = `${(0.02 + jitter).toFixed(4)}em`
      const sx = (Math.random() - 0.5) * 5 * clampedIntensity
      const sy = (Math.random() - 0.5) * 3 * clampedIntensity
      node.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`
      node.style.opacity = `${1 - clampedIntensity * 0.45}`
      node.style.textShadow = `0 0 ${2 + clampedIntensity * 8}px #00F0FF, 0 0 ${1 + clampedIntensity * 4}px rgba(0,240,255,0.6)`
    } else if (veloBoost > 0.05) {
      const ripple = veloBoost * 0.4
      const jitter = (Math.random() - 0.5) * 0.2 * ripple
      node.style.letterSpacing = `${(0.02 + jitter).toFixed(4)}em`
      node.style.transform = ''
      node.style.opacity = '1'
      node.style.textShadow = ''
    } else {
      node.style.letterSpacing = '0.02em'
      node.style.transform = ''
      node.style.opacity = '1'
      node.style.textShadow = ''
    }
  }
}

function syncLinePool(count) {
  while (linePool.length < count) {
    const node = document.createElement('div')
    node.className = 'copy-line'
    copyLayer.appendChild(node)
    linePool.push(node)
  }

  while (linePool.length > count) {
    linePool.pop().remove()
  }
}

function requireElement(id) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}`)
  }
  return element
}
