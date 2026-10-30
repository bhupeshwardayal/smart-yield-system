/**
 * Crop Yield & Price Prediction System — Frontend Client
 */

document.addEventListener('DOMContentLoaded', () => {
  // Config - automatically use current origin when served via HTTP/S, or default to localhost:10000 if opened directly from filesystem
  const API_BASE_URL = window.location.protocol.startsWith('http')
    ? window.location.origin
    : 'http://127.0.0.1:10000';

  // Safe fetch helper to permanently prevent JSON syntax errors when server returns HTML or 500 error
  async function fetchJsonSafe(url, options = {}) {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        console.warn(`Non-JSON response received from ${url}:`, text.substring(0, 150));
        return { ok: false, status: res.status, data: null, error: `Server returned non-JSON response (${res.status})` };
      }
      const data = await res.json();
      return { ok: res.ok, status: res.status, data: data, error: res.ok ? null : (data.error || 'Request failed') };
    } catch (err) {
      console.warn(`Network/JSON Error fetching ${url}:`, err);
      return { ok: false, status: 0, data: null, error: err.message };
    }
  }

  // DOM Elements - Navigation & Views
  const navItems = document.querySelectorAll('.nav-item');
  const tabViews = document.querySelectorAll('.tab-view');
  const viewTitle = document.getElementById('view-title');
  const viewDesc = document.getElementById('view-desc');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  // DOM Elements - Predictor
  const selectCrop = document.getElementById('select-crop');
  const selectState = document.getElementById('select-state');
  const selectDistrict = document.getElementById('select-district');
  const selectSeason = document.getElementById('select-season');
  const inputYear = document.getElementById('input-year');
  const inputArea = document.getElementById('input-area');
  const predictionForm = document.getElementById('prediction-form');
  const predictorError = document.getElementById('predictor-error');
  
  // Results Elements
  const resultsPlaceholder = document.getElementById('results-placeholder');
  const resultsContent = document.getElementById('results-content');
  const resYield = document.getElementById('res-yield');
  const resProduction = document.getElementById('res-production');
  const resAreaSummary = document.getElementById('res-area-summary');
  const resBenchmark = document.getElementById('res-benchmark');
  const resDiffSummary = document.getElementById('res-diff-summary');
  const resExplanation = document.getElementById('res-explanation');
  const availabilityBadgeContainer = document.getElementById('availability-badge-container');

  // Price Trend Elements
  const priceForm = document.getElementById('price-trend-form');
  const priceSelectCrop = document.getElementById('price-select-crop');
  const priceSelectDistrict = document.getElementById('price-select-district');
  let priceChartInstance = null;

  // Initial State
  let availableCrops = [];
  let availableDistricts = [];

  // ============================================================
  // 1. Navigation & Tab Switcher
  // ============================================================
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute('data-tab');

      navItems.forEach(nav => nav.classList.remove('active'));
      tabViews.forEach(view => view.classList.remove('active'));

      item.classList.add('active');
      document.getElementById(targetTab).classList.add('active');

      // Update Header Text based on current language
      if (targetTab === 'tab-predictor') {
        viewTitle.textContent = translations[currentLang].view_title_predictor;
        viewDesc.textContent = translations[currentLang].view_desc_predictor;
      } else if (targetTab === 'tab-recommender') {
        viewTitle.textContent = translations[currentLang].view_title_recommender;
        viewDesc.textContent = translations[currentLang].view_desc_recommender;
      } else if (targetTab === 'tab-analytics') {
        viewTitle.textContent = translations[currentLang].view_title_analytics;
        viewDesc.textContent = translations[currentLang].view_desc_analytics;
      }
    });
  });

  // ============================================================
  // 2. Health Check & Data Initialization
  // ============================================================
  async function initSystem() {
    const res = await fetchJsonSafe(`${API_BASE_URL}/api/health`);
    if (res.ok && res.data) {
      if (statusDot) {
        statusDot.style.backgroundColor = '#10b981';
        statusDot.style.boxShadow = '0 0 10px #10b981';
      }
      if (statusText) {
        statusText.textContent = `Online (${res.data.crops_loaded ? res.data.crops_loaded.length : 0} models ready)`;
      }
    } else {
      if (statusDot) {
        statusDot.style.backgroundColor = '#ef4444';
        statusDot.style.boxShadow = '0 0 10px #ef4444';
      }
      if (statusText) {
        statusText.textContent = 'Offline (Check backend app.py)';
      }
    }

    await loadCrops();
    await loadDistricts(selectState.value);
  }

  // Fetch Available Crops
  async function loadCrops() {
    const res = await fetchJsonSafe(`${API_BASE_URL}/api/crops`);
    if (res.ok && res.data && res.data.crops) {
      availableCrops = res.data.crops || [];

      // Update Dropdowns
      selectCrop.innerHTML = '';
      priceSelectCrop.innerHTML = '';

      if (availableCrops.length === 0) {
        selectCrop.innerHTML = '<option value="">No trained models found</option>';
        priceSelectCrop.innerHTML = '<option value="">No crops available</option>';
        return;
      }

      document.getElementById('pill-crops-count').textContent = availableCrops.length;

      availableCrops.forEach(crop => {
        const opt1 = document.createElement('option');
        opt1.value = crop;
        opt1.textContent = crop;
        selectCrop.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = crop;
        opt2.textContent = crop;
        priceSelectCrop.appendChild(opt2);
      });
    } else {
      console.warn('Using fallback default crops:', res.error);
      selectCrop.innerHTML = `
        <option value="Wheat">Wheat</option>
        <option value="Rice">Rice</option>
        <option value="Cottonlint">Cottonlint</option>
        <option value="Sugarcane">Sugarcane</option>
      `;
      priceSelectCrop.innerHTML = selectCrop.innerHTML;
    }
  }

  // DOM Elements - Recommender & Price Trends
  const recSelectState = document.getElementById('rec-select-state');
  const recSelectDistrict = document.getElementById('rec-select-district');
  const priceSelectState = document.getElementById('price-select-state');

  // Fetch Districts by State for any target select element
  async function loadDistrictsForSelect(state, targetSelectElement) {
    if (!targetSelectElement) return;
    const url = state ? `${API_BASE_URL}/api/districts?state=${encodeURIComponent(state)}` : `${API_BASE_URL}/api/districts`;
    const res = await fetchJsonSafe(url);
    
    targetSelectElement.innerHTML = '';

    let distList = [];
    if (res.ok && res.data && res.data.districts && res.data.districts.length > 0) {
      distList = res.data.districts.map(d => d.district_name || d);
    } else {
      distList = ['Ludhiana', 'Amritsar', 'Patiala', 'Jalandhar', 'Bhatinda', 'Abohar APMC'];
    }

    distList.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      targetSelectElement.appendChild(opt);
    });

    if (distList.length > 0) {
      targetSelectElement.value = distList[0];
    }
  }

  async function loadDistricts(state) {
    await loadDistrictsForSelect(state, selectDistrict);
    if (recSelectState && recSelectDistrict) await loadDistrictsForSelect(recSelectState.value, recSelectDistrict);
    if (priceSelectState && priceSelectDistrict) await loadDistrictsForSelect(priceSelectState ? priceSelectState.value : state, priceSelectDistrict);
  }

  // Listen to State Changes
  selectState.addEventListener('change', (e) => {
    loadDistrictsForSelect(e.target.value, selectDistrict);
  });

  if (recSelectState) {
    recSelectState.addEventListener('change', (e) => {
      loadDistrictsForSelect(e.target.value, recSelectDistrict);
    });
  }

  if (priceSelectState) {
    priceSelectState.addEventListener('change', (e) => {
      loadDistrictsForSelect(e.target.value, priceSelectDistrict);
    });
  }

  // Listen to Season Change to update climate field defaults
  selectSeason.addEventListener('change', (e) => {
    const season = e.target.value;
    const inputTemp = document.getElementById('input-temp');
    const inputRain = document.getElementById('input-rain');
    const inputHum = document.getElementById('input-hum');
    const inputHeat = document.getElementById('input-heat');

    if (season === 'Kharif') {
      if (inputTemp) inputTemp.value = 30.5;
      if (inputRain) inputRain.value = 850;
      if (inputHum) inputHum.value = 78;
      if (inputHeat) inputHeat.value = 6;
    } else if (season === 'Rabi') {
      if (inputTemp) inputTemp.value = 21.0;
      if (inputRain) inputRain.value = 120;
      if (inputHum) inputHum.value = 62;
      if (inputHeat) inputHeat.value = 1;
    } else {
      if (inputTemp) inputTemp.value = 26.0;
      if (inputRain) inputRain.value = 500;
      if (inputHum) inputHum.value = 65;
      if (inputHeat) inputHeat.value = 3;
    }
  });

  // ============================================================
  // 3. Handle Yield & Availability Prediction
  // ============================================================
  predictionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    predictorError.style.display = 'none';

    const inputTemp = document.getElementById('input-temp');
    const inputRain = document.getElementById('input-rain');
    const inputHum = document.getElementById('input-hum');
    const inputHeat = document.getElementById('input-heat');

    const payload = {
      crop: selectCrop.value || 'Wheat',
      state: selectState.value || 'Punjab',
      district: selectDistrict.value || 'Ludhiana',
      season: selectSeason.value || 'Rabi',
      crop_year: parseInt(inputYear.value) || 2025,
      area_hectare: parseFloat(inputArea.value) || 1000,
      temperature: inputTemp ? parseFloat(inputTemp.value) : 21.0,
      rainfall: inputRain ? parseFloat(inputRain.value) : 120.0,
      humidity: inputHum ? parseFloat(inputHum.value) : 62.0,
      extreme_heat_days: inputHeat ? parseInt(inputHeat.value) : 1
    };

    try {
      const btn = document.getElementById('btn-predict');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating ML Model...';
      }

      // Call /api/availability endpoint with safe fetch
      const res = await fetchJsonSafe(`${API_BASE_URL}/api/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Calculate Predicted Yield & Availability';
      }

      if (!res.ok || !res.data) {
        throw new Error(res.error || 'Prediction request failed');
      }

      displayResults(res.data, payload);

    } catch (err) {
      const btn = document.getElementById('btn-predict');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Calculate Predicted Yield & Availability';

      predictorError.textContent = err.message || 'Error executing prediction model.';
      predictorError.style.display = 'block';
    }
  });

  function displayResults(data, payload) {
    resultsPlaceholder.style.display = 'none';
    resultsContent.style.display = 'block';

    const yieldVal = data.predicted_yield_per_ha;
    const totalProd = (yieldVal * payload.area_hectare).toFixed(2);
    const histAvg = data.historical_avg_yield_per_ha;
    const pctDiff = data.percent_difference;
    const status = data.availability_status || 'Normal';

    resYield.textContent = yieldVal.toFixed(3);
    resProduction.textContent = `${Number(totalProd).toLocaleString()} Tons`;
    resAreaSummary.textContent = `for ${payload.area_hectare.toLocaleString()} Hectares`;

    if (histAvg !== null && histAvg !== undefined) {
      resBenchmark.textContent = `${histAvg.toFixed(3)} T/ha`;
      resDiffSummary.textContent = `${pctDiff >= 0 ? '+' : ''}${pctDiff}% vs historical avg`;
    } else {
      resBenchmark.textContent = 'N/A';
      resDiffSummary.textContent = 'No past records';
    }

    // Profit & ROI Calculation
    const cleanCropName = (payload.crop || '').replace(/\s*v2$/i, '').replace(/lint$/i, '').trim();
    const cropPrices = {
      'Wheat': 2125, 'Rice': 2040, 'Maize': 1960, 'Sugarcane': 350,
      'Cotton': 5500, 'Cottonlint': 5500, 'Groundnut': 5850, 'Gram': 5335, 'Arhar Tur': 7000,
      'Rapeseed & Mustard': 5450, 'Rapeseed &Mustard': 5450, 'Onion': 1800, 'Potato': 1200,
      'Moong': 7755, 'Urad': 6950, 'Jowar': 2970, 'Bajra': 2350
    };
    const priceQtl = cropPrices[cleanCropName] || cropPrices[payload.crop] || 2200;
    const grossRev = yieldVal * 10 * priceQtl * payload.area_hectare;
    const costPerHa = cleanCropName === 'Sugarcane' ? 75000 : cleanCropName === 'Potato' ? 70000 : cleanCropName === 'Onion' ? 60000 : 38000;
    const totalCost = costPerHa * payload.area_hectare;
    const netProfit = grossRev - totalCost;
    const roiPct = ((netProfit / totalCost) * 100).toFixed(1);

    const resNetProfit = document.getElementById('res-net-profit');
    const resRoi = document.getElementById('res-roi');
    if (resNetProfit) resNetProfit.textContent = `₹${Math.round(netProfit).toLocaleString()}`;
    if (resRoi) resRoi.textContent = `${roiPct}%`;

    // Availability Badge
    let badgeClass = 'badge-normal';
    let badgeIcon = 'fa-circle-check';
    if (status === 'Surplus') {
      badgeClass = 'badge-surplus';
      badgeIcon = 'fa-arrow-trend-up';
    } else if (status === 'Shortage') {
      badgeClass = 'badge-shortage';
      badgeIcon = 'fa-triangle-exclamation';
    }

    availabilityBadgeContainer.innerHTML = `
      <span class="availability-badge ${badgeClass}">
        <i class="fa-solid ${badgeIcon}"></i>
        ${status}
      </span>
    `;

    resExplanation.textContent = `Model forecasts a yield of ${yieldVal.toFixed(3)} T/ha in ${payload.district}, generating an estimated gross revenue of ₹${Math.round(grossRev).toLocaleString()} and net profit of ₹${Math.round(netProfit).toLocaleString()}.`;
  }

  // ============================================================
  // 3.5 AI Crop Recommender Logic
  // ============================================================
  const recommenderForm = document.getElementById('recommender-form');
  const recommenderResults = document.getElementById('recommender-results');

  if (recommenderForm) {
    recommenderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const state = (document.getElementById('rec-select-state')?.value) || 'Punjab';
      const district = (document.getElementById('rec-select-district')?.value) || 'Ludhiana';
      const season = (document.getElementById('rec-select-season')?.value) || 'Rabi';
      const btn = document.getElementById('btn-recommend');

      try {
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Evaluating 15 Models...';
        }

        let recommendationsList = [];
        try {
          const res = await fetchJsonSafe(`${API_BASE_URL}/api/recommend-crops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, district, season, area_hectare: 1000 })
          });

          if (res.ok && res.data && res.data.top_recommendations && res.data.top_recommendations.length > 0) {
            recommendationsList = res.data.top_recommendations;
          }
        } catch (err) {
          console.warn('API error, using fallback recommendation ranking:', err);
        }

        // Fallback recommendations if empty
        if (recommendationsList.length === 0) {
          if (season === 'Rabi') {
            recommendationsList = [
              { crop: 'Wheat', predicted_yield_per_ha: 3.25, estimated_price_per_qtl: 2125, estimated_net_profit_rs: 27000000, roi_percent: 64.3 },
              { crop: 'Potato', predicted_yield_per_ha: 22.50, estimated_price_per_qtl: 1200, estimated_net_profit_rs: 20000000, roi_percent: 57.1 },
              { crop: 'Rapeseed &Mustard', predicted_yield_per_ha: 1.85, estimated_price_per_qtl: 5450, estimated_net_profit_rs: 18500000, roi_percent: 52.8 }
            ];
          } else {
            recommendationsList = [
              { crop: 'Rice', predicted_yield_per_ha: 3.80, estimated_price_per_qtl: 2040, estimated_net_profit_rs: 29500000, roi_percent: 68.2 },
              { crop: 'Maize', predicted_yield_per_ha: 4.10, estimated_price_per_qtl: 1960, estimated_net_profit_rs: 25300000, roi_percent: 61.4 },
              { crop: 'Sugarcane', predicted_yield_per_ha: 78.00, estimated_price_per_qtl: 350, estimated_net_profit_rs: 19800000, roi_percent: 55.0 }
            ];
          }
        }

        // Render ranked crop cards
        recommenderResults.style.display = 'grid';
        recommenderResults.innerHTML = '';

        const medalIcons = ['🥇', '🥈', '🥉'];
        recommendationsList.slice(0, 3).forEach((rec, idx) => {
          const card = document.createElement('div');
          card.className = 'card';
          card.style.background = idx === 0 
            ? 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(11,15,25,0.85))'
            : 'rgba(18,26,43,0.75)';
          card.style.border = idx === 0 ? '2px solid #10b981' : '1px solid var(--bg-card-border)';
          
          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span class="availability-badge ${idx === 0 ? 'badge-surplus' : 'badge-normal'}" style="font-size: 0.9rem;">
                ${medalIcons[idx] || '#'} Rank #${idx + 1}
              </span>
              <span style="font-size: 1.25rem; font-weight: 700; color: var(--primary-light);">${rec.roi_percent}% ROI</span>
            </div>
            <h3 style="font-size: 1.5rem; margin-bottom: 0.2rem; color: #ffffff;">${rec.crop}</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Est. Yield: <strong style="color: #fff;">${rec.predicted_yield_per_ha} T/ha</strong></p>
            
            <div style="border-top: 1px solid var(--bg-card-border); padding-top: 0.75rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.3rem;">
                <span style="color: var(--text-muted);">Est. Price:</span>
                <span style="color: var(--text-main); font-weight: 600;">₹${rec.estimated_price_per_qtl}/Qtl</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.95rem; font-weight: 700;">
                <span style="color: var(--text-muted);">Est. Net Profit:</span>
                <span style="color: var(--primary-light);">₹${Math.round(rec.estimated_net_profit_rs).toLocaleString()}</span>
              </div>
            </div>
          `;
          recommenderResults.appendChild(card);
        });
      } catch (err) {
        console.warn('Recommender error:', err);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-lightbulb"></i> Rank Best Crops';
        }
      }
    });
  }

  // ============================================================
  // Multilingual Support (Hindi / English)
  // ============================================================
  let currentLang = 'en';
  const translations = {
    hi: {
      brand_subtitle: 'स्मार्ट उपज और मूल्य प्रणाली',
      nav_predictor: 'फसल उपज अनुमानक',
      nav_recommender: 'स्मार्ट फसल सलाहकार',
      nav_analytics: 'बाजार मूल्य रुझान',
      nav_models: 'मॉडल अवलोकन',
      status_title: 'बैकएंड एपीआई',
      
      view_title_predictor: 'फसल उपज और उपलब्धता पूर्वानुमान',
      view_desc_predictor: 'मशीन लर्निंग मॉडल का उपयोग करके फसल उत्पादन और आपूर्ति उपलब्धता का अनुमान लगाएं।',
      view_title_recommender: 'स्मार्ट फसल सलाहकार',
      view_desc_recommender: 'हमारा एआई सिस्टम आपकी भूमि के लिए शीर्ष 3 सबसे लाभदायक फसलों की सिफारिश करता है।',
      view_title_analytics: 'ऐतिहासिक मंडी मूल्य विश्लेषण',
      view_desc_analytics: 'विभिन्न फसलों और मंडियों के लिए न्यूनतम, अधिकतम और औसत कीमतों का विश्लेषण करें।',
      view_title_models: 'प्रशिक्षित मॉडल और प्रदर्शन अवलोकन',
      view_desc_models: 'प्रत्येक फसल के लिए प्रशिक्षित मशीन लर्निंग एल्गोरिदम और सटीकता देखें।',

      btn_export_pdf: 'पीडीएफ डाउनलोड',
      btn_export_csv: 'पीडीएफ डाउनलोड',
      stat_crops_active: 'सक्रिय फसलें:',
      stat_dataset_rows: 'डेटासेट पंक्तियाँ:',

      title_prediction_inputs: 'पूर्वानुमान इनपुट',
      label_select_crop: 'फसल चुनें',
      label_state: 'राज्य',
      label_district: 'जिला / स्थान',
      label_season: 'मौसम',
      label_crop_year: 'फसल वर्ष',
      label_cultivation_area: 'खेती क्षेत्र (हेक्टेयर)',
      title_climate_params: 'जलवायु और मौसम पैरामीटर',
      label_avg_temp: 'औसत तापमान (°C)',
      label_rainfall: 'वर्षा (मिमी)',
      label_humidity: 'आर्द्रता (%)',
      label_heat_days: 'अत्यधिक गर्मी के दिन',
      btn_calculate_yield: 'अनुमानित उपज और उपलब्धता की गणना करें',

      title_prediction_results: 'पूर्वानुमान परिणाम',
      results_placeholder_text: 'बाईं ओर पैरामीटर भरें और एमएल उपज पूर्वानुमान और बाजार स्थिति देखने के लिए गणना करें पर क्लिक करें।',
      unit_predicted_yield: 'अनुमानित उपज (टन / हेक्टेयर)',
      label_total_est_production: 'कुल अनुमानित उत्पादन',
      label_historical_benchmark: 'ऐतिहासिक बेंचमार्क',
      label_vs_district_avg: 'जिला औसत की तुलना में',
      label_farmer_net_profit: 'किसान का अनुमानित शुद्ध लाभ',
      label_expected_roi: 'अनुमानित लाभ प्रतिशत (ROI)',
      text_availability_explanation: 'उपलब्धता स्थिति का अनुमान जिला औसत के साथ तुलना करके लगाया जाता है।',

      title_smart_advisor: 'स्मार्ट फसल सलाहकार',
      desc_smart_advisor: 'अपना स्थान, मौसम और क्षेत्र चुनें। हमारा एआई सिस्टम आपकी भूमि के लिए शीर्ष 3 सबसे लाभदायक फसलों की सिफारिश करता है।',
      btn_rank_best_crops: 'सर्वश्रेष्ठ फसलों की रैंकिंग करें',

      title_price_analytics: 'ऐतिहासिक मंडी मूल्य विश्लेषण',
      label_price_crop: 'फसल',
      label_price_market: 'मंडी / जिला',
      label_ai_forecast: 'एआई भविष्य का अनुमान',
      btn_render_forecast: 'पूर्वानुमान और चार्ट देखें',
      label_current_mandi_price: 'वर्तमान मंडी मूल्य',
      unit_rs_quintal: 'रु. / क्विंटल (नवीनतम)',
      label_forecasted_price: 'अनुमानित मूल्य',
      label_expected_price_trend: 'अनुमानित मूल्य रुझान',

      title_models_overview: 'प्रशिक्षित मॉडल और प्रदर्शन अवलोकन',
      title_ml_architecture: 'एमएल आर्किटेक्चर रणनीति',
      desc_ml_architecture: 'एक एकल वैश्विक मॉडल के बजाय, प्रत्येक फसल के लिए व्यक्तिगत मशीन लर्निंग मॉडल प्रशिक्षित किए जाते हैं।',
      title_data_cleaning: 'डेटा सफाई और आईक्यूआर फ़िल्टरिंग',
      desc_data_cleaning: '3.0x इंटरक्वार्टाइल रेंज (IQR) cut-off का उपयोग करके चरम सांख्यिकीय आउटलेयर को हटा दिया जाता है।'
    },
    en: {
      brand_subtitle: 'Smart Yield & Price System',
      nav_predictor: 'Yield Predictor',
      nav_recommender: 'Smart Crop Advisor',
      nav_analytics: 'Price Trends',
      nav_models: 'Model Overview',
      status_title: 'Backend API',

      view_title_predictor: 'Crop Yield & Availability Predictor',
      view_desc_predictor: 'Predict crop production (tons/ha) and check regional supply availability using trained ML models.',
      view_title_recommender: 'Smart Crop Advisor',
      view_desc_recommender: 'Our AI system evaluates all crop models simultaneously to recommend the top 3 highest yielding crops.',
      view_title_analytics: 'Historical Market Price Analytics',
      view_desc_analytics: 'Explore historical Mandi trade prices (Min, Max, Modal) for specified crops and markets.',
      view_title_models: 'Trained Models & Performance Overview',
      view_desc_models: 'Review R² accuracy scores, algorithm selections, and training parameters per crop.',

      btn_export_pdf: 'Export PDF',
      btn_export_csv: 'Export PDF',
      stat_crops_active: 'Crops Active:',
      stat_dataset_rows: 'Dataset Rows:',

      title_prediction_inputs: 'Prediction Inputs',
      label_select_crop: 'Select Crop',
      label_state: 'State',
      label_district: 'District / Location',
      label_season: 'Season',
      label_crop_year: 'Crop Year',
      label_cultivation_area: 'Cultivation Area (Hectares)',
      title_climate_params: 'Climate & Weather Parameters',
      label_avg_temp: 'Avg Temp (°C)',
      label_rainfall: 'Rainfall (mm)',
      label_humidity: 'Humidity (%)',
      label_heat_days: 'Extreme Heat Days',
      btn_calculate_yield: 'Calculate Predicted Yield & Availability',

      title_prediction_results: 'Prediction Results',
      results_placeholder_text: 'Fill in the parameters on the left and click Calculate to view ML yield forecasts and market status.',
      unit_predicted_yield: 'Predicted Yield (Tons / Hectare)',
      label_total_est_production: 'Total Est. Production',
      label_historical_benchmark: 'Historical Benchmark',
      label_vs_district_avg: 'vs. district average',
      label_farmer_net_profit: 'Estimated Farmer Net Profit',
      label_expected_roi: 'Expected ROI',
      text_availability_explanation: 'Availability status is computed by comparing forecasted yield against historical district averages.',

      title_smart_advisor: 'Smart Crop Advisor',
      desc_smart_advisor: 'Select your location, season, and cultivation area. Our AI system evaluates all 15 crop models simultaneously to recommend the top 3 highest yielding crops.',
      btn_rank_best_crops: 'Rank Best Crops',

      title_price_analytics: 'Historical Market Price Analytics',
      label_price_crop: 'Crop',
      label_price_market: 'Market / District',
      label_ai_forecast: 'AI Forecast Ahead',
      btn_render_forecast: 'Render Forecast & Chart',
      label_current_mandi_price: 'Current Mandi Price',
      unit_rs_quintal: 'Rs./Quintal (latest)',
      label_forecasted_price: 'Forecasted Price',
      label_expected_price_trend: 'Expected Price Trend',

      title_models_overview: 'Trained Models & Performance Overview',
      title_ml_architecture: 'ML Architecture Strategy',
      desc_ml_architecture: 'Instead of a single global model, individual machine learning models are trained per crop.',
      title_data_cleaning: 'Data Cleaning & IQR Filtering',
      desc_data_cleaning: 'Extreme statistical outliers are removed per crop dataset using a 3.0x Interquartile Range (IQR) cutoff.'
    }
  };

  function updatePageLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[currentLang] && translations[currentLang][key]) {
        el.textContent = translations[currentLang][key];
      }
    });

    // Also update active tab header title and description
    const activeTab = document.querySelector('.nav-item.active');
    if (activeTab) {
      const targetTab = activeTab.getAttribute('data-tab');
      if (targetTab === 'tab-predictor') {
        viewTitle.textContent = translations[currentLang].view_title_predictor;
        viewDesc.textContent = translations[currentLang].view_desc_predictor;
      } else if (targetTab === 'tab-recommender') {
        viewTitle.textContent = translations[currentLang].view_title_recommender;
        viewDesc.textContent = translations[currentLang].view_desc_recommender;
      } else if (targetTab === 'tab-analytics') {
        viewTitle.textContent = translations[currentLang].view_title_analytics;
        viewDesc.textContent = translations[currentLang].view_desc_analytics;
      } else if (targetTab === 'tab-models') {
        viewTitle.textContent = translations[currentLang].view_title_models;
        viewDesc.textContent = translations[currentLang].view_desc_models;
      }
    }
  }

  const btnLangToggle = document.getElementById('btn-lang-toggle');
  const langLabel = document.getElementById('lang-label');

  if (btnLangToggle) {
    btnLangToggle.addEventListener('click', () => {
      currentLang = currentLang === 'en' ? 'hi' : 'en';

      if (currentLang === 'hi') {
        btnLangToggle.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        btnLangToggle.style.color = '#ffffff';
        btnLangToggle.style.boxShadow = '0 0 15px rgba(16,185,129,0.5)';
        btnLangToggle.style.borderColor = '#34d399';
        if (langLabel) langLabel.textContent = 'English';
      } else {
        btnLangToggle.style.background = 'rgba(255,255,255,0.08)';
        btnLangToggle.style.color = 'var(--text-main)';
        btnLangToggle.style.boxShadow = 'none';
        btnLangToggle.style.borderColor = 'var(--bg-card-border)';
        if (langLabel) langLabel.textContent = 'हिन्दी';
      }

      updatePageLanguage();
    });
  }

  const CROP_TRANSLATIONS_HI = {
    'Wheat': 'गेहूं (Wheat)', 'Rice': 'धान / चावल (Rice)', 'Cotton': 'कपास (Cotton)',
    'Cottonlint': 'कपास (Cotton)', 'Sugarcane': 'गन्ना (Sugarcane)', 'Maize': 'मक्का (Maize)',
    'Gram': 'चना (Gram)', 'Potato': 'आलू (Potato)', 'Tomato': 'टमाटर (Tomato)',
    'Onion': 'प्याज (Onion)', 'Bhindi': 'भिंडी (Bhindi)', 'Soybean': 'सोयाबीन (Soybean)',
    'Groundnut': 'मूंगफली (Groundnut)', 'Bajra': 'बाजरा (Bajra)', 'Jowar': 'ज्वार (Jowar)',
    'Moong': 'मूंग (Moong)', 'Urad': 'उड़द (Urad)', 'Mustard': 'सरसों (Mustard)',
    'Rapeseed & Mustard': 'सरसों (Mustard)', 'Barley': 'जौ (Barley)', 'Banana': 'केला (Banana)',
    'Apple': 'सेब (Apple)', 'Mango': 'आम (Mango)', 'Orange': 'संतरा (Orange)',
    'Grapes': 'अंगूर (Grapes)', 'Papaya': 'पपीता (Papaya)', 'Garlic': 'लहसुन (Garlic)',
    'Ginger': 'अदरक (Ginger)', 'Turmeric': 'हल्दी (Turmeric)', 'Chilli': 'मिर्च (Chilli)'
  };

  const SEASON_TRANSLATIONS_HI = {
    'Rabi': 'रबी (Rabi)',
    'Kharif': 'खरीफ (Kharif)',
    'Whole Year': 'संपूर्ण वर्ष (Whole Year)',
    'Summer': 'जायद / ग्रीष्मकालीन (Summer)',
    'Autumn': 'शरद (Autumn)',
    'Winter': 'शीतकालीन (Winter)'
  };

  // Direct Client-Side PDF Generation Engine (Bilingual Hindi/English, 100% offline)
  async function generateClientPdf(data, lang = 'en') {
    const isHi = (lang === 'hi');
    const cropDisplay = (isHi && CROP_TRANSLATIONS_HI[data.crop]) ? CROP_TRANSLATIONS_HI[data.crop] : data.crop;
    const seasonDisplay = (isHi && SEASON_TRANSLATIONS_HI[data.season]) ? SEASON_TRANSLATIONS_HI[data.season] : data.season;

    const priceQtl = data.price_per_qtl || 2125;
    const grossRev = data.gross_revenue_rs || (data.predicted_yield_per_ha * 10 * priceQtl * data.area_hectare);
    const totalCost = data.total_cost_rs || (40000 * data.area_hectare);
    const netProfit = data.net_profit_rs || (grossRev - totalCost);
    const roi = totalCost > 0 ? ((netProfit / totalCost) * 100).toFixed(1) : '0.0';

    let statusDisplay = data.availability_status.toUpperCase();
    let statusBg = '#ecfdf5';
    let statusBorder = '#10b981';
    let statusTextCol = '#047857';

    if (data.availability_status.toLowerCase() === 'shortage') {
      statusDisplay = isHi ? 'कमी (SHORTAGE)' : 'SHORTAGE';
      statusBg = '#fef2f2';
      statusBorder = '#ef4444';
      statusTextCol = '#b91c1c';
    } else if (data.availability_status.toLowerCase() === 'surplus') {
      statusDisplay = isHi ? 'अधिशेष (SURPLUS)' : 'SURPLUS';
      statusBg = '#ecfdf5';
      statusBorder = '#10b981';
      statusTextCol = '#047857';
    } else {
      statusDisplay = isHi ? 'सामान्य (NORMAL)' : 'NORMAL';
      statusBg = '#fffbeb';
      statusBorder = '#f59e0b';
      statusTextCol = '#b45309';
    }

    let advisoryText = '';
    const st = data.availability_status.toLowerCase();
    if (st === 'shortage') {
      advisoryText = isHi
        ? '<b>बाजार चेतावनी:</b> क्षेत्रीय उपज ऐतिहासिक औसत से कम रहने का अनुमान है। सीमित आपूर्ति के कारण स्थानीय मंडी की कीमतें बढ़ने की संभावना है। किसानों को सलाह दी जाती है कि वे फूल और दाना भरने के चरणों में सिंचाई प्रबंधन बनाए रखें, अनुशंसित सूक्ष्म पोषक तत्वों का उपयोग करें और बेहतर लाभ के लिए चरणबद्ध तरीके से उपज बेचें।'
        : '<b>Market Warning:</b> Regional yield is projected below historical averages. Local mandi prices are expected to firm up due to tighter supply. Farmers are advised to maintain strict irrigation scheduling, apply micronutrients, and stagger market releases to capture peak prices.';
    } else if (st === 'surplus') {
      advisoryText = isHi
        ? '<b>बाजार अवसर:</b> ऐतिहासिक बेंचमार्क से अधिक मजबूत उत्पादन का अनुमान है। आवक अधिक होने पर कटाई के समय कीमतों में अस्थायी नरमी आ सकती है। संकटपूर्ण बिक्री से बचने के लिए किसानों को प्रमाणित गोदाम भंडारण (WDRA सुविधाएं) या ई-एनडब्ल्यूआर का उपयोग करने की सलाह दी जाती है।'
        : '<b>Market Opportunity:</b> Strong production volume is forecast above regional benchmarks. Heavy mandi arrivals may lead to temporary price softening. Farmers are recommended to utilize WDRA-certified warehouses or e-NWR pledges to avoid distress sales.';
    } else {
      advisoryText = isHi
        ? '<b>स्थिर दृष्टिकोण:</b> फसल उत्पादन क्षेत्रीय सामान्य बेंचमार्क के अनुरूप है। नियमित कृषि पद्धतियों और समय पर कटाई की सिफारिश की जाती है। साप्ताहिक एपीएमसी मंडी दरों पर नजर रखें और यदि खुले बाजार की दरें कम होती हैं तो सरकारी एमएसपी खरीद का लाभ उठाएं।'
        : '<b>Stable Outlook:</b> Crop yield aligns with regional benchmarks. Maintain standard agronomic practices and monitor APMC mandi prices. Leverage government procurement at MSP if open market trade dips below benchmark.';
    }

    const dateStr = new Date().toLocaleString(isHi ? 'hi-IN' : 'en-IN', { dateStyle: 'long', timeStyle: 'short' });

    // Method 1: High-DPI HTML-to-PDF rendering (Native Devanagari Hindi & English)
    if (window.html2pdf) {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'fixed';
      wrapper.style.top = '0';
      wrapper.style.left = '0';
      wrapper.style.width = '0';
      wrapper.style.height = '0';
      wrapper.style.overflow = 'hidden';
      wrapper.style.zIndex = '-9999';

      const container = document.createElement('div');
      container.style.width = '790px';
      container.style.background = '#ffffff';
      container.style.color = '#1f2937';
      container.style.padding = '24px 28px';
      container.style.fontFamily = isHi
        ? '"Nirmala UI", "Mangal", "Segoe UI", sans-serif'
        : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Nirmala UI", sans-serif';
      container.style.boxSizing = 'border-box';

      container.innerHTML = `
        <div style="border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 14px;">
          <h1 style="font-size: 18px; font-weight: 700; color: #065f46; margin: 0 0 5px 0; line-height: 1.35; ${isHi ? 'text-transform: none; letter-spacing: normal;' : 'text-transform: uppercase; letter-spacing: 0.5px;'}">
            ${isHi ? 'एग्रीप्रेडिक्ट — स्मार्ट फसल उपज एवं बाजार मूल्य पूर्वानुमान' : 'AGRIPREDICT — SMART CROP YIELD & MARKET FORECASTING'}
          </h1>
          <div style="font-size: 11px; color: #047857; font-weight: 600; margin-bottom: 4px;">
            ${isHi ? 'कृषि निर्णय समर्थन एवं व्यापक पूर्वानुमान रिपोर्ट' : 'Agricultural Decision Support & Comprehensive Prediction Report'}
          </div>
          <div style="font-size: 9.5px; color: #6b7280;">
            ${isHi ? 'रिपोर्ट निर्माण तिथि' : 'Generated On'}: ${dateStr} &nbsp;|&nbsp; ${isHi ? 'प्रणाली: स्मार्ट कृषि उपज एवं मूल्य विश्लेषक' : 'System: Smart Crop Yield & Price System'}
          </div>
        </div>

        <div style="margin-bottom: 13px;">
          <div style="font-size: 11.5px; font-weight: 700; color: #065f46; margin-bottom: 5px;">
            ${isHi ? '1. कृषि एवं क्षेत्रीय जानकारी' : '1. Farm & Regional Information'}
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
            <tr>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700; width: 22%;">${isHi ? 'लक्षित फसल' : 'Target Crop'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; width: 28%; font-weight: 600; color: #065f46;">${cropDisplay}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700; width: 22%;">${isHi ? 'फसल मौसम' : 'Cropping Season'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; width: 28%;">${seasonDisplay}</td>
            </tr>
            <tr>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'राज्य / केंद्र शासित प्रदेश' : 'State / UT'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0;">${data.state}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'जिला / मंडी' : 'District / Market'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0;">${data.district}</td>
            </tr>
            <tr>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'फसल वर्ष' : 'Harvest Year'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0;">${data.crop_year}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'खेती क्षेत्र' : 'Farm Cultivation Area'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0;">${Number(data.area_hectare).toLocaleString()} ${isHi ? 'हेक्टेयर' : 'Hectares'} (~${(data.area_hectare * 2.471).toLocaleString(undefined, {maximumFractionDigits:1})} ${isHi ? 'एकड़' : 'Acres'})</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 13px;">
          <div style="font-size: 11.5px; font-weight: 700; color: #065f46; margin-bottom: 5px;">
            ${isHi ? '2. कृषि-जलवायु एवं मौसमी पैरामीटर' : '2. Agro-Climatic & Environmental Parameters'}
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
            <tr>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700; width: 22%;">${isHi ? 'औसत तापमान' : 'Average Temperature'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; width: 28%;">${data.temperature} °C</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700; width: 22%;">${isHi ? 'कुल मौसमी वर्षा' : 'Total Seasonal Rainfall'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; width: 28%;">${data.rainfall} mm</td>
            </tr>
            <tr>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'सापेक्ष आर्द्रता' : 'Relative Humidity'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0;">${data.humidity} %</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'अत्यधिक गर्मी के दिन' : 'Extreme Heat Days (>35°C)'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0;">${data.extreme_heat_days} ${isHi ? 'दिन' : 'Days'}</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 13px;">
          <div style="font-size: 11.5px; font-weight: 700; color: #065f46; margin-bottom: 5px;">
            ${isHi ? '3. मशीन लर्निंग उपज एवं आपूर्ति पूर्वानुमान' : '3. Machine Learning Yield & Supply Forecast'}
          </div>
          <div style="display: table; width: 100%; table-layout: fixed;">
            <div style="display: table-cell; padding-right: 6px; width: 25%;">
              <div style="border: 1px solid #10b981; background: #ecfdf5; border-radius: 6px; padding: 8px 6px; text-align: center;">
                <div style="font-size: 8.5px; font-weight: 700; color: #047857; ${isHi ? 'text-transform: none;' : 'text-transform: uppercase;'}">${isHi ? 'अनुमानित उपज' : 'PREDICTED YIELD'}</div>
                <div style="font-size: 17px; font-weight: 800; color: #065f46; margin: 3px 0 1px 0;">${Number(data.predicted_yield_per_ha).toFixed(3)}</div>
                <div style="font-size: 8.5px; color: #047857;">${isHi ? 'टन / हेक्टेयर' : 'Tons / Hectare'}</div>
              </div>
            </div>
            <div style="display: table-cell; padding-right: 6px; width: 25%;">
              <div style="border: 1px solid #10b981; background: #ecfdf5; border-radius: 6px; padding: 8px 6px; text-align: center;">
                <div style="font-size: 8.5px; font-weight: 700; color: #047857; ${isHi ? 'text-transform: none;' : 'text-transform: uppercase;'}">${isHi ? 'कुल उत्पादन' : 'TOTAL PRODUCTION'}</div>
                <div style="font-size: 17px; font-weight: 800; color: #065f46; margin: 3px 0 1px 0;">${Number(data.predicted_production_tons).toLocaleString()}</div>
                <div style="font-size: 8.5px; color: #047857;">${isHi ? 'टन' : 'Tons'}</div>
              </div>
            </div>
            <div style="display: table-cell; padding-right: 6px; width: 25%;">
              <div style="border: 1px solid #10b981; background: #ecfdf5; border-radius: 6px; padding: 8px 6px; text-align: center;">
                <div style="font-size: 8.5px; font-weight: 700; color: #047857; ${isHi ? 'text-transform: none;' : 'text-transform: uppercase;'}">${isHi ? 'जिला बेंचमार्क' : 'DISTRICT BENCHMARK'}</div>
                <div style="font-size: 17px; font-weight: 800; color: #065f46; margin: 3px 0 1px 0;">${data.historical_avg_yield_per_ha !== null ? Number(data.historical_avg_yield_per_ha).toFixed(3) : 'N/A'}</div>
                <div style="font-size: 8.5px; color: #047857;">${isHi ? 'टन / हेक्टेयर' : 'Tons / Hectare'}</div>
              </div>
            </div>
            <div style="display: table-cell; width: 25%;">
              <div style="border: 1px solid ${statusBorder}; background: ${statusBg}; border-radius: 6px; padding: 8px 6px; text-align: center;">
                <div style="font-size: 8.5px; font-weight: 700; color: ${statusTextCol}; ${isHi ? 'text-transform: none;' : 'text-transform: uppercase;'}">${isHi ? 'क्षेत्रीय आपूर्ति स्थिति' : 'AVAILABILITY'}</div>
                <div style="font-size: 15px; font-weight: 800; color: ${statusTextCol}; margin: 4px 0 1px 0;">${statusDisplay}</div>
                <div style="font-size: 8.5px; color: ${statusTextCol}; font-weight: 600;">${data.percent_difference > 0 ? '+' : ''}${Number(data.percent_difference).toFixed(1)}% vs. avg</div>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 13px;">
          <div style="font-size: 11.5px; font-weight: 700; color: #065f46; margin-bottom: 5px;">
            ${isHi ? '4. वित्तीय एवं बाजार लाभप्रदता विश्लेषण' : '4. Financial & Market Profitability Analysis'}
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
            <tr>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700; width: 25%;">${isHi ? 'अनुमानित मंडी / एमएसपी मूल्य' : 'Estimated Mandi / MSP Price'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; width: 25%;">Rs. ${Number(priceQtl).toLocaleString()} / ${isHi ? 'क्विंटल' : 'Quintal'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700; width: 25%;">${isHi ? 'कुल अनुमानित खेती लागत' : 'Total Cultivation Cost'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; width: 25%;">Rs. ${Number(totalCost).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'अनुमानित सकल राजस्व' : 'Estimated Gross Revenue'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0;">Rs. ${Number(grossRev).toLocaleString()}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'अनुमानित शुद्ध लाभ' : 'Estimated Net Profit'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; font-weight: 800; color: #065f46;">Rs. ${Number(netProfit).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'निवेश पर प्रतिफल (ROI)' : 'Return on Investment (ROI)'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; font-weight: 700; color: #b45309;">${roi}%</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 700;">${isHi ? 'प्रति हेक्टेयर शुद्ध लाभ' : 'Net Profit per Hectare'}</td>
              <td style="padding: 5px 9px; border: 1px solid #e2e8f0; font-weight: 700;">Rs. ${(netProfit / data.area_hectare).toLocaleString(undefined, {maximumFractionDigits:0})} / ha</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 15px;">
          <div style="font-size: 11.5px; font-weight: 700; color: #065f46; margin-bottom: 5px;">
            ${isHi ? '5. एआई कृषि परामर्श एवं परिचालन मार्गदर्शन' : '5. AI Farm Advisory & Operational Guidance'}
          </div>
          <div style="border: 1px solid #86efac; background: #f0fdf4; border-radius: 6px; padding: 9px 12px; font-size: 10px; line-height: 1.5; color: #1f2937;">
            ${advisoryText}
          </div>
        </div>

        <div style="border-top: 1px solid #cbd5e1; padding-top: 7px; text-align: center; font-size: 9px; color: #6b7280;">
          ${isHi ? 'एग्रीप्रेडिक्ट — स्मार्ट कृषि निर्णय समर्थन प्रणाली' : 'AgriPredict — Agricultural Intelligence & Decision Support System'}
        </div>
      `;

      wrapper.appendChild(container);
      document.body.appendChild(wrapper);
      try {
        const opt = {
          margin: [8, 8, 8, 8],
          filename: `${data.crop}_Prediction_Report_${lang.toUpperCase()}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: false, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        await window.html2pdf().set(opt).from(container).save();
        return;
      } finally {
        if (wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
      }
    }

    // Method 2: jsPDF Fallback
    if (window.jspdf && window.jspdf.jsPDF) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(6, 95, 70);
      doc.text(isHi ? 'AGRIPREDICT — CROP REPORT' : 'AGRIPREDICT — SMART CROP YIELD & MARKET FORECASTING', 14, 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(4, 120, 87);
      doc.text(isHi ? 'Agricultural Decision Support Report' : 'Agricultural Decision Support & Comprehensive Prediction Report', 14, 23);
      doc.setTextColor(107, 114, 128);
      doc.text(`Generated: ${dateStr}`, 14, 28);
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.6);
      doc.line(14, 31, 196, 31);

      doc.autoTable({
        startY: 35,
        head: [['Farm Parameter', 'Value', 'Metric', 'Value']],
        body: [
          ['Target Crop', data.crop, 'Cropping Season', data.season],
          ['State', data.state, 'District', data.district],
          ['Predicted Yield', `${Number(data.predicted_yield_per_ha).toFixed(3)} T/ha`, 'Availability Status', data.availability_status.toUpperCase()],
          ['Total Production', `${Number(data.predicted_production_tons).toLocaleString()} Tons`, 'Net Profit', `Rs. ${Number(netProfit).toLocaleString()}`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [6, 95, 70], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 8.5, textColor: [31, 41, 55] },
        margin: { left: 14, right: 14 }
      });

      const finalY = doc.lastAutoTable.finalY + 8;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.line(14, finalY, 196, finalY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(107, 114, 128);
      doc.text('AgriPredict — Agricultural Intelligence & Decision Support System', 14, finalY + 4);

      doc.save(`${data.crop}_Prediction_Report.pdf`);
      return;
    }

    throw new Error('No PDF generator available');
  }

  // Export PDF Handler
  const btnExportPdf = document.getElementById('btn-export-pdf') || document.getElementById('btn-export-csv');
  if (btnExportPdf) {
    btnExportPdf.addEventListener('click', async () => {
      const crop = selectCrop.value || 'Crop';
      const yieldVal = parseFloat(resYield?.textContent) || 0;
      const prodText = resProduction?.textContent || '0';
      const netProfitEl = document.getElementById('res-net-profit');
      const netProfit = netProfitEl ? parseFloat(netProfitEl.textContent.replace(/[^0-9.-]+/g, '')) || 0 : 0;
      const histBenchmarkEl = document.getElementById('res-benchmark');
      const histBenchmark = histBenchmarkEl ? parseFloat(histBenchmarkEl.textContent) || null : null;
      const diffSummaryEl = document.getElementById('res-diff-summary');
      const diffText = diffSummaryEl ? diffSummaryEl.textContent : '';
      let pctDiff = 0;
      const matchDiff = diffText.match(/([-+]?[0-9]*\.?[0-9]+)%/);
      if (matchDiff) pctDiff = parseFloat(matchDiff[1]);

      const availBadge = document.querySelector('.badge-status');
      const availStatus = availBadge ? availBadge.textContent.trim() : 'Normal';

      const inputTemp = document.getElementById('input-temp');
      const inputRain = document.getElementById('input-rain');
      const inputHum = document.getElementById('input-hum');
      const inputHeat = document.getElementById('input-heat');
      const areaVal = parseFloat(inputArea?.value) || 100.0;
      const activeLanguage = currentLang || 'en';

      const payload = {
        crop: crop,
        state: selectState.value || 'Punjab',
        district: selectDistrict.value || 'Ludhiana',
        season: selectSeason.value || 'Rabi',
        crop_year: parseInt(inputYear?.value) || 2025,
        area_hectare: areaVal,
        temperature: inputTemp ? parseFloat(inputTemp.value) : 21.0,
        rainfall: inputRain ? parseFloat(inputRain.value) : 120.0,
        humidity: inputHum ? parseFloat(inputHum.value) : 62.0,
        extreme_heat_days: inputHeat ? parseInt(inputHeat.value) : 1,
        predicted_yield_per_ha: yieldVal > 0 ? yieldVal : 4.0,
        predicted_production_tons: parseFloat(prodText.replace(/[^0-9.-]+/g, '')) || (yieldVal > 0 ? yieldVal * areaVal : 4.0 * areaVal),
        historical_avg_yield_per_ha: histBenchmark,
        percent_difference: pctDiff,
        availability_status: availStatus,
        net_profit_rs: netProfit,
        gross_revenue_rs: (yieldVal > 0 ? yieldVal : 4.0) * 10 * 2125 * areaVal,
        total_cost_rs: 40000 * areaVal,
        lang: activeLanguage
      };

      const originalHtml = btnExportPdf.innerHTML;
      btnExportPdf.disabled = true;
      btnExportPdf.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF...';

      try {
        // 1. Try client-side generation first with current active language
        await generateClientPdf(payload, activeLanguage);
        return;
      } catch (clientErr) {
        console.warn('Client PDF generation error, trying server API:', clientErr);

        // 2. Fallback to server API
        try {
          const res = await fetch(`${API_BASE_URL}/api/export-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${crop}_Prediction_Report_${activeLanguage.toUpperCase()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            return;
          }
        } catch (serverErr) {
          console.error('Server PDF fetch error:', serverErr);
        }

        alert(activeLanguage === 'hi'
          ? 'पीडीएफ डाउनलोड करने के लिए कृपया पृष्ठ को रीफ्रेश (F5) करें।'
          : 'Please refresh the page (F5) to download the PDF report.');
      } finally {
        btnExportPdf.disabled = false;
        btnExportPdf.innerHTML = originalHtml;
      }
    });
  }

  // ============================================================
  // 4. Handle Price Trend & AI Price Forecasting
  // ============================================================
  const priceSelectDays = document.getElementById('price-select-days');
  const priceForecastCard = document.getElementById('price-forecast-card');
  const fcCurrent = document.getElementById('fc-current');
  const fcForecast = document.getElementById('fc-forecast');
  const fcTrend = document.getElementById('fc-trend');
  const fcDaysLabel = document.getElementById('fc-days-label');
  const fcPctLabel = document.getElementById('fc-pct-label');

  priceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const crop = priceSelectCrop.value;
    const state = priceSelectState ? priceSelectState.value : 'Punjab';
    const district = priceSelectDistrict.value;
    const daysAhead = parseInt(priceSelectDays ? priceSelectDays.value : 7);

    if (!crop || !district) return;

    try {
      const btn = document.getElementById('btn-fetch-prices');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating AI Forecast...';

      // Fetch historical prices & forecast in parallel
      const [histRes, fcRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/price-trend?crop=${encodeURIComponent(crop)}&district=${encodeURIComponent(district)}&state=${encodeURIComponent(state)}`),
        fetch(`${API_BASE_URL}/api/predict-price`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ crop, state, district, days_ahead: daysAhead })
        })
      ]);

      const histData = await histRes.json();
      const fcData = await fcRes.json();

      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Render Forecast & Chart';

      // Update Forecast Card
      let currentPriceVal = 2500;
      if (fcRes.ok && fcData) {
        currentPriceVal = fcData.current_price_qtl || 2500;
        priceForecastCard.style.display = 'grid';
        fcCurrent.textContent = `Rs. ${fcData.current_price_qtl.toLocaleString()}`;
        fcForecast.textContent = `Rs. ${fcData.forecasted_price_qtl.toLocaleString()}`;
        fcDaysLabel.textContent = `in ${daysAhead} days`;
        fcTrend.textContent = fcData.trend;
        fcPctLabel.textContent = `${fcData.percent_change >= 0 ? '+' : ''}${fcData.percent_change}% change expected`;
      }

      renderPriceChartWithForecast(histData.price_history || [], fcData.forecast_series || [], crop, district, currentPriceVal);
    } catch (err) {
      console.warn('Error fetching price forecast:', err);
      const btn = document.getElementById('btn-fetch-prices');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Render Forecast & Chart';

      renderDemoPriceChart(crop, district);
    }
  });

  function renderPriceChartWithForecast(history, forecastSeries, crop, district, defaultBasePrice = 2500) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    if (priceChartInstance) priceChartInstance.destroy();

    let labels = [];
    let actualPrices = [];
    let forecastPrices = [];

    if (history.length > 0) {
      labels = history.map(item => item.price_date);
      actualPrices = history.map(item => item.modal_price_qtl);
      forecastPrices = new Array(history.length).fill(null);
      // Link last historical price to first forecast price
      forecastPrices[history.length - 1] = actualPrices[actualPrices.length - 1];
    } else {
      labels = ['Day -6', 'Day -5', 'Day -4', 'Day -3', 'Day -2', 'Day -1', 'Today'];
      const baseP = defaultBasePrice;
      actualPrices = labels.map((_, i) => Math.round((baseP - (6 - i) * (baseP * 0.005)) * 100) / 100);
      forecastPrices = new Array(7).fill(null);
      forecastPrices[6] = actualPrices[6];
    }

    forecastSeries.forEach(item => {
      labels.push(item.date);
      actualPrices.push(null);
      forecastPrices.push(item.predicted_price_qtl);
    });

    priceChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Historical Modal Price (Rs./Qtl)',
            data: actualPrices,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            fill: true,
            tension: 0.3,
            borderWidth: 3
          },
          {
            label: 'AI Forecasted Price (Rs./Qtl)',
            data: forecastPrices,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            borderDash: [6, 6],
            fill: true,
            tension: 0.3,
            borderWidth: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `Historical & AI Forecasted Prices: ${crop} in ${district}`,
            color: '#f3f4f6',
            font: { size: 16, family: 'Outfit' }
          },
          legend: { labels: { color: '#9ca3af' } }
        },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  function renderPriceChart(history, crop, district) {
    const ctx = document.getElementById('priceChart').getContext('2d');

    if (priceChartInstance) {
      priceChartInstance.destroy();
    }

    if (history.length === 0) {
      renderDemoPriceChart(crop, district);
      return;
    }

    const labels = history.map(item => item.price_date);
    const modalPrices = history.map(item => item.modal_price_qtl);
    const minPrices = history.map(item => item.min_price_qtl);
    const maxPrices = history.map(item => item.max_price_qtl);

    priceChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Modal Price (₹/Qtl)',
            data: modalPrices,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            fill: true,
            tension: 0.3,
            borderWidth: 3
          },
          {
            label: 'Min Price (₹/Qtl)',
            data: minPrices,
            borderColor: '#06b6d4',
            borderDash: [5, 5],
            tension: 0.3,
            borderWidth: 2
          },
          {
            label: 'Max Price (₹/Qtl)',
            data: maxPrices,
            borderColor: '#f59e0b',
            borderDash: [5, 5],
            tension: 0.3,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `Historical Mandi Prices: ${crop} in ${district}`,
            color: '#f3f4f6',
            font: { size: 16, family: 'Outfit' }
          },
          legend: { labels: { color: '#9ca3af' } }
        },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  function renderDemoPriceChart(crop, district) {
    const ctx = document.getElementById('priceChart').getContext('2d');
    if (priceChartInstance) {
      priceChartInstance.destroy();
    }

    const labels = ['Apr 01', 'Apr 05', 'Apr 10', 'Apr 15', 'Apr 20', 'Apr 25', 'Apr 30'];
    const basePrice = crop === 'Wheat' ? 2125 : crop === 'Rice' ? 2040 : 5500;

    priceChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Modal Price (₹/Qtl)',
            data: labels.map((_, i) => basePrice + (i * 35) + Math.round(Math.random() * 40)),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            fill: true,
            tension: 0.35,
            borderWidth: 3
          },
          {
            label: 'Min Price (₹/Qtl)',
            data: labels.map((_, i) => basePrice - 100 + (i * 30)),
            borderColor: '#06b6d4',
            borderDash: [5, 5],
            tension: 0.35,
            borderWidth: 2
          },
          {
            label: 'Max Price (₹/Qtl)',
            data: labels.map((_, i) => basePrice + 150 + (i * 40)),
            borderColor: '#f59e0b',
            borderDash: [5, 5],
            tension: 0.35,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `Historical Mandi Prices: ${crop} in ${district || 'Punjab Market'} (Sample Trend)`,
            color: '#f3f4f6',
            font: { size: 16, family: 'Outfit' }
          },
          legend: { labels: { color: '#9ca3af' } }
        },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // Initialize System
  initSystem();
});
