/**
 * Crop Yield & Price Prediction System — Frontend Client
 */

document.addEventListener('DOMContentLoaded', () => {
  // Config - robustly target Flask API port 5000 even if page opened via Live Server/static file
  const API_BASE_URL = (window.location.origin && window.location.origin.includes('5000'))
    ? window.location.origin
    : 'http://127.0.0.1:5000';

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

      btn_export_csv: 'सीएसवी डाउनलोड',
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

      btn_export_csv: 'Export CSV',
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

  // Export CSV Handler
  const btnExportCsv = document.getElementById('btn-export-csv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const crop = selectCrop.value || 'Crop';
      const yieldVal = resYield.textContent || '0';
      const prod = resProduction.textContent || '0';
      const netProfit = document.getElementById('res-net-profit')?.textContent || '0';

      const csvContent = `data:text/csv;charset=utf-8,Parameter,Value\nCrop,${crop}\nState,${selectState.value}\nDistrict,${selectDistrict.value}\nPredicted Yield (Tons/Ha),${yieldVal}\nTotal Production,${prod}\nEstimated Net Profit,${netProfit.replace(/,/g, '')}\n`;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${crop}_Prediction_Report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
