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
      timeout: 3000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          wx.removeStorageSync("access_token");
          if (options.url === "/auth/wx-login") {
            reject(new Error("登录授权失败"));
            return;
          }
          console.warn("[Request] 401 Unauthorized, triggering silent login...");
          wx.login({
            success: (loginRes) => {
              if (loginRes.code) {
                wx.request({
                  url: `${BASE_URL}/auth/wx-login`,
                  method: "POST",
                  data: { code: loginRes.code },
                  success: (loginApiRes) => {
                    if (loginApiRes.statusCode === 200 && loginApiRes.data && loginApiRes.data.code === 0) {
                      const newToken = loginApiRes.data.data.access_token;
                      wx.setStorageSync("access_token", newToken);
                      console.log("[Request] Silent login successful, retrying original request...");
                      const retryHeader = {
                        "content-type": "application/json",
                        ...options.header,
                        "Authorization": `Bearer ${newToken}`,
                      };
                      wx.request({
                        url: `${BASE_URL}${options.url}`,
                        method: options.method || "GET",
                        data: options.data,
                        header: retryHeader,
                        timeout: 3000,
                        success: (retryRes) => {
                          if (retryRes.statusCode >= 200 && retryRes.statusCode < 300) {
                            resolve(retryRes.data);
                          } else {
                            console.warn("[Request Retry Fail] Response status: " + retryRes.statusCode + ". Falling back to mock data...");
                            mockCallback().then(resolve).catch(reject);
                          }
                        },
                        fail: (err) => {
                          console.warn("[Request Retry Fail] Connection failed. Falling back to mock data...");
                          mockCallback().then(resolve).catch(reject);
                        }
                      });
                    } else {
                      console.warn("[Request Silent Login Fail] Invalid token response. Falling back to mock data...");
                      mockCallback().then(resolve).catch(reject);
                    }
                  },
                  fail: (err) => {
                    console.warn("[Request Silent Login Fail] HTTP call failed. Falling back to mock data...");
                    mockCallback().then(resolve).catch(reject);
                  }
                });
              } else {
                console.warn("[Request Silent Login Fail] wx.login returned no code. Falling back to mock data...");
                mockCallback().then(resolve).catch(reject);
              }
            },
            fail: (err) => {
              console.warn("[Request Silent Login Fail] wx.login call failed. Falling back to mock data...");
              mockCallback().then(resolve).catch(reject);
            }
          });
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
