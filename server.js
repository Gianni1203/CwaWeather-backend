require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY; // 從 .env 讀取金鑰

// 台灣主要城市列表 (CWA API F-C0032-001 資料集涵蓋的縣市)
const TAIWAN_CITIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", 
  "基隆市", "新竹市", "嘉義市", 
  "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", 
  "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
];

// 確保靜態檔案路徑
const FRONTEND_DIR = path.join(__dirname, 'public'); 

// --- Middleware ---
// ⚠️ CORS 設定：允許所有網域存取 (解決 GitHub Pages 跨域問題)
app.use(cors({ origin: '*' })); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得指定城市的天氣預報 (36小時)
 * @param {string} locationName - 城市名稱
 */
const getCityWeather = async (req, res) => {
  // 從 URL 參數取得城市名稱，並進行解碼 (支援中文)
  let locationName = decodeURIComponent(req.params.city);
  
  // 檢查是否為有效的縣市名稱
  if (!TAIWAN_CITIES.includes(locationName)) {
      // 如果用戶傳入的名稱有誤，回傳 400 錯誤
      return res.status(400).json({
          success: false,
          error: "輸入錯誤",
          message: `無效的縣市名稱: ${locationName}。請提供以下其中一個: ${TAIWAN_CITIES.join(', ')}`,
      });
  }

  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 呼叫 CWA API - 一般天氣預報（36小時）
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: locationName, 
        },
      }
    );

    // 取得指定城市的天氣資料
    const locationData = response.data.records.location.find(
        loc => loc.locationName === locationName
    );

    if (!locationData) {
      return res.status(404).json({
        success: false,
        error: "查無資料",
        message: `無法取得 ${locationName} 天氣資料`,
      });
    }

    // 整理天氣資料
    const weatherData = {
      city: locationData.locationName,
      updateTime: response.data.records.resource.dataTime, 
      forecasts: [],
    };

    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {};

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        const startTime = element.time[i].startTime;
        const endTime = element.time[i].endTime;

        forecast.startTime = startTime;
        forecast.endTime = endTime;

        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            break;
          case "PoP":
            forecast.rain = value.parameterName + "%";
            break;
          case "MinT":
            // 保持純數字，方便前端計算平均溫度
            forecast.minTemp = value.parameterName; 
            break;
          case "MaxT":
             // 保持純數字
            forecast.maxTemp = value.parameterName; 
            break;
          case "CI":
            forecast.comfort = value.parameterName;
            break;
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });

  } catch (error) {
    console.error(`取得 ${locationName} 天氣資料失敗:`, error.message);

    if (error.response) {
      // CWA API 回應錯誤
      return res.status(error.response.status).json({
        success: false,
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
      });
    }

    // 其他伺服器錯誤
    res.status(500).json({
      success: false,
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請檢查您的 API 金鑰或後端設定",
    });
  }
};

// --- Routes ---

// 1. 取得所有城市列表 (給前端下拉選單使用)
app.get("/api/cities", (req, res) => {
    res.json({
        success: true,
        cities: TAIWAN_CITIES,
    });
});

// 2. 取得指定城市天氣預報
app.get("/api/weather/:city", getCityWeather);

// 3. 根路徑 (給 Zeabur 健康檢查用)
app.get("/", (req, res) => {
  res.json({
    message: "特務情報局後端 API 服務運行中",
    endpoints: {
      city_weather: "/api/weather/:city (例如: /api/weather/臺北市)",
      cities_list: "/api/cities",
      health: "/api/health",
    },
  });
});

// 4. 健康檢查
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 5. 錯誤處理 (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "找不到此路徑",
    message: "請檢查 API 網址是否正確",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作 (特務模式啟動)`);
  console.log(`📍 URL 支援: http://localhost:${PORT}/api/weather/臺北市`);
});