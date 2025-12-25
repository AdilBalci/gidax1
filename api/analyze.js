import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const HARAM_CODES = ['E120','E441','E542','E631','E635','E904','E920','E921','E422','E471','E472','E473','E474','E475','E476','E477','E478','E481','E482','E483','E491','E492','E493','E494','E495'];
const BOYCOTT = ['coca-cola','pepsi','nestle','starbucks','mcdonald','burger king','kfc','pizza hut','dominos','unilever','procter','danone','kraft','mondelez','mars','kellogs','heinz','colgate','johnson','loreal','nivea','garnier','head shoulders','gillette','oral-b','pampers','ariel','tide','pringles','lays','doritos','cheetos','lipton','magnum','algida','knorr','hellmann','ben jerry','haagen','nescafe','nespresso','kitkat','milka','oreo','toblerone','cadbury','philadelphia'];
const TURKISH = ['ülker','eti','torku','tadım','peyman','tat','tukaş','tamek','pınar','sütaş','mis','içim','tikveşli','uludağ','erikli','hayat','aytaç','namet','banvit','keskinoğlu','şenpiliç','bizim','yudum','komili','kristal','orkide','sagra','sera','burcu','öncü','selva','filiz','pastavilla','uno','untad','kent','golf','dido','albeni','çokoprens','hanımeller','kemal kükrer','sarelle','saray','koska','mado','kahve dünyası'];

async function fetchOFF(barcode) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p = data.product;
      return {
        found: true,
        product: p.product_name_tr || p.product_name || 'Ürün',
        brand: p.brands || '',
        category: p.categories?.split(',')[0] || '',
        ingredients: p.ingredients_text_tr || p.ingredients_text || '',
        nutriScore: p.nutriscore_grade?.toUpperCase() || null,
        novaGroup: p.nova_group || null,
        image: p.image_front_url || p.image_url || null,
        nutrients: p.nutriments || {},
        additives: p.additives_tags || []
      };
    }
  } catch (e) { console.error('OFF error:', e); }
  return { found: false };
}

