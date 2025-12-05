require("dotenv").config();
const express = require("express");
const axios = require("axios");
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

const TAIWAN_CITIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", 
  "基隆市", "新竹市", "嘉義市", 
  "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", 
  "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
];

// 1. 強制關閉 304 快取機制 (關鍵修改)
app.set('etag', false);

// 2. 手動暴力設定 CORS 與 快取控制 Header (關鍵修改)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    // 告訴瀏覽器：絕對不要快取這個回應！
    res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    res.header("Pragma", "no-cache");
    res.header("Expires", "0");
    
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 取得指定城市天氣
const getCityWeather = async (req, res) => {
  let locationName = decodeURIComponent(req.params.city);
  
  if (!TAIWAN_CITIES.includes(locationName)) {
      return res.status(400).json({ error: "無效的縣市名稱" });
  }

  try {
    if (!CWA_API_KEY) throw new Error("API Key 未設定");

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

    const weatherElements = locationData.weatherElement;
    for (let i = 0; i < 3; i++) { // API 只回傳 3 個時段
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
    console.error(error.message);
    res.status(500).json({ error: "伺服器錯誤", msg: error.message });
  }
};

// Routes
app.get("/api/cities", (req, res) => {
    res.json({ success: true, cities: TAIWAN_CITIES });
});

app.get("/api/weather/:city", getCityWeather);

app.get("/", (req, res) => {
  res.send("Server Running (No Cache Mode)");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});