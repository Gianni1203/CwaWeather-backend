require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY; // 請確保 .env 檔案中設定了此 Key

// 台灣主要城市列表 (CWA API LocationName)
const TAIWAN_CITIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", 
  "基隆市", "新竹市", "嘉義市", 
  "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", 
  "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
];

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得指定城市的天氣預報
 * @param {string} locationName - 城市名稱
 */
const getCityWeather = async (req, res) => {
  // 從 URL 參數取得城市名稱，並進行解碼 (支援中文)
  let locationName = decodeURIComponent(req.params.city || req.query.city);
  
  // 如果是使用者定位請求 (傳入 'current')，則預設先給予一個城市資料
  if (locationName === 'current') {
      // 在後續步驟中，我們將透過前端傳送經緯度來實際處理定位，
      // 但此路由目前只處理 CWA F-C0032-001 (縣市級預報)，先預設一個城市避免錯誤。
      locationName = "臺北市"; 
  }

  // 檢查是否是有效的縣市名稱
  if (!TAIWAN_CITIES.includes(locationName)) {
      return res.status(400).json({
          error: "輸入錯誤",
          message: `無效的縣市名稱: ${locationName}。請提供以下其中一個: ${TAIWAN_CITIES.join(', ')}`,
      });
  }

  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
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
          // 傳入動態的 locationName
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
        error: "查無資料",
        message: `無法取得 ${locationName} 天氣資料`,
      });
    }

    // 整理天氣資料 (與原邏輯相同)
    const weatherData = {
      city: locationData.locationName,
      // 使用 dataTime 作為更新時間
      updateTime: response.data.records.resource.dataTime, 
      forecasts: [],
    };

    // 解析天氣要素
    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: weatherElements.find(e => e.elementName === "Wx").time[i].startTime,
        endTime: weatherElements.find(e => e.elementName === "Wx").time[i].endTime,
        weather: "",
        rain: "",
        minTemp: "",
        maxTemp: "",
        comfort: "",
      };

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            break;
          case "PoP":
            forecast.rain = value.parameterName + "%";
            break;
          case "MinT":
            forecast.minTemp = value.parameterName; // 移除 °C，讓前端計算平均溫度更方便
            break;
          case "MaxT":
            forecast.maxTemp = value.parameterName; // 移除 °C
            break;
          case "CI":
            forecast.comfort = value.parameterName;
            break;
        // 移除原有的 WS 元素，因為 F-C0032-001 不包含 WS (風速)
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    // 檢查 CWA API 授權錯誤
    if (error.response && error.response.status === 401) {
        return res.status(401).json({
            error: "CWA API 授權錯誤",
            message: "請檢查您的 CWA_API_KEY 是否正確或已過期。",
        });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
      details: error.message,
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API - 特務版",
    endpoints: {
      city: "/api/weather/:city (例如: /api/weather/臺北市)",
      // 定位功能需要前端傳送經緯度，但此 API 路由先用於 County 預報
      cities: "/api/cities",
      health: "/api/health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 新增一個路由，提供台灣城市列表給前端
app.get("/api/cities", (req, res) => {
    res.json({
        success: true,
        cities: TAIWAN_CITIES,
    });
});

// 新的通用 API 路由
app.get("/api/weather/:city", getCityWeather);

// 移除原有的 /api/weather/kaohsiung 路由

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作 (特務模式啟動)`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});