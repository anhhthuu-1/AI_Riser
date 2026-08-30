import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with limit for base64 image data
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Endpoint: AI Auto-Detect for Check-in Photo using Gemini Vision
app.post('/api/gemini/analyze-checkin', async (req, res) => {
  // Diverse authentic Saigon cultural presets for graceful fallback
  const SAIGON_CULTURAL_PRESETS = [
    {
      locationName: 'Cà Phê Sữa Đá Vỉa Hè',
      category: 'Góc Phố Cà Phê',
      stampBadge: 'Cà Phê Vợt ☕',
      aiReview: 'Nắng sớm chan hòa trên ly cà phê sữa đá, bình dị mà say đắm lòng người.',
      suggestedDistrict: 'Quận 1'
    },
    {
      locationName: 'Hẻm Sủi Cảo Hà Tôn Quyền',
      category: 'Vibe Chợ Lớn (Khu Người Hoa)',
      stampBadge: 'Sủi Cảo Chợ Lớn 🥟',
      aiReview: 'Khói nhang trầm mặc vương ngói cổ, Chợ Lớn đượm nét son trăm năm phong sương.',
      suggestedDistrict: 'Quận 5'
    },
    {
      locationName: 'Chùa Bà Thiên Hậu',
      category: 'Chùa Chiền & Tâm Linh',
      stampBadge: 'Tâm An Bình Yên ⛩️',
      aiReview: 'Chuông chùa ngân vang giữa lòng phố thị, nốt lặng an yên cầu vạn sự bình an.',
      suggestedDistrict: 'Quận 5'
    },
    {
      locationName: 'Phố Ốc Đêm Vĩnh Khánh',
      category: 'Sài Gòn Đêm & Món Đường Phố',
      stampBadge: 'Ốc Đêm Sài Gòn 🦪',
      aiReview: 'Khói than hoa quyện thơm ngõ hẻm, phong vị đường phố níu giữ chân người phương xa.',
      suggestedDistrict: 'Quận 4'
    },
    {
      locationName: 'Bưu Điện Trung Tâm Thành Phố',
      category: 'Chợ Sài Gòn & Di Sản',
      stampBadge: 'Di Sản Sài Gòn 📬',
      aiReview: 'Di sản trăm năm sừng sững giữa phố hoa lệ, chứng nhân lịch sử hào sảng phương Nam.',
      suggestedDistrict: 'Quận 1'
    }
  ];

  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 in request body' });
    }

    const ai = getGeminiClient();
    if (!ai || !process.env.GEMINI_API_KEY) {
      const preset = SAIGON_CULTURAL_PRESETS[Math.floor(Math.random() * SAIGON_CULTURAL_PRESETS.length)];
      return res.json({ fallback: true, ...preset });
    }

    // Process image: check if it's a URL or direct Base64
    let cleanBase64 = '';
    let finalMimeType = mimeType || 'image/jpeg';

    if (imageBase64.startsWith('http://') || imageBase64.startsWith('https://')) {
      try {
        const imgResp = await fetch(imageBase64);
        if (imgResp.ok) {
          const arrayBuf = await imgResp.arrayBuffer();
          cleanBase64 = Buffer.from(arrayBuf).toString('base64');
          const cType = imgResp.headers.get('content-type');
          if (cType) finalMimeType = cType.split(';')[0];
        }
      } catch (fetchErr) {
        console.warn('Failed to fetch image URL, using fallback:', fetchErr);
      }
    } else {
      cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9.+]+;base64,/i, '');
    }

    if (!cleanBase64) {
      const preset = SAIGON_CULTURAL_PRESETS[Math.floor(Math.random() * SAIGON_CULTURAL_PRESETS.length)];
      return res.json({ fallback: true, ...preset });
    }

    const promptText = `
Bạn là "Thổ Địa Sài Gòn" thế hệ Gen Z, sành ăn, sành chơi và am hiểu sâu sắc văn hóa góc phố Sài Gòn.
Hãy nhìn vào bức ảnh check-in thực tế do người dùng tải lên và thực hiện:
1. Nhận diện món ăn, ly nước, địa danh, chùa chiền, khu chợ, kiến trúc hoặc góc phố Sài Gòn trong ảnh.
2. Xếp vào chính xác 1 trong 5 bộ sưu tập văn hoá Sài Gòn sau:
   - "Góc Phố Cà Phê" (cà phê bệt, chung cư cafe, cà phê vợt, quán cóc)
   - "Vibe Chợ Lớn (Khu Người Hoa)" (hẻm Chợ Lớn, sủi cảo, bánh hẹ, quán mì tiều, đèn lồng, hội quán)
   - "Chùa Chiền & Tâm Linh" (chùa bà, miếu, chùa Ngọc Hoàng, nhang vòng, an yên)
   - "Sài Gòn Đêm & Món Đường Phố" (quán ốc đêm, cơm tấm sườn nướng, bánh mì, hủ tiếu, ăn vặt vỉa hè)
   - "Chợ Sài Gòn & Di Sản" (chợ Bến Thành, chợ Bà Chiểu, Bưu điện, Dinh Độc Lập, di tích lịch sử)
3. Đặt một "Tên Địa Điểm / Món" thật hấp dẫn, đậm chất đời sống Sài Gòn.
4. Tạo một "Con dấu số" (stampBadge) ngắn gọn (dưới 4 từ) kèm emoji đặc trưng (VD: "Cà Phê Bệt 🥤", "Hẻm Ốc Đêm 🦪", "Bánh Hẹ Chợ Lớn 🥟", "Bưu Điện Cổ 📬", "Tâm An Bình Yên ⛩️").
5. Sáng tác một "Lời bình thơ Sài Gòn" (aiReview) phong cách Gen Z cực thơ hoặc dí dỏm, đúng khoảng 12 - 18 từ tiếng Việt, có vần điệu hoặc nhịp điệu êm ái.
6. Dự đoán Quận phù hợp (chọn 1: "Quận 1", "Quận 3", "Quận 5", "Quận 6", "Quận 4", "Quận 10", "Quận Phú Nhuận", "Quận Bình Thạnh", "TP. Thủ Đức").

Trả về định dạng JSON đúng theo schema.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: finalMimeType,
            }
          },
          {
            text: promptText
          }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            locationName: { type: Type.STRING, description: 'Tên địa điểm hoặc món ăn cụ thể' },
            category: { 
              type: Type.STRING, 
              enum: [
                'Góc Phố Cà Phê', 
                'Vibe Chợ Lớn (Khu Người Hoa)', 
                'Chùa Chiền & Tâm Linh', 
                'Sài Gòn Đêm & Món Đường Phố', 
                'Chợ Sài Gòn & Di Sản'
              ] 
            },
            stampBadge: { type: Type.STRING, description: 'Con dấu số ngắn gọn kèm emoji' },
            aiReview: { type: Type.STRING, description: 'Lời bình thơ Sài Gòn 12-18 từ' },
            suggestedDistrict: { type: Type.STRING, description: 'Quận đề xuất' }
          },
          required: ['locationName', 'category', 'stampBadge', 'aiReview']
        }
      }
    });

    const rawJson = response.text?.trim() || '{}';
    const parsed = JSON.parse(rawJson);
    return res.json(parsed);

  } catch (err: any) {
    console.warn('Gemini API notice (fallback activated):', err?.message || 'Access restricted');
    const preset = SAIGON_CULTURAL_PRESETS[Math.floor(Math.random() * SAIGON_CULTURAL_PRESETS.length)];
    return res.json({
      fallback: true,
      ...preset
    });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sài Gòn Passport Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
