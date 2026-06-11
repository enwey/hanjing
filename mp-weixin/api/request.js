"use strict";

const accountInfo = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
const miniProgram = accountInfo.miniProgram || {};
const env = miniProgram.envVersion || "develop";

const apiUrls = {
  develop: "http://127.0.0.1:5005/api/v1",
  trial: "https://test-api.hanjing.com/v1",
  release: "https://api.hanjing.com/v1",
};
const BASE_URL = apiUrls[env] || apiUrls.release;

const ENABLE_REAL_API = true;

function request(options, mockCallback) {
  if (!ENABLE_REAL_API) {
    console.log(`[Request Mock] ${options.method || "GET"} ${options.url}`);
    return mockCallback();
  }

  const token = wx.getStorageSync("access_token");
  const header = {
    "content-type": "application/json",
    ...options.header,
  };
  if (token) {
    header["Authorization"] = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || "GET",
      data: options.data,
      header: header,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          wx.removeStorageSync("access_token");
          reject(new Error("未授权或登录过期"));
        } else {
          console.warn(
            `[Request Error] Status ${res.statusCode}. Falling back to mock data...`,
          );
          mockCallback().then(resolve).catch(reject);
        }
      },
      fail: (err) => {
        console.warn(
          `[Request Fail] Connection to ${BASE_URL} failed. Falling back to mock data...`,
        );
        mockCallback().then(resolve).catch(reject);
      },
    });
  });
}

exports.BASE_URL = BASE_URL;
exports.request = request;
