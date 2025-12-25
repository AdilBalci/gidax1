import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const HARAM_CODES = ['E120','E441','E542','E631','E635','E904','E920','E921','E422','E471','E472','E473','E474','E475','E476','E477','E478','E481','E482','E483','E491','E492','E493','E494','E495'];
const BOYCOTT = ['coca-cola','pepsi','nestle','starbucks','mcdonald','burger king','kfc','pizza hut','dominos','unilever','procter','danone','kraft','mondelez','mars','kellogs','heinz','colgate','johnson','loreal','nivea','garnier','head shoulders','gillette','oral-b','pampers','ariel','tide','pringles','lays','doritos','cheetos','lipton','magnum','algida','knorr','hellmann','ben jerry','haagen','nescafe','nespresso','kitkat','milka','oreo','toblerone','cadbury','philadelphia','frito'];
const TURKISH = ['ülker','eti','torku','tadım','peyman','tat','tukaş','tamek','pınar','sütaş','mis','içim','tikveşli','uludağ','erikli','hayat','aytaç','namet','banvit','keskinoğlu','şenpiliç','bizim','yudum','komili','kristal','orkide','sagra','sera','burcu','öncü','selva','filiz','pastavilla','uno','untad','kent','golf','dido','albeni','çokoprens','hanımeller','kemal kükrer','sarelle','saray','koska','mado','kahve dünyası','eker','dimes','cappy'];

async function fetchOFF(barcode) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p = data.product;
      const n = p.nutriments || {};
      return {
        found: true,
        product: p.product_name_tr || p.product_name || 'Bilinmeyen Ürün',
        brand: p.brands || 'Marka Belirtilmemiş',
        category: p.categories?.split(',')[0]?.trim() || 'Genel Gıda',
        ingredients: p.ingredients_text_tr || p.ingredients_text || '',
        nutriScore: p.nutriscore_grade?.toUpperCase() || null,
        novaGroup: p.nova_group || null,
        image: p.image_front_url || p.image_url || null,
        nutrients: n,
        additives: p.additives_tags || [],
        sugar100g: n.sugars_100g,
        fat100g: n.fat_100g,
        salt100g: n.salt_100g,
        energy100g: n['energy-kcal_100g'],
        protein100g: n.proteins_100g,
        carbs100g: n.carbohydrates_100g,
        fiber100g: n.fiber_100g,
        saturatedFat100g: n['saturated-fat_100g']
      };
    }
  } catch (e) { console.error('OFF error:', e); }
  return { found: false };
}

function calcHealthScore(off) {
  if (off.nutriScore) {
    const scores = { A: 90, B: 75, C: 55, D: 35, E: 20 };
    return scores[off.nutriScore] || 50;
  }
  let score = 70;
  if (off.sugar100g > 15) score -= 15;
  else if (off.sugar100g > 5) score -= 8;
  if (off.fat100g > 20) score -= 15;
  else if (off.fat100g > 10) score -= 8;
  if (off.salt100g > 1.5) score -= 10;
  else if (off.salt100g > 0.6) score -= 5;
  if (off.additives?.length > 5) score -= 10;
  return Math.max(10, Math.min(100, score));
}

function getLevel(value, type) {
  if (value === null || value === undefined) return null;
  const thresholds = {
    sugar: [5, 12.5],
    fat: [3, 17.5],
    salt: [0.3, 1.5],
    saturatedFat: [1.5, 5]
  };
  const t = thresholds[type] || [5, 15];
  if (value <= t[0]) return 'Düşük';
  if (value <= t[1]) return 'Orta';
  return 'Yüksek';
}

function formatNutrient(value, unit = 'g') {
  if (value === null || value === undefined) return null;
  return `${value.toFixed(1)}${unit}`;
}

