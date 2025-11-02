import * as tf from '@tensorflow/tfjs'

export interface BoundingBox {
  points: number[][]
  confidence: number
  class: string
  label?: number
}

export interface DetectionResult {
  imageIndex: number
  detections: BoundingBox[]
}

class PokemonCardDetectorService {
  private static instance: PokemonCardDetectorService
  private model: tf.GraphModel | null = null
  private modelLoading: Promise<void> | null = null
  private numClass = 1

  private constructor() {}

  public static getInstance(): PokemonCardDetectorService {
    if (!PokemonCardDetectorService.instance) {
      PokemonCardDetectorService.instance = new PokemonCardDetectorService()
    }
    return PokemonCardDetectorService.instance
  }

  public async loadModel(modelPath = `${import.meta.env.BASE_URL}/model/model.json`): Promise<void> {
    // await tf.setBackend('webgl');
    // await tf.ready();

    if (this.model) {
      return
    }

    if (this.modelLoading) {
      return this.modelLoading
    }

    this.modelLoading = new Promise<void>((resolve, reject) => {
      tf.loadGraphModel(modelPath)
        .then((loadedModel) => {
          this.model = loadedModel
          console.log('Model loaded successfully')
          resolve()
        })
        .catch((error) => {
          console.error('Error loading model:', error)
          this.modelLoading = null
          reject(error)
        })
    })

    return this.modelLoading
  }

  public isModelLoaded(): boolean {
    return !!this.model
  }

  public setNumClass(numClass: number): void {
    this.numClass = numClass
  }

  private preprocessImage(
    image: ImageData,
    modelWidth: number,
    modelHeight: number,
  ): {
    input: tf.Tensor
    originalWidth: number
    originalHeight: number
    paddedWidth: number
    paddedHeight: number
  } {
    const originalWidth = image.width
    const originalHeight = image.height
    const maxSize = Math.max(originalWidth, originalHeight)
    const paddedWidth = maxSize
    const paddedHeight = maxSize

    const input = tf.tidy(() => {
      const img = tf.browser.fromPixels(image)

      const imgPadded = img.pad([
        [0, maxSize - originalHeight],
        [0, maxSize - originalWidth],
        [0, 0],
      ])
      return tf.image
        .resizeBilinear(imgPadded as tf.Tensor3D, [modelWidth, modelHeight])
        .div(255.0)
        .expandDims(0)
    })

    return {
      input,
      originalWidth,
      originalHeight,
      paddedWidth,
      paddedHeight,
    }
  }

  public async detectSingleImage(image: ImageData): Promise<BoundingBox[]> {
    if (!this.model) {
      throw new Error('Model not loaded')
    }

    const modelWidth = 640
    const modelHeight = 640
    const scoreThreshold = 0.1
    const iouThreshold = 0.1

    // Preprocess outside tidy so we can manually dispose input later
    const { input, originalWidth, originalHeight, paddedWidth, paddedHeight } =
      this.preprocessImage(image, modelWidth, modelHeight)

    try {
      // All TensorFlow ops are now isolated inside tidy
      const [boxes, scores, classes] = tf.tidy(() => {
        const predictions = this.model!.predict(input) as tf.Tensor
        const transRes =
          predictions.shape.length === 3 && predictions.shape[0] === 1
            ? predictions.squeeze([0])
            : predictions

        const boxesSlice = transRes.slice([0, 0], [4, -1])
        const boxesTransposed = boxesSlice.transpose()
        const x = boxesTransposed.slice([0, 0], [-1, 1])
        const y = boxesTransposed.slice([0, 1], [-1, 1])
        const w = boxesTransposed.slice([0, 2], [-1, 1])
        const h = boxesTransposed.slice([0, 3], [-1, 1])
        const x1 = tf.sub(x, tf.div(w, 2))
        const y1 = tf.sub(y, tf.div(h, 2))
        const x2 = tf.add(x1, w)
        const y2 = tf.add(y1, h)
        const boxes = tf.concat([y1, x1, y2, x2], 1)

        const scoresSlice = transRes.slice([4, 0], [1, -1]).squeeze()
        const classesSlice = transRes.slice([5, 0], [this.numClass, -1])
        const scores = scoresSlice
        const classes = tf.argMax(classesSlice, 0)

        return [boxes, scores, classes]
      })

      // Important: Do NOT tidy around async call
      const nms = await tf.image.nonMaxSuppressionAsync(
        boxes as tf.Tensor2D,
        scores as tf.Tensor1D,
        100,
        iouThreshold,
        scoreThreshold
      )

      // Now create final detections
      const detections = tf.tidy(() =>
        tf.concat(
          [
            boxes.gather(nms, 0),
            scores.gather(nms, 0).expandDims(1),
            classes.gather(nms, 0).expandDims(1),
          ],
          1
        )
      )

      const detData = detections.dataSync()
      const numDetections = detections.shape[0]
      const boundingBoxes: BoundingBox[] = []

      const scaleX = originalWidth / paddedWidth
      const scaleY = originalHeight / paddedHeight

      for (let i = 0; i < numDetections; i++) {
        const offset = i * 6
        const y1 = detData[offset]
        const x1 = detData[offset + 1]
        const y2 = detData[offset + 2]
        const x2 = detData[offset + 3]
        const score = detData[offset + 4]
        const label = detData[offset + 5]

        const origX1 = (x1 * originalWidth) / 640 / scaleX
        const origY1 = (y1 * originalHeight) / 640 / scaleY
        const origX2 = (x2 * originalWidth) / 640 / scaleX
        const origY2 = (y2 * originalHeight) / 640 / scaleY

        boundingBoxes.push({
          points: [
            [origX1, origY1], // bottom left
            [origX2, origY1], // bottom right
            [origX2, origY2], // top right
            [origX1, origY2], // top left
          ],
          confidence: score * 100,
          class: 'pokemon_card',
          label,
        })
      }

      // Clean up manually only what we created
      boxes.dispose()
      scores.dispose()
      classes.dispose()
      nms.dispose()
      detections.dispose()

      return boundingBoxes
    } finally {
      input.dispose()
    }
  }

  // public async detectImages(imageFiles: File[]): Promise<DetectionResult[]> {
  //   if (!this.model) {
  //     await this.loadModel()
  //   }

  //   const results: DetectionResult[] = []

  //   for (let i = 0; i < imageFiles.length; i++) {
  //     try {
  //       const image = await this.fileToImage(imageFiles[i])
  //       const detections = await this.detectSingleImage(image)

  //       results.push({
  //         imageIndex: i,
  //         detections,
  //       })
  //     } catch (error) {
  //       console.error(`Error detecting objects in image ${i}:`, error)
  //       results.push({
  //         imageIndex: i,
  //         detections: [],
  //       })
  //     }
  //   }

  //   return results
  // }
}

export default PokemonCardDetectorService
