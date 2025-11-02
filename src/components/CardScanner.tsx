import { useSignal } from '@preact/signals'
import PokemonCardDetectorService, { type DetectionResult } from '../services/PokemonCardDetectionServices'
import { useEffect, useRef, useState } from 'preact/hooks'

interface PokemonCardDetectorProps {
  onDetectionComplete?: (results: DetectionResult[]) => void
  modelPath?: string
}

interface ExtractedCard {
  imageUrl: string
  confidence: number
  hash?: string
  matchedCard?: {
    id: string
    distance: number
    imageUrl?: string
  }
  topMatches?: Array<{
    id: string
    distance: number
    card: any
  }>
  selected?: boolean
}

export default function CardDetector({ modelPath = `${import.meta.env.BASE_URL}model/model.json` }: PokemonCardDetectorProps) {

  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [extractedCards, setExtractedCards] = useState<ExtractedCard[]>([])
  const [uploadResponse, setUploadResponse] = useState<any>(null)
  const [showResponseModal, setShowResponseModal] = useState<boolean>(false)

  const detectorService = PokemonCardDetectorService.getInstance()

  useEffect(() => {
    const initializeModel = async () => {
      try {
        setIsLoading(true)
        await detectorService.loadModel(modelPath)
        console.log('Model loaded successfully')
      } catch (error) {
        console.error('Error loading model:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeModel()
  }, [modelPath])

  // Extract card images from video canvas
  const extractCardImages = (sourceCanvas: HTMLCanvasElement, detections: any[]) => {
    const extractedCards: ExtractedCard[] = []

    detections
      .filter((detection: any) => detection.confidence >= 50)
      .forEach((detection: any) => {
        const points = detection.points
        const [x1, y1] = points[0]
        const [x2, y2] = points[2]
        const width = x2 - x1
        const height = y2 - y1

        // Create a temporary canvas for this card
        const tempCanvas = document.createElement('canvas')
        const tempCtx = tempCanvas.getContext('2d')
        
        if (!tempCtx) return

        tempCanvas.width = width
        tempCanvas.height = height

        // Extract the card region from source canvas
        tempCtx.drawImage(
          sourceCanvas,
          x1, y1, width, height,  // Source rectangle
          0, 0, width, height     // Destination rectangle
        )

        const cardImageUrl = tempCanvas.toDataURL('image/png')

        extractedCards.push({
          imageUrl: cardImageUrl,
          confidence: detection.confidence
        })
      })

    return extractedCards
  }

  // Helper function to download a single card
  const downloadCard = (card: ExtractedCard, index: number) => {
    const link = document.createElement('a')
    link.href = card.imageUrl
    link.download = `card-${index + 1}-${card.confidence.toFixed(1)}%.png`
    link.click()
  }

  // Helper function to toggle card selection
  const toggleCardSelection = (index: number) => {
    setExtractedCards(cards => 
      cards.map((card, i) => 
        i === index ? { ...card, selected: !card.selected } : card
      )
    )
  }

  // Helper function to download selected cards (or all if none selected)
  const downloadSelectedCards = () => {
    const cardsToDownload = extractedCards.filter(card => card.selected)
    const finalCards = cardsToDownload.length > 0 ? cardsToDownload : extractedCards
    
    finalCards.forEach((card, index) => {
      const originalIndex = extractedCards.indexOf(card)
      setTimeout(() => downloadCard(card, originalIndex), index * 100)
    })
  }

  // Helper function to upload cards to server
  const uploadCards = async (cards: ExtractedCard[], serverUrl: string) => {
    const cardsToUpload = cards.filter(card => card.selected)
    const finalCards = cardsToUpload.length > 0 ? cardsToUpload : cards
    
    const formData = new FormData()
    
    for (let i = 0; i < finalCards.length; i++) {
      const card = finalCards[i]
      // Convert base64 to blob
      const response = await fetch(card.imageUrl)
      const blob = await response.blob()
      formData.append(`card-${i}`, blob, `card-${i}.png`)
      formData.append(`confidence-${i}`, card.confidence.toString())
    }

    try {
      const uploadResponse = await fetch(serverUrl, {
        method: 'POST',
        body: formData
      })
      return await uploadResponse.json()
    } catch (error) {
      console.error('Upload failed:', error)
      throw error
    }
  }

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const state = useSignal<'preview' | 'processing' | 'processed'>('preview');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let running = true;

    const start = async () => {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1920, height: 1920 },
      });

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }

      renderLoop();
    };

    const renderLoop = async () => {
      const video = videoRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      
      if (!video || !overlayCanvas || !running) return;

      const overlayCtx = overlayCanvas.getContext('2d');

      if (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight) {
        overlayCanvas.width = video.videoWidth;
        overlayCanvas.height = video.videoHeight;
      }

      const loop = async () => {
        if (!overlayCtx) return;

        // are we in render mode?
        // otherwise we need to render and process stuff then bam.

        switch (state.value) {
          case 'preview':
            // Draw video to visible canvas for display
            overlayCtx.drawImage(video, 0, 0, overlayCanvas.width, overlayCanvas.height);
            break;
          case 'processing':
            // handle image processing
            // Draw the current frame to offscreen canvas at 640x640
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            overlayCtx.drawImage(video, 0, 0, overlayCanvas.width, overlayCanvas.height);
            const frame = overlayCtx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);

            // Detect bounding boxes
            const boxes = await detectorService.detectSingleImage(frame);

            // Extract card images from the canvas
            const cards = extractCardImages(overlayCanvas, boxes);
            setExtractedCards(cards);
            console.log(`Extracted ${cards.length} cards`);

            // Draw bounding boxes on overlay canvas
            overlayCtx.lineWidth = 10;
            overlayCtx.strokeStyle = 'green';
            overlayCtx.font = '16px monospace';
            overlayCtx.fillStyle = 'green';

            for (const box of boxes) {
              if (box.confidence < 50) continue;

              // grab bottom left and top right.
              const [[x1, y1], __, [x2, y2]] = box.points;
              const w = x2 - x1;
              const h = y2 - y1;
              overlayCtx.strokeRect(x1, y1, w, h);
              overlayCtx.fillText(`${box.class} (${box.confidence.toFixed(1)}%)`, x1, y1 - 5);
            }

            state.value = 'processed';
            break;
          case 'processed':
            break;
        }
      };

      await loop();

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    start();

    return () => {
      running = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  return (
    <div class="relative w-full h-full bg-black">
      <video
        ref={videoRef}
        class='absolute inset-0 w-full h-full object-cover'
        autoplay
        playsinline
        muted
      />
      <canvas
        ref={overlayCanvasRef}
        class="absolute inset-0 w-full h-full pointer-events-none z-10 object-cover"
        style={{ display: state.value === 'preview' ? 'none' : 'block' }}
      />
      <div class='rounded-full bg-blue-700 w-16 h-16 absolute bottom-4 left-1/2 z-20 -translate-x-1/2 cursor-pointer flex items-center justify-center' onClick={() => {
        if (state.value === 'preview') {
          state.value = 'processing';
        } else if (state.value === 'processed') {
          state.value = 'preview'
        }
      }}>
        {state.value === 'preview' && (
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke-width="2"/>
          </svg>
        )}
        {state.value === 'processed' && (
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )}
      </div>

      {state.value === 'processed' && extractedCards.length > 0 && (
        <div class="absolute top-4 right-4 z-20 flex flex-col gap-2">
          <button 
            onClick={downloadSelectedCards}
            class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-lg font-medium flex items-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download {extractedCards.filter(c => c.selected).length > 0 ? `(${extractedCards.filter(c => c.selected).length})` : `All (${extractedCards.length})`}
          </button>
          <button 
            onClick={async () => {
              try {
                setIsLoading(true)
                const response = await uploadCards(extractedCards, 'https://test3.xarcotic.dev/v1/identify/analyze')
                setUploadResponse(response)
                setShowResponseModal(true)
              } catch (error: any) {
                setUploadResponse({ error: error.message || 'Upload failed' })
                setShowResponseModal(true)
              } finally {
                setIsLoading(false)
              }
            }}
            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg font-medium flex items-center gap-2"
            disabled={isLoading}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {isLoading ? 'Uploading...' : extractedCards.filter(c => c.selected).length > 0 ? `Upload (${extractedCards.filter(c => c.selected).length})` : 'Upload All'}
          </button>
        </div>
      )}

      {state.value === 'processed' && extractedCards.length > 0 && (
        <div class="absolute bottom-24 left-4 right-4 z-20 bg-black/80 rounded-lg p-4 max-h-40 overflow-y-auto">
          <h3 class="text-white font-medium mb-2">
            Extracted Cards ({extractedCards.length})
            {extractedCards.filter(c => c.selected).length > 0 && (
              <span class="text-green-400"> • {extractedCards.filter(c => c.selected).length} selected</span>
            )}
          </h3>
          <div class="flex gap-2 flex-wrap">
            {extractedCards.map((card, index) => (
              <div 
                key={index}
                class={`relative group cursor-pointer ${card.selected ? 'ring-4 ring-green-500' : ''}`}
                onClick={() => toggleCardSelection(index)}
              >
                <img 
                  src={card.imageUrl} 
                  alt={`Card ${index + 1}`}
                  class={`w-16 h-24 object-cover rounded border-2 transition-all ${
                    card.selected 
                      ? 'border-green-500 opacity-100' 
                      : 'border-white/50 hover:border-green-500'
                  }`}
                />
                {card.selected && (
                  <div class="absolute top-1 right-1 bg-green-500 rounded-full p-1">
                    <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                  </div>
                )}
                <span class="absolute bottom-0 left-0 right-0 bg-black/80 text-white text-xs text-center py-1">
                  {card.confidence.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showResponseModal && (
        <div class="absolute inset-0 z-30 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowResponseModal(false)}>
          <div class="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-xl font-bold text-gray-900">Upload Response</h2>
              <button 
                onClick={() => setShowResponseModal(false)}
                class="text-gray-500 hover:text-gray-700"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre class="bg-gray-100 p-4 rounded text-sm overflow-auto text-gray-900">
              {JSON.stringify(uploadResponse, null, 2)}
            </pre>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(uploadResponse, null, 2))
                alert('Copied to clipboard!')
              }}
              class="mt-4 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg w-full"
            >
              Copy to Clipboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}