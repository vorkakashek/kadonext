import {
  FloatType,
  PMREMGenerator,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

type HeroEnvironmentGrade = {
  /** Exposure of the studio room/floor outside the bright softboxes. */
  surroundingsExposure?: number
}

function gradeEnvironment(texture: Texture, grade: HeroEnvironmentGrade) {
  const pixels = (texture.image as { data?: unknown } | undefined)?.data
  if (!(pixels instanceof Float32Array)) return

  const surroundingsExposure = grade.surroundingsExposure ?? 0.16

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!
    const g = pixels[i + 1]!
    const b = pixels[i + 2]!
    // Darken the studio room and floor, but preserve high-energy softboxes.
    // Glossy balls then catch deliberate white shapes without a bright halo
    // around every grazing angle — closer to a black-card product-light setup.
    const highlight = Math.min(1, Math.max(0, (Math.max(r, g, b) - 0.65) / 2.6))
    const highlightPreserve = highlight * highlight * (3 - 2 * highlight)
    const exposure = surroundingsExposure
      + (1 - surroundingsExposure) * highlightPreserve

    pixels[i] = r * exposure
    pixels[i + 1] = g * exposure
    pixels[i + 2] = b * exposure
  }

  texture.needsUpdate = true
}

/**
 * Desktop/mobile environment preparation is isolated from the scene module so
 * HDR parsing and PMREM code can live in a second, independently cached chunk.
 */
export async function loadHeroEnvironment(
  renderer: WebGLRenderer,
  url: string,
  onProgress?: (loaded: number, total: number) => void,
  grade?: HeroEnvironmentGrade,
): Promise<Texture> {
  const pmrem = new PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()

  let source: Texture | null = null
  try {
    source = await new HDRLoader().setDataType(FloatType).loadAsync(url, (event) => {
      onProgress?.(event.loaded, event.total)
    })
    if (grade) gradeEnvironment(source, grade)
    return pmrem.fromEquirectangular(source).texture
  }
  finally {
    source?.dispose()
    pmrem.dispose()
  }
}
