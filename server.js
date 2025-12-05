require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// 台灣縣市清單
const TAIWAN_CITIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
  "基隆市", "新竹市", "嘉義市",
  "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣",
  "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣",
  "澎湖縣", "金門縣", "連江縣"
];

// Middlewares
app.use(cors());
app.use(express.json());

// 取得縣市 36 小時天氣資料
async function getCityWeather(req, res) {
  try {
    const city = req.params.city;

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "必須提供城市名稱"
      });
    }

    if (!TAIWAN_CITIES.includes(city)) {
      return res.status(400).json({
        success: false,
        message: `不支援的城市：${city}`
      });
    }

    if (!CWA_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "伺服器尚未設定 CWA_API_KEY，請聯絡管理員"
      });
    }

    // CWA 今明 36 小時天氣預報 (F-C0032-001)
    const url = `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`;
    const response = await axios.get(url, {
      params: {
        Authorization: CWA_API_KEY,
        locationName: city
      },
      timeout: 15000
    });

    if (!response.data || !response.data.records) {
      throw new Error("中央氣象署回傳資料格式不正確");
    }

    const records = response.data.records;
    const locations = records.location || [];
    const locationData =
      locations.find((loc) => loc.locationName === city) || locations[0];

    if (!locationData) {
      throw new Error("找不到對應城市的天氣資料");
    }

    // 將 weatherElement 轉成 { Wx: [...], PoP: [...], MinT: [...], MaxT: [...], CI: [...] } 形式
    const elementMap = {};
    (locationData.weatherElement || []).forEach((elem) => {
      elementMap[elem.elementName] = elem.time || [];
    });

    const wxList = elementMap["Wx"] || [];
    const popList = elementMap["PoP"] || [];
    const minTList = elementMap["MinT"] || [];
    const maxTList = elementMap["MaxT"] || [];
    const ciList = elementMap["CI"] || [];

    const forecastLength = wxList.length;
    const forecasts = [];

    for (let i = 0; i < forecastLength; i++) {
      const wx = wxList[i] || {};
      const pop = popList[i] || {};
      const minT = minTList[i] || {};
      const maxT = maxTList[i] || {};
      const ci = ciList[i] || {};

      const wxParam = wx.parameter || {};
      const popParam = pop.parameter || {};
      const minTParam = minT.parameter || {};
      const maxTParam = maxT.parameter || {};
      const ciParam = ci.parameter || {};

      forecasts.push({
        startTime: wx.startTime || maxT.startTime || minT.startTime || null,
        endTime: wx.endTime || maxT.endTime || minT.endTime || null,
        wx: wxParam.parameterName || "",
        wxValue: wxParam.parameterValue || "",
        rainProb: popParam.parameterName || "",
        minTemp: minTParam.parameterName || "",
        maxTemp: maxTParam.parameterName || "",
        comfort: ciParam.parameterName || ""
      });
    }

    const updateTime =
      (wxList[0] && wxList[0].startTime) || new Date().toISOString();

    const result = {
      success: true,
      city: locationData.locationName,
      updateTime,
      forecasts
    };

    // 關閉 cache，確保每次都能拿到最新資料
    res.set("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    console.error("取得天氣資料錯誤：", error.message);

    res.status(500).json({
      success: false,
      message: error.message || "伺服器錯誤，請稍後再試"
    });
  }
}

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
