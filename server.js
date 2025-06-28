import express from 'express'
import multer from 'multer'
import dotenv from 'dotenv'
import cors from 'cors'
import mime from 'mime-types'
import { GoogleGenAI, Modality } from '@google/genai'

dotenv.config()

const app = express()
const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 } // حداکثر ۲۰ مگابایت
})
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

const PRIVATE_KEY = process.env.PRIVATE_API_KEY
const API_KEYS = process.env.GEMINI_API_KEYS?.split(',').map(k => k.trim()) || []

if (API_KEYS.length === 0) {
  console.error('❌ هیچ کلید API تعریف نشده. لطفاً .env را بررسی کنید.')
  process.exit(1)
}

let currentKeyIndex = 0

app.post('/api/gemini-image', upload.single('image'), async (req, res) => {
  const clientKey = req.headers['x-api-key']
  if (!clientKey || clientKey !== PRIVATE_KEY) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  const prompt = req.body.prompt
  const file = req.file
  const imageBuffer = file?.buffer
  const originalName = file?.originalname

  if (!prompt || !imageBuffer || !originalName) {
    return res.status(400).json({ error: 'prompt یا تصویر ارسال نشده.' })
  }

  const mimeType = mime.lookup(originalName) || file.mimetype
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    return res.status(415).json({ error: 'فرمت تصویر پشتیبانی نمی‌شود.' })
  }

  const base64Image = imageBuffer.toString('base64')
  const selectedKey = API_KEYS[currentKeyIndex]
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length

  try {
    const ai = new GoogleGenAI({ apiKey: selectedKey })

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image
              }
            }
          ]
        }
      ],
      config: {
        responseModalities: [Modality.IMAGE]
      }
    })

    const imageBase64 = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData?.data

    if (imageBase64) {
      const buffer = Buffer.from(imageBase64, 'base64')
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Content-Disposition', 'inline; filename="render.png"')
      return res.send(buffer)
    }

    return res.status(500).json({ error: 'پاسخ بدون تصویر دریافت شد.' })

  } catch (err) {
    console.error(`❌ خطا از کلید ${selectedKey.slice(0, 10)}... →`, err?.message || err)
    return res.status(500).json({ error: 'خطا در تولید تصویر', detail: err?.message || err })
  }
})

app.use((req, res) => {
  res.status(404).json({ error: 'مسیر نامعتبر است.' })
})

app.listen(PORT, () => {
  console.log(`🚀 API آماده است: http://localhost:${PORT}/api/gemini-image`)
})
