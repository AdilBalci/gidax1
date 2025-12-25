import OpenAI from 'openai';

export const config = { maxDuration: 60 };

// ===== HASSASIYET VERITABANLARI =====

// Helal olmayan/şüpheli E kodları
const HARAM_E_CODES = [
  'E120', // Karmin (böcekten)
  'E441', // Jelatin (domuz olabilir)
  'E542', // Kemik fosfatı
  'E904', // Shellac (böcekten)
  'E471', // Mono-digliseritler (hayvansal olabilir)
  'E472', // Esterler (hayvansal olabilir)
  'E473', // Sukroesterler
  'E474', // Sukrogliseritler
  'E475', // Poligliserol esterleri
  'E476', // Poligliserol polirisinoleat
  'E477', // Propilen glikol esterleri
  'E478', // Laktilat esterleri
  'E479', // Termofikse soya yağı
  'E481', // Sodyum stearoil laktilat
  'E482', // Kalsiyum stearoil laktilat
  'E483', // Stearil tartrat
  'E491', // Sorbitan monostearat
  'E492', // Sorbitan tristearat
  'E493', // Sorbitan monolaurat
  'E494', // Sorbitan monooleat
  'E495', // Sorbitan monopalmitat
  'E570', // Stearik asit
  'E572', // Magnezyum stearat
  'E631', // Sodyum inosinat
  'E635', // Sodyum ribonükleotit
  'E640', // Glisin
  'E920', // L-sistein (insan saçından olabilir)
];

// Boykot listesi (İsrail destekçisi markalar)
const BOYCOTT_BRANDS = [
  'coca-cola', 'coca cola', 'coke', 'fanta', 'sprite', 'powerade', 'minute maid',
  'pepsi', 'pepsico', 'lays', 'lay\'s', 'doritos', 'cheetos', 'ruffles', 'fritos', 'tostitos', 'walkers',
  'nestle', 'nestlé', 'nescafe', 'nescafé', 'nesquik', 'kitkat', 'kit kat', 'maggi', 'perrier', 'vittel', 'purina',
  'starbucks', 'mcdonald\'s', 'mcdonalds', 'mcd', 'burger king',
  'danone', 'activia', 'actimel', 'alpro',
  'unilever', 'knorr', 'lipton', 'dove', 'axe', 'rexona', 'signal', 'domestos', 'cif', 'omo', 'comfort',
  'procter', 'p&g', 'ariel', 'tide', 'pampers', 'gillette', 'oral-b', 'head & shoulders', 'pantene', 'herbal essences',
  'johnson', 'j&j', 'johnson & johnson', 'listerine', 'neutrogena',
  'mondelez', 'oreo', 'milka', 'toblerone', 'philadelphia', 'lu', 'belvita', 'cadbury',
  'heinz', 'kraft', 'kraft heinz',
  'l\'oreal', 'loreal', 'l\'oréal', 'maybelline', 'garnier', 'lancome', 'nyx',
  'colgate', 'palmolive', 'colgate-palmolive',
  'hp', 'hewlett', 'intel', 'amd',
  'puma', 'adidas',
  'ahava', 'sabra', 'sodastream', 'jaffa',
  'carrefour', 'carrefoursa',
  'caterpillar', 'cat',
  'volvo', 'siemens',
  're/max', 'remax',
  'disney', 'marvel',
];

// Türk / Yerli markalar
const TURKISH_BRANDS = [
  'ülker', 'ulker', 'eti', 'tat', 'tamek', 'tukaş', 'tukas', 'pınar', 'pinar', 'sütaş', 'sutas',
  'torku', 'şölen', 'solen', 'tadım', 'tadim', 'peyman', 'güllüoğlu', 'gulluoglu',
  'türk kahvesi', 'turkish coffee', 'tariş', 'taris', 'marmarabirlik', 'komili',
  'sana', 'bizim', 'mis', 'içim', 'icim', 'aymar', 'dimes', 'cappy türkiye',
  'sera', 'penguen', 'kemal kükrer', 'kemal kukrer', 'kristal', 'yudum',
  'kahve dünyası', 'kahve dunyasi', 'haribo türkiye',
  'eker', 'balküpü', 'balkupu', 'tat', 'burcu', 'öncü', 'oncu',
  'pastavilla', 'filiz', 'nuh\'un ankara', 'nuhun ankara', 'ankara makarna',
  'çaykur', 'caykur', 'doğuş', 'dogus', 'lipton türkiye', 'doğadan', 'dogadan',
  'kent', 'falim', 'bayram', 'halk', 'beypazarı', 'beypazari', 'kızılay', 'kizilay', 'erikli', 'hayat su',
  'banvit', 'seç', 'sec', 'namet', 'yayla', 'reis', 'duru', 'arbella',
  'bingo', 'abc deterjan', 'e deterjan',
  'solo', 'selpak', 'solo türk', 'tuvalet kağıdı', 'hayat', 'familia',
  'molfix', 'bebiko',
  'tat bakliyat', 'yayla bakliyat',
  'polonez', 'poli',
  'mado', 'saray', 'hafız mustafa', 'hafiz mustafa',
];