function checkSensitivities(data, profile) {
  const alerts = [];
  const brand = (data.brand || '').toLowerCase();
  const ingredients = (data.ingredientsList || []).map(i => (i.name || '').toLowerCase());
  const codes = (data.ingredientsList || []).map(i => i.code?.toUpperCase()).filter(Boolean);

  if (profile.sensitivities?.includes('helal')) {
    const haramFound = codes.filter(c => HARAM_CODES.includes(c));
    if (haramFound.length > 0) {
      alerts.push({ icon: '☪️', title: 'Helal Uyarısı', message: `Şüpheli katkılar: ${haramFound.join(', ')}`, severity: 'danger' });
    } else {
      alerts.push({ icon: '☪️', title: 'Helal Uyumlu', message: 'Şüpheli içerik tespit edilmedi', severity: 'success' });
    }
  }

  if (profile.sensitivities?.includes('boykot')) {
    const isBoycott = BOYCOTT.some(b => brand.includes(b));
    if (isBoycott) {
      alerts.push({ icon: '✊', title: 'Boykot Uyarısı', message: 'Bu marka boykot listesinde', severity: 'danger' });
    }
  }

  if (profile.sensitivities?.includes('yerli')) {
    const isTurkish = TURKISH.some(t => brand.includes(t.toLowerCase()));
    if (isTurkish) {
      alerts.push({ icon: '🇹🇷', title: 'Yerli Üretim', message: 'Türk markası', severity: 'success' });
    } else if (brand && brand !== 'marka belirtilmemiş') {
      alerts.push({ icon: '🌍', title: 'İthal Ürün', message: 'Yabancı marka olabilir', severity: 'warning' });
    }
  }

  if (profile.sensitivities?.includes('vegan')) {
    const nonVegan = ['et','süt','yumurta','bal','jelatin','peynir','tereyağ','kaymak','krema','tavuk','balık','dana','kuzu'];
    const found = ingredients.filter(i => nonVegan.some(n => i.includes(n)));
    if (found.length > 0) {
      alerts.push({ icon: '🌱', title: 'Vegan Değil', message: `Hayvansal içerik: ${found.slice(0,3).join(', ')}`, severity: 'danger' });
    } else {
      alerts.push({ icon: '🌱', title: 'Muhtemelen Vegan', message: 'Hayvansal içerik tespit edilmedi', severity: 'success' });
    }
  }

  return alerts;
}

function parseIngredients(text, additives) {
  const result = [];
  
  // Additives from OFF
  if (additives?.length) {
    additives.slice(0, 8).forEach(a => {
      const code = a.match(/e\d+/i)?.[0]?.toUpperCase() || '';
      const name = a.replace('en:', '').replace(/-/g, ' ').replace(/e\d+[a-z]?/i, '').trim();
      const isHaram = HARAM_CODES.includes(code);
      result.push({
        name: name || code || 'Katkı Maddesi',
        code: code || null,
        risk: isHaram ? 80 : 40,
        level: isHaram ? 'high' : 'medium',
        desc: isHaram ? 'Helal değil olabilir' : 'Katkı maddesi'
      });
    });
  }

  // Parse text ingredients
  if (text && result.length < 10) {
    const parts = text.split(/[,;()]+/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 50);
    parts.slice(0, 10 - result.length).forEach(name => {
      if (!result.some(r => r.name.toLowerCase() === name.toLowerCase())) {
        const isCommon = ['su','tuz','şeker','un','yağ','nişasta'].some(c => name.toLowerCase().includes(c));
        result.push({
          name,
          code: null,
          risk: isCommon ? 10 : 25,
          level: isCommon ? 'low' : 'medium',
          desc: isCommon ? 'Temel içerik' : 'İçerik'
        });
      }
    });
  }

  return result.length ? result : [{ name: 'İçerik bilgisi mevcut değil', code: null, risk: 0, level: 'low', desc: 'Veri yok' }];
}

async function analyzeWithAI(imageBase64, profile) {
  const prompt = `Sen bir gıda analiz uzmanısın. Bu ürün görselini analiz et.

KULLANICI PROFİLİ:
- Hastalıklar: ${profile.diseases?.join(', ') || 'Belirtilmemiş'}
- Hassasiyetler: ${profile.sensitivities?.join(', ') || 'Belirtilmemiş'}

Sadece JSON döndür, başka metin yazma. Tüm değerler TÜRKÇE olmalı.

{
  "product": "ürün adı",
  "brand": "marka adı",
  "category": "kategori",
  "healthScore": 50,
  "nutriScore": "C",
  "novaGroup": 3,
  "sugar100g": 10.5,
  "fat100g": 15.2,
  "salt100g": 0.8,
  "energy100g": 450,
  "protein100g": 5.0,
  "carbs100g": 60.0,
  "ingredients": [
    {"name": "içerik", "code": "E-kodu veya null", "risk": 30, "level": "low/medium/high", "desc": "açıklama"}
  ],
  "warnings": ["varsa uyarılar"],
  "personalWarning": "kişiye özel uyarı veya null"
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
        result = {
          source: 'openfoodfacts',
          barcode,
          product: off.product,
          brand: off.brand,
          category: off.category,
          image: off.image,
          nutriScore: off.nutriScore,
          novaGroup: off.novaGroup,
          healthScore: calcHealthScore(off),
          
          // Besin değerleri - null yerine hesaplanmış değerler
          sugarLevel: getLevel(off.sugar100g, 'sugar'),
          fatLevel: getLevel(off.fat100g, 'fat'),
          saltLevel: getLevel(off.salt100g, 'salt'),
          additiveLevel: off.additives?.length > 5 ? 'Yüksek' : off.additives?.length > 2 ? 'Orta' : 'Düşük',
          
          // Detaylı besin bilgisi
          nutrients: {
            energy: formatNutrient(off.energy100g, ' kcal'),
            protein: formatNutrient(off.protein100g),
            carbs: formatNutrient(off.carbs100g),
            sugar: formatNutrient(off.sugar100g),
            fat: formatNutrient(off.fat100g),
            saturatedFat: formatNutrient(off.saturatedFat100g),
            fiber: formatNutrient(off.fiber100g),
            salt: formatNutrient(off.salt100g)
          },
          
          ingredientsList: parseIngredients(off.ingredients, off.additives)
        };
      } else {
        return res.status(404).json({ error: 'Ürün veritabanında bulunamadı. Fotoğraf ile analiz edin.' });
      }
    } else if (image) {
      const ai = await analyzeWithAI(image, profile);
      result = {
        source: 'ai',
        product: ai.product || 'Ürün',
        brand: ai.brand || 'Marka Belirtilmemiş',
        category: ai.category || 'Gıda',
        healthScore: ai.healthScore || 50,
        nutriScore: ai.nutriScore || null,
        novaGroup: ai.novaGroup || null,
        
        sugarLevel: getLevel(ai.sugar100g, 'sugar') || 'Bilinmiyor',
        fatLevel: getLevel(ai.fat100g, 'fat') || 'Bilinmiyor',
        saltLevel: getLevel(ai.salt100g, 'salt') || 'Bilinmiyor',
        additiveLevel: ai.ingredients?.filter(i => i.code)?.length > 3 ? 'Yüksek' : 'Orta',
        
        nutrients: {
          energy: formatNutrient(ai.energy100g, ' kcal'),
          protein: formatNutrient(ai.protein100g),
          carbs: formatNutrient(ai.carbs100g),
          sugar: formatNutrient(ai.sugar100g),
          fat: formatNutrient(ai.fat100g),
          salt: formatNutrient(ai.salt100g)
        },
        
        ingredientsList: ai.ingredients?.length ? ai.ingredients : [{ name: 'Görüntüden okunamadı', code: null, risk: 0, level: 'low', desc: '' }],
        warnings: ai.warnings || [],
        personalWarning: ai.personalWarning
      };
    } else {
      return res.status(400).json({ error: 'Görsel veya barkod gerekli' });
    }

    // Sensitivity checks
    result.sensitivityAlerts = checkSensitivities(result, profile);
    
    // Rename for frontend compatibility
    result.ingredients = result.ingredientsList;
    delete result.ingredientsList;

    return res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Analiz sırasında hata oluştu' });
  }
}