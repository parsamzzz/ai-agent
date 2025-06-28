import express from 'express'
import multer from 'multer'
import dotenv from 'dotenv'
import cors from 'cors'
import mime from 'mime-types'
import axios from 'axios'

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

let currentKeyIndex = 0

app.post('/api/image-to-render', upload.single('image'), async (req, res) => {
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
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent`,
      {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['IMAGE']
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': selectedKey
        }
      }
    )

    const imageData = response.data?.candidates?.[0]?.content?.parts?.find(p => p.inline_data?.data)?.inline_data?.data

    if (imageData) {
      const buffer = Buffer.from(imageData, 'base64')
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Content-Disposition', 'inline; filename="render.png"')
      return res.send(buffer)
    }

    return res.status(500).json({ error: 'پاسخ بدون تصویر دریافت شد.' })

  } catch (err) {
    console.error(`❌ کلید ${selectedKey.slice(0, 10)}... شکست خورد:`, err?.message || err)
    return res.status(500).json({ error: 'خطا در تولید تصویر', detail: err?.message || err })
  }
})

app.use((req, res) => {
  res.status(404).json({ error: 'مسیر نامعتبر است.' })
})

app.listen(PORT, () => {
  console.log(`🚀 API آماده است: http://localhost:${PORT}/api/image-to-render`)
})
