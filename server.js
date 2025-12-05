require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

const TAIWAN_CITIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", 
  "基隆市", "新竹市", "嘉義市", 
  "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", 
  "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
];

// --- 關鍵設定開始 ---

// 1. 強制關閉 Express 的 ETag 功能 (這是造成 304 的主因)
app.set('etag', false);

// 2. 使用標準 CORS 套件 (最穩定的方式)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. 強制加上「禁止快取」Header (確保瀏覽器每次都抓新的)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// --- 關鍵設定結束 ---

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 取得指定城市天氣
const getCityWeather = async (req, res) => {
  try {
    let locationName = decodeURIComponent(req.params.city);
    
    // 檢查無效輸入
    if (!locationName || locationName === 'undefined') locationName = '臺北市';
    if (!TAIWAN_CITIES.includes(locationName)) locationName = '臺北市';

    if (!CWA_API_KEY) throw new Error("API Key 未設定");

    // 呼叫氣象局 API
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: { Authorization: CWA_API_KEY, locationName: locationName },
      }
    );

    const locationData = response.data.records.location.find(loc => loc.locationName === locationName);
    if (!locationData) throw new Error("查無資料");

    const weatherData = {
      city: locationData.locationName,
      updateTime: response.data.records.resource.dataTime, 
      forecasts: [],
    };

    // 解析資料
    const weatherElements = locationData.weatherElement;
    for (let i = 0; i < 3; i++) {
      const forecast = {};
      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        forecast.startTime = element.time[i].startTime;
        forecast.endTime = element.time[i].endTime;
        switch (element.elementName) {
          case "Wx": forecast.weather = value.parameterName; break;
          case "PoP": forecast.rain = value.parameterName + "%"; break;
          case "MinT": forecast.minTemp = value.parameterName; break;
          case "MaxT": forecast.maxTemp = value.parameterName; break;
          case "CI": forecast.comfort = value.parameterName; break;
        }
      });
      weatherData.forecasts.push(forecast);
    }

    res.json({ success: true, data: weatherData });

  } catch (error) {
    console.error("API Error:", error.message);
    // 確保即使出錯也回傳 JSON，避免前端掛掉
    res.status(500).json({ success: false, error: "伺服器錯誤", msg: error.message });
  }
};

// Routes
app.get("/api/cities", (req, res) => {
    res.json({ success: true, cities: TAIWAN_CITIES });
});

app.get("/api/weather/:city", getCityWeather);

app.get("/", (req, res) => {
  res.send("Zeabur Service Running - No Cache Mode");
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});