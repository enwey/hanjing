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

let isRefreshing = false;
let requestsQueue = [];

function createRequestError(message, statusCode, data) {
  const error = new Error(message || "请求失败，请稍后重试");
  error.statusCode = statusCode;
  error.data = data;
  return error;
}

function request(options) {
  if (!ENABLE_REAL_API) {
    return Promise.reject(new Error("真实接口未启用"));
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
    function executeRequest() {
      const currentToken = wx.getStorageSync("access_token");
      if (currentToken) {
        header["Authorization"] = `Bearer ${currentToken}`;
      }
      wx.request({
        url: `${BASE_URL}${options.url}`,
        method: options.method || "GET",
        data: options.data,
        header: header,
        timeout: 10000,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else if (res.statusCode === 401) {
            wx.removeStorageSync("access_token");
            if (options.url === "/auth/wx-login") {
              reject(new Error("登录授权失败"));
              return;
            }

            if (isRefreshing) {
              // Add to queue for retry when token is refreshed
              requestsQueue.push((newToken) => {
                const retryHeader = {
                  ...header,
                  "Authorization": `Bearer ${newToken}`,
                };
                wx.request({
                  url: `${BASE_URL}${options.url}`,
                  method: options.method || "GET",
                  data: options.data,
                  header: retryHeader,
                  timeout: 10000,
                  success: (retryRes) => {
                    if (retryRes.statusCode >= 200 && retryRes.statusCode < 300) {
                      resolve(retryRes.data);
                    } else {
                      reject(
                        createRequestError(
                          (retryRes.data && retryRes.data.message) || options.failMessage,
                          retryRes.statusCode,
                          retryRes.data,
                        ),
                      );
                    }
                  },
                  fail: (err) => {
                    reject(createRequestError(options.failMessage));
                  }
                });
              });
              return;
            }

            isRefreshing = true;
            console.warn("[Request] 401 Unauthorized, triggering silent login...");
            wx.login({
              success: (loginRes) => {
                if (loginRes.code) {
                  wx.request({
                    url: `${BASE_URL}/auth/wx-login`,
                    method: "POST",
                    data: { code: loginRes.code },
                    success: (loginApiRes) => {
                      isRefreshing = false;
                      if (loginApiRes.statusCode === 200 && loginApiRes.data && loginApiRes.data.code === 0) {
                        const newToken = loginApiRes.data.data.access_token;
                        wx.setStorageSync("access_token", newToken);
                        console.log("[Request] Silent login successful, retrying queued requests...");
                        // Trigger retry for all queued requests
                        requestsQueue.forEach((cb) => cb(newToken));
                        requestsQueue = [];
                        // Retry current request
                        const retryHeader = {
                          ...header,
                          "Authorization": `Bearer ${newToken}`,
                        };
                        wx.request({
                          url: `${BASE_URL}${options.url}`,
                          method: options.method || "GET",
                          data: options.data,
                          header: retryHeader,
                          timeout: 10000,
                          success: (retryRes) => {
                            if (retryRes.statusCode >= 200 && retryRes.statusCode < 300) {
                              resolve(retryRes.data);
                            } else {
                              reject(
                                createRequestError(
                                  (retryRes.data && retryRes.data.message) || options.failMessage,
                                  retryRes.statusCode,
                                  retryRes.data,
                                ),
                              );
                            }
                          },
                          fail: (err) => {
                            reject(createRequestError(options.failMessage));
                          }
                        });
                      } else {
                        console.warn("[Request Silent Login Fail] Invalid token response.");
                        requestsQueue = [];
                        reject(createRequestError("登录授权失败"));
                      }
                    },
                    fail: (err) => {
                      isRefreshing = false;
                      console.warn("[Request Silent Login Fail] HTTP call failed.");
                      requestsQueue = [];
                      reject(createRequestError("登录授权失败"));
                    }
                  });
                } else {
                  isRefreshing = false;
                  console.warn("[Request Silent Login Fail] wx.login returned no code.");
                  requestsQueue = [];
                  reject(createRequestError("登录授权失败"));
                }
              },
              fail: (err) => {
                isRefreshing = false;
                console.warn("[Request Silent Login Fail] wx.login call failed.");
                requestsQueue = [];
                reject(createRequestError("登录授权失败"));
              }
            });
          } else {
            console.warn(`[Request Error] Status ${res.statusCode}.`);
            reject(
              createRequestError(
                (res.data && res.data.message) || options.failMessage,
                res.statusCode,
                res.data,
              ),
            );
          }
        },
        fail: (err) => {
          console.warn(`[Request Fail] Connection to ${BASE_URL}${options.url} failed.`);
          reject(createRequestError(options.failMessage));
        },
      });
    }

    executeRequest();
  });
}

exports.BASE_URL = BASE_URL;
exports.request = request;