async function analyzeWithAI(imageBase64, profile) {
  const prompt = `Sen bir gıda güvenliği ve beslenme uzmanısın. Bu gıda ürününü analiz et.

KULLANICI PROFİLİ:
- Hastalıklar: ${profile.diseases?.join(', ') || 'Yok'}
- Hassasiyetler: ${profile.sensitivities?.join(', ') || 'Yok'}

ÖNEMLİ: Sadece JSON formatında yanıt ver, başka hiçbir şey yazma. Tüm metinler TÜRKÇE olmalı.

{
  "product": "ürün adı (Türkçe)",
  "brand": "marka",
  "category": "kategori (Türkçe)",
  "healthScore": 0-100 arası sağlık skoru,
  "nutriScore": "A/B/C/D/E veya null",
  "novaGroup": 1-4 arası,
  "sugarLevel": "Düşük/Orta/Yüksek",
  "fatLevel": "Düşük/Orta/Yüksek",
  "saltLevel": "Düşük/Orta/Yüksek",
  "additiveLevel": "Düşük/Orta/Yüksek",
  "ingredients": [
    {"name": "içerik adı (Türkçe)", "code": "E-kodu veya null", "risk": 0-100, "level": "low/medium/high", "desc": "kısa açıklama (Türkçe)"}
  ],
  "warnings": ["uyarı mesajları (Türkçe)"],
  "personalWarning": "kullanıcıya özel uyarı (Türkçe) veya null",
  "personalSuitability": "success/warning/danger"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } }
      ]
    }]
  });

  const text = response.choices[0].message.content;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI yanıtı işlenemedi');
  return JSON.parse(jsonMatch[0]);
}

function checkSensitivities(data, profile) {
  const alerts = [];
  const brand = (data.brand || '').toLowerCase();
  const ingredients = (data.ingredients || []).map(i => i.name?.toLowerCase() || '');
  const codes = (data.ingredients || []).map(i => i.code?.toUpperCase()).filter(Boolean);

  if (profile.sensitivities?.includes('helal')) {
    const haramFound = codes.filter(c => HARAM_CODES.includes(c));
    if (haramFound.length > 0) {
      alerts.push({ icon: '☪️', title: 'Helal Değil!', message: `Şüpheli kodlar: ${haramFound.join(', ')}`, severity: 'danger' });
    } else {
      alerts.push({ icon: '☪️', title: 'Helal Uyumlu', message: 'Şüpheli içerik bulunamadı', severity: 'success' });
    }
  }

  if (profile.sensitivities?.includes('boykot')) {
    const isBoycott = BOYCOTT.some(b => brand.includes(b) || ingredients.some(i => i.includes(b)));
    if (isBoycott) {
      alerts.push({ icon: '✊', title: 'Boykot Listesinde!', message: 'Bu marka boykot listesinde', severity: 'danger' });
    }
  }

  if (profile.sensitivities?.includes('yerli')) {
    const isTurkish = TURKISH.some(t => brand.includes(t.toLowerCase()));
    if (isTurkish) {
      alerts.push({ icon: '🇹🇷', title: 'Yerli Üretim', message: 'Türk markası', severity: 'success' });
    } else {
      alerts.push({ icon: '🇹🇷', title: 'Yabancı Marka', message: 'Yerli üretim değil', severity: 'warning' });
    }
  }

  if (profile.sensitivities?.includes('vegan')) {
    const nonVegan = ['et','süt','yumurta','bal','jelatin','peynir','tereyağ','kaymak','krema'];
    const found = ingredients.filter(i => nonVegan.some(n => i.includes(n)));
    if (found.length > 0) {
      alerts.push({ icon: '🌱', title: 'Vegan Değil', message: `Hayvansal: ${found.slice(0,3).join(', ')}`, severity: 'danger' });
    } else {
      alerts.push({ icon: '🌱', title: 'Vegan Uyumlu', message: 'Hayvansal içerik yok', severity: 'success' });
    }
  }

  return alerts;
}

function getLevel(value) {
  const str = String(value || '').toLowerCase();
  if (str.includes('düşük') || str.includes('low')) return 'Düşük';
  if (str.includes('orta') || str.includes('medium')) return 'Orta';
  return 'Yüksek';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, barcode, profile = {} } = req.body;
    let result = {};

    if (barcode) {
      const off = await fetchOFF(barcode);
      if (off.found) {
        const n = off.nutrients;
        result = {
          offVerified: true,
          barcode,
          product: off.product,
          brand: off.brand,
          category: off.category,
          image: off.image,
          nutriScore: off.nutriScore,
          novaGroup: off.novaGroup,
          healthScore: off.nutriScore === 'A' ? 90 : off.nutriScore === 'B' ? 75 : off.nutriScore === 'C' ? 55 : off.nutriScore === 'D' ? 35 : 20,
          sugarLevel: n?.sugars_100g < 5 ? 'Düşük' : n?.sugars_100g < 15 ? 'Orta' : 'Yüksek',
          fatLevel: n?.fat_100g < 3 ? 'Düşük' : n?.fat_100g < 20 ? 'Orta' : 'Yüksek',
          saltLevel: n?.salt_100g < 0.3 ? 'Düşük' : n?.salt_100g < 1.5 ? 'Orta' : 'Yüksek',
          additiveLevel: off.additives?.length > 5 ? 'Yüksek' : off.additives?.length > 2 ? 'Orta' : 'Düşük',
          ingredients: off.additives?.slice(0, 5).map(a => ({
            name: a.replace('en:', '').replace(/-/g, ' '),
            code: a.match(/e\d+/i)?.[0]?.toUpperCase(),
            risk: 30,
            level: 'medium',
            desc: 'Katkı maddesi'
          })) || []
        };
      } else {
        return res.status(404).json({ error: 'Ürün bulunamadı. Fotoğraf ile deneyin.' });
      }
    } else if (image) {
      result = await analyzeWithAI(image, profile);
      result.offVerified = false;
    } else {
      return res.status(400).json({ error: 'Görsel veya barkod gerekli' });
    }

    result.sensitivityAlerts = checkSensitivities(result, profile);
    result.sugarLevel = getLevel(result.sugarLevel);
    result.fatLevel = getLevel(result.fatLevel);
    result.saltLevel = getLevel(result.saltLevel);
    result.additiveLevel = getLevel(result.additiveLevel);

    return res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Analiz hatası' });
  }
}