// ===== KONTROL FONKSİYONLARI =====

function checkHalalStatus(ingredients, additives) {
  const found = [];
  const text = (ingredients + ' ' + (additives || [])).join(' ').toUpperCase();
  
  // E kodlarını kontrol et
  for (const code of HARAM_E_CODES) {
    if (text.includes(code)) {
      found.push(code);
    }
  }
  
  // Domuz/alkol kelimelerini kontrol et
  const haramWords = ['domuz', 'pork', 'bacon', 'ham', 'lard', 'gelatin', 'jelatin', 'alkol', 'alcohol', 'wine', 'şarap', 'bira', 'beer', 'rom', 'viski', 'whisky', 'vodka'];
  for (const word of haramWords) {
    if (text.toLowerCase().includes(word)) {
      found.push(word);
    }
  }
  
  return found;
}

function checkBoycottStatus(brand, product) {
  const text = ((brand || '') + ' ' + (product || '')).toLowerCase();
  for (const b of BOYCOTT_BRANDS) {
    if (text.includes(b)) {
      return { isBoycott: true, brand: b };
    }
  }
  return { isBoycott: false };
}

function checkTurkishBrand(brand, product) {
  const text = ((brand || '') + ' ' + (product || '')).toLowerCase();
  for (const b of TURKISH_BRANDS) {
    if (text.includes(b)) {
      return { isTurkish: true, brand: b };
    }
  }
  return { isTurkish: false };
}

// Open Food Facts API
async function searchOFF(query) {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
    const res = await fetch(url, { headers: { 'User-Agent': 'GidaX/2.0' } });
    return (await res.json()).products || [];
  } catch (e) { return []; }
}

async function getByBarcode(barcode) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`, { headers: { 'User-Agent': 'GidaX/2.0' } });
    const data = await res.json();
    return data.status === 1 ? data.product : null;
  } catch (e) { return null; }
}

async function getAlternatives(category, currentScore) {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?action=process&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(category)}&sort_by=nutriscore_score&page_size=10&json=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'GidaX/2.0' } });
    const data = await res.json();
    const scoreMap = { a: 90, b: 75, c: 55, d: 35, e: 15 };
    return (data.products || [])
      .filter(p => p.nutriscore_grade && scoreMap[p.nutriscore_grade] > currentScore)
      .slice(0, 3)
      .map(p => ({
        name: p.product_name || 'Ürün',
        brand: p.brands || 'Marka',
        score: scoreMap[p.nutriscore_grade] || 50,
        barcode: p.code
      }));
  } catch (e) { return []; }
}

function parseOFF(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  const lvl = (v, l, h) => v == null ? 'Bilinmiyor' : v <= l ? 'Düşük' : v <= h ? 'Orta' : 'Yüksek';
  const scoreMap = { a: 90, b: 75, c: 55, d: 35, e: 15 };
  return {
    brand: p.brands || 'Bilinmiyor',
    product: p.product_name || p.product_name_tr || 'Bilinmiyor',
    category: p.categories?.split(',')[0]?.trim() || 'Gıda',
    healthScore: p.nutriscore_grade ? scoreMap[p.nutriscore_grade.toLowerCase()] : null,
    sugarLevel: lvl(n.sugars_100g, 5, 12.5),
    fatLevel: lvl(n['saturated-fat_100g'], 1.5, 5),
    saltLevel: lvl(n.salt_100g, 0.3, 1.5),
    additiveLevel: p.additives_n > 5 ? 'Yüksek' : p.additives_n > 2 ? 'Orta' : 'Düşük',
    novaLevel: p.nova_group ? `NOVA ${p.nova_group}` : null,
    nutriScore: p.nutriscore_grade?.toUpperCase(),
    ingredients_text: p.ingredients_text || p.ingredients_text_tr,
    additives: p.additives_tags || [],
    allergens: p.allergens_tags || [],
    barcode: p.code,
    categories: p.categories
  };
}

const diseaseRules = {
  diyabet: { avoid: ['şeker', 'glukoz', 'fruktoz', 'sakkaroz', 'mısır şurubu', 'maltoz'], reason: 'kan şekerinizi yükseltir' },
  hipertansiyon: { avoid: ['sodyum', 'tuz', 'msg', 'e621'], reason: 'tansiyonunuzu yükseltir' },
  kolesterol: { avoid: ['doymuş yağ', 'trans yağ', 'palm yağı'], reason: 'kolesterolü yükseltir' },
  bobrekyetmezligi: { avoid: ['potasyum', 'fosfor', 'sodyum'], reason: 'böbreklere zarar verir' },
  gut: { avoid: ['purin', 'maya', 'et özü'], reason: 'ürik asidi yükseltir' },
  karaciger: { avoid: ['alkol', 'yağ', 'fruktoz'], reason: 'karaciğere zarar verir' },
  kalp: { avoid: ['sodyum', 'doymuş yağ', 'trans yağ'], reason: 'kalp sağlığını etkiler' },
  obezite: { avoid: ['şeker', 'yağ'], reason: 'kilo kontrolünü zorlaştırır' }
};

const allergenMap = {
  gluten: ['gluten', 'buğday', 'arpa', 'çavdar'],
  laktoz: ['süt', 'laktoz', 'peynir', 'tereyağı'],
  fistik: ['fıstık', 'fındık', 'badem', 'ceviz'],
  yumurta: ['yumurta'],
  denizurunleri: ['balık', 'karides', 'midye'],
  soya: ['soya']
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const { image, barcode, profile } = req.body;
    if (!image && !barcode) return res.status(400).json({ error: 'Görsel veya barkod gerekli' });
    
    const userProfile = profile || { diseases: [], allergies: [], diets: [] };
    let offData = null;
    let visionData = {};

    // Barkod ile doğrudan arama
    if (barcode) {
      const product = await getByBarcode(barcode);
      if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });
      offData = parseOFF(product);
    }
    
    // Görsel ile analiz
    if (image) {
      const visionRes = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 500,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: 'system', content: 'Görseldeki ürünü tanımla. JSON: {"product_name":"","brand":"","barcode":null,"category":""}' },
          { role: 'user', content: [{ type: 'image_url', image_url: { url: image, detail: 'high' } }] }
        ]
      });
      visionData = JSON.parse(visionRes.choices[0].message.content);
      
      // OFF'ta ara
      if (visionData.barcode) {
        const p = await getByBarcode(visionData.barcode);
        if (p) offData = parseOFF(p);
      }
      if (!offData && visionData.product_name) {
        const results = await searchOFF(`${visionData.brand || ''} ${visionData.product_name}`.trim());
        if (results.length) offData = parseOFF(results[0]);
      }
    }

    // Profil prompt
    let profilePrompt = '';
    if (userProfile.diseases.length || userProfile.allergies.length || userProfile.diets.length) {
      profilePrompt = `\nKULLANICI: Hastalık: ${userProfile.diseases.join(',')||'yok'}, Alerji: ${userProfile.allergies.join(',')||'yok'}, Diyet: ${userProfile.diets.join(',')||'yok'}. personalWarning ve personalSuitability doldur.`;
    }

    // AI analizi - temperature=0 for consistency
    const analysisRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: `Gıda analizi yap.${profilePrompt}\n${offData ? 'OFF:' + JSON.stringify(offData) : ''}\nJSON:{brand,product,category,healthScore(0-100),sugarLevel,fatLevel,additiveLevel,novaLevel,nutriScore,warnings[],ingredients[{name,code,desc,level,risk}],personalWarning,personalSuitability(danger/warning/success)}` },
        { role: 'user', content: image ? [{ type: 'image_url', image_url: { url: image, detail: 'high' } }, { type: 'text', text: 'Analiz et' }] : `Barkod: ${barcode}, Ürün: ${offData?.product}` }
      ]
    });

    let result = JSON.parse(analysisRes.choices[0].message.content);

    // Yerel kural kontrolü
    const ingText = (result.ingredients?.map(i => i.name.toLowerCase()).join(' ') || '') + ' ' + (offData?.ingredients_text?.toLowerCase() || '');
    let localWarns = [];
    let suit = result.personalSuitability || 'success';

    for (const d of userProfile.diseases) {
      const r = diseaseRules[d];
      if (r) for (const a of r.avoid) if (ingText.includes(a)) { localWarns.push(`${a.toUpperCase()} - ${r.reason}`); suit = 'danger'; }
    }
    for (const a of userProfile.allergies) {
      const list = allergenMap[a];
      if (list) for (const al of list) if (ingText.includes(al)) { localWarns.push(`${al.toUpperCase()} alerjiniz var!`); suit = 'danger'; }
    }

    if (localWarns.length) {
      result.personalWarning = (result.personalWarning || '') + ' ' + localWarns.join('. ');
      result.personalSuitability = suit;
    }

    // OFF ile birleştir - OFF verileri HER ZAMAN öncelikli
    if (offData) {
      // OFF'tan gelen değerler AI'dan önce gelir
      result = { ...result, 
        brand: offData.brand !== 'Bilinmiyor' ? offData.brand : result.brand,
        product: offData.product !== 'Bilinmiyor' ? offData.product : result.product,
        healthScore: offData.healthScore !== null ? offData.healthScore : result.healthScore,
        nutriScore: offData.nutriScore || result.nutriScore,
        novaLevel: offData.novaLevel || result.novaLevel,
        sugarLevel: offData.sugarLevel !== 'Bilinmiyor' ? offData.sugarLevel : result.sugarLevel,
        fatLevel: offData.fatLevel !== 'Bilinmiyor' ? offData.fatLevel : result.fatLevel,
        additiveLevel: offData.additiveLevel || result.additiveLevel,
        offVerified: true, 
        barcode: offData.barcode,
        dataSource: 'Open Food Facts'
      };
      
      // Alternatifler bul
      if (offData.categories && result.healthScore < 70) {
        result.alternatives = await getAlternatives(offData.categories.split(',')[0], result.healthScore);
      }
    } else {
      result.offVerified = false;
      result.dataSource = 'AI Analizi';
    }

    // Ensure healthScore is always a number
    if (result.healthScore === null || result.healthScore === undefined) {
      result.healthScore = 50; // Default score if unknown
    }

    // Clean nutriScore - only valid values
    const validNutri = ['A', 'B', 'C', 'D', 'E'];
    if (result.nutriScore && !validNutri.includes(String(result.nutriScore).toUpperCase())) {
      result.nutriScore = null;
    }

    // ===== HASSASIYET KONTROLLERI =====
    const sensitivities = userProfile.sensitivities || [];
    const sensitivityAlerts = [];
    
    // Helal kontrolü
    if (sensitivities.includes('helal')) {
      const ingredientText = (result.ingredients || []).map(i => i.name + ' ' + (i.code || '')).join(' ');
      const haramFound = checkHalalStatus(ingredientText, offData?.additives_tags || []);
      if (haramFound.length > 0) {
        sensitivityAlerts.push({
          type: 'helal',
          icon: '☪️',
          title: 'Helal Uyarısı',
          message: `Şüpheli içerikler: ${haramFound.join(', ')}`,
          severity: 'danger'
        });
      }
    }
    
    // Boykot kontrolü
    if (sensitivities.includes('boykot')) {
      const boycottCheck = checkBoycottStatus(result.brand, result.product);
      if (boycottCheck.isBoycott) {
        sensitivityAlerts.push({
          type: 'boykot',
          icon: '✊',
          title: 'Boykot Uyarısı',
          message: `Bu ürün/marka boykot listesinde`,
          severity: 'danger'
        });
      }
    }
    
    // Yerli üretim kontrolü
    if (sensitivities.includes('yerli')) {
      const turkishCheck = checkTurkishBrand(result.brand, result.product);
      if (turkishCheck.isTurkish) {
        sensitivityAlerts.push({
          type: 'yerli',
          icon: '🇹🇷',
          title: 'Yerli Üretim',
          message: `Bu ürün Türk markası`,
          severity: 'success'
        });
      } else {
        sensitivityAlerts.push({
          type: 'yerli',
          icon: '🌍',
          title: 'Yabancı Marka',
          message: `Bu ürün yerli üretim değil`,
          severity: 'warning'
        });
      }
    }
    
    // Vegan kontrolü
    if (sensitivities.includes('vegan')) {
      const nonVeganWords = ['et', 'süt', 'yumurta', 'bal', 'jelatin', 'peynir', 'tereyağ', 'krema', 'tavuk', 'balık', 'karides', 'meat', 'milk', 'egg', 'honey', 'cheese', 'butter', 'cream', 'chicken', 'fish'];
      const ingredientText = (result.ingredients || []).map(i => i.name).join(' ').toLowerCase();
      const found = nonVeganWords.filter(w => ingredientText.includes(w));
      if (found.length > 0) {
        sensitivityAlerts.push({
          type: 'vegan',
          icon: '🌱',
          title: 'Vegan Değil',
          message: `Hayvansal içerikler: ${found.join(', ')}`,
          severity: 'danger'
        });
      }
    }
    
    // Şekersiz kontrolü
    if (sensitivities.includes('sekersiz')) {
      if (result.sugarLevel === 'Yüksek' || result.sugarLevel === 'Orta') {
        sensitivityAlerts.push({
          type: 'sekersiz',
          icon: '🍬',
          title: 'Şeker İçeriyor',
          message: `Şeker seviyesi: ${result.sugarLevel}`,
          severity: result.sugarLevel === 'Yüksek' ? 'danger' : 'warning'
        });
      }
    }
    
    result.sensitivityAlerts = sensitivityAlerts;

    return res.status(200).json(result);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Analiz hatası' });
  }
}
