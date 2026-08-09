import html2canvas from "html2canvas"

type CopyScoreboardImageOptions = {
  scale?: number
  quality?: number
}

const CAPTURE_FONT_CSS = `
  @font-face {
    font-family: 'Godo';
    src: url('https://cdn.jsdelivr.net/korean-webfonts/1/corps/godo/Godo/GodoM.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: 'Godo';
    src: url('https://cdn.jsdelivr.net/korean-webfonts/1/corps/godo/Godo/GodoB.woff2') format('woff2');
    font-weight: 700;
    font-style: normal;
  }
  @font-face {
    font-family: 'Aldrich';
    src: url('https://fonts.gstatic.com/s/aldrich/v22/MCoTzAn-1s3IGyJMZaA.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: #050505;
    -webkit-font-smoothing: antialiased;
  }
`

const JPEG_QUALITY = 0.92

function sanitizeCaptureStyles(root: HTMLElement) {
  root.style.background = "#0a0a0a"
  root.style.backgroundImage = "none"
  root.style.boxShadow = "none"

  root.querySelectorAll<HTMLElement>("*").forEach((node) => {
    const bg = node.style.background || node.style.backgroundImage
    if (bg.includes("gradient")) {
      node.style.background = "rgba(10,10,10,0.96)"
      node.style.backgroundImage = "none"
    }

    if (node.style.clipPath) node.style.clipPath = "none"
    if (node.style.filter) node.style.filter = "none"
    if (node.style.boxShadow) node.style.boxShadow = "none"
  })

  root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    img.style.filter = "none"
    img.style.clipPath = "none"
  })

  root
    .querySelectorAll<HTMLElement>("span[aria-hidden='true']")
    .forEach((node) => {
      const bg = node.style.background || node.style.backgroundImage
      if (bg.includes("repeating-linear-gradient")) {
        node.remove()
      }
    })
}

function isolateCaptureClone(documentClone: Document) {
  const target = documentClone.querySelector<HTMLElement>(
    "[data-scoreboard-capture-root]",
  )
  if (!target) return

  documentClone.querySelectorAll("link[rel='stylesheet'], style").forEach((node) => {
    node.remove()
  })

  const fontStyle = documentClone.createElement("style")
  fontStyle.textContent = CAPTURE_FONT_CSS
  documentClone.head.appendChild(fontStyle)

  const body = documentClone.body
  body.replaceChildren(target)
  body.style.margin = "0"
  body.style.padding = "0"
  body.style.background = "#050505"

  target.style.position = "static"
  target.style.left = "auto"
  target.style.top = "auto"
  target.style.opacity = "1"
  target.style.visibility = "visible"
  target.style.width = "880px"
  target.style.minHeight = "1px"

  sanitizeCaptureStyles(target)
}

async function waitForCaptureImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"))
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener("load", done, { once: true })
          img.addEventListener("error", done, { once: true })
        }),
    ),
  )
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/png",
  quality?: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), type, quality)
  })
}

async function copyBlobToClipboard(blob: Blob, mimeType: string) {
  await navigator.clipboard.write([
    new ClipboardItem({ [mimeType]: blob }),
  ])
}

export async function copyScoreboardImage(
  element: HTMLElement,
  options: CopyScoreboardImageOptions = {},
) {
  const scale = options.scale ?? 3
  const quality = options.quality ?? JPEG_QUALITY

  await waitForCaptureImages(element)
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error("캡처할 점수판 영역의 크기를 계산하지 못했습니다.")
  }

  const canvas = await html2canvas(element, {
    backgroundColor: "#050505",
    scale,
    useCORS: true,
    logging: false,
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
    onclone: (documentClone) => {
      isolateCaptureClone(documentClone)
    },
  })

  const jpegBlob = await canvasToBlob(canvas, "image/jpeg", quality)
  const pngBlob = await canvasToBlob(canvas, "image/png")

  if (!jpegBlob && !pngBlob) {
    throw new Error("이미지를 만들지 못했습니다.")
  }

  if (
    typeof navigator !== "undefined" &&
    "clipboard" in navigator &&
    typeof ClipboardItem !== "undefined"
  ) {
    if (jpegBlob) {
      try {
        await copyBlobToClipboard(jpegBlob, "image/jpeg")
        return
      } catch {
        // Try PNG below.
      }
    }

    if (pngBlob) {
      try {
        await copyBlobToClipboard(pngBlob, "image/png")
        return
      } catch {
        // Fallback below.
      }
    }
  }

  const blob = jpegBlob ?? pngBlob
  if (!blob) {
    throw new Error("이미지를 만들지 못했습니다.")
  }

  const extension = blob.type === "image/jpeg" ? "jpg" : "png"
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement("a")
    link.href = url
    link.download = `dbd-scoreboard-${Date.now()}.${extension}`
    link.click()
    throw new Error(
      "클립보드 복사를 지원하지 않는 브라우저입니다. 이미지를 다운로드했습니다.",
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
