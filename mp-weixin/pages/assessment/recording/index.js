"use strict";
const e = require("../../../common/vendor.js"),
  assessmentApi = require("../../../api/index.js");
Math || l();
const loadNavbarComponent = () => "../../../components/base/hj-navbar.js",
  pageComponent = e.defineComponent({
    __name: "index",
    setup() {
      const isRecording = e.ref(!1),
        hasRecordingEnded = e.ref(!1),
        isSubmitting = e.ref(!1),
        recordingDurationSeconds = e.ref(0),
        isAnalyzing = e.ref(!1);
      const originalScreenBrightness = e.ref(null);
      const hasDimmedScreen = e.ref(!1);

      const familyMembers = e.ref([]);
      const memberNames = e.ref([]);
      const memberIndex = e.ref(0);
      const selectedMemberName = e.ref("本人");
      const selectedMemberId = e.ref("");
      const disabledSelector = e.computed(
        () => isRecording.value || isSubmitting.value || isAnalyzing.value,
      );

      async function loadFamilyMembers() {
        try {
          const response = await assessmentApi.getFamilyMembers();
          const list = response.data?.list || [];
          familyMembers.value = list;
          
          const relationNames = {
            self: "本人",
            spouse: "配偶",
            child: "子女",
            parent: "父母",
            sibling: "兄弟姐妹",
            other: "其他"
          };
          memberNames.value = list.map(m => `${m.name} (${relationNames[m.relation] || m.relation})`);
          
          const selfIdx = list.findIndex(m => m.relation === "self");
          if (selfIdx !== -1) {
            memberIndex.value = selfIdx;
            selectedMemberName.value = list[selfIdx].name;
            selectedMemberId.value = list[selfIdx].id;
          } else if (list.length > 0) {
            memberIndex.value = 0;
            selectedMemberName.value = list[0].name;
            selectedMemberId.value = list[0].id;
          }
        } catch (err) {
          console.error(err);
        }
      }

      function onMemberChange(event) {
        const val = event.detail.value;
        memberIndex.value = val;
        const selected = familyMembers.value[val];
        if (selected) {
          selectedMemberName.value = selected.name;
          selectedMemberId.value = selected.id;
        }
      }
      let r = null;
      let simInterval = null;
      let lastFrameTime = 0;
      let recordingStartTime = 0;
      const recorderManager = wx.getRecorderManager();
      const tempFilePath = e.ref("");
      const volumeScale = e.ref(1.0);
      const minimumScreenBrightness = 0.01;

      recorderManager.onStop((res) => {
        console.log("[RecorderManager] Stopped, tempFilePath:", res.tempFilePath);
        tempFilePath.value = res.tempFilePath;
        simInterval && clearInterval(simInterval);
        submitRecording();
      });
      recorderManager.onError((err) => {
        console.error("[RecorderManager] Error:", err);
      });
      const factors = [0.15, 0.25, 0.4, 0.6, 0.8, 0.95, 1.0, 1.0, 1.0, 1.0, 0.95, 0.8, 0.6, 0.4, 0.25, 0.15];
      recorderManager.onFrameRecorded((res) => {
        if (res && res.frameBuffer) {
          try {
            // Use safe utility to convert frameBuffer to pcm
            const pcm = toPcmInt16Array(res.frameBuffer);
            let sum = 0;
            const len = pcm.length;
            if (len > 0) {
              lastFrameTime = Date.now();
              for (let i = 0; i < len; i++) {
                sum += Math.abs(pcm[i]);
              }
              const avgAbs = sum / len;
              // Map avgAbs (usually 50 to 5000) to 0.0 to 1.0
              const scale = Math.min(1.0, Math.max(0.0, (avgAbs - 80) / 1800));
              
              // Generate new heights for the 16 bars based on sound decibels
              const newLevels = [];
              for (let i = 0; i < 16; i++) {
                const maxJump = 32;
                const noise = 0.85 + Math.random() * 0.3; // Staggered organic variance
                const height = 6 + Math.floor(maxJump * scale * factors[i] * noise);
                newLevels.push(Math.min(38, Math.max(6, height)));
              }
              audioLevels.value = newLevels;
              volumeScale.value = Math.min(1.3, Math.max(0.15, avgAbs / 1500));
            }
          } catch (e) {
            console.error("Frame volume calc error:", e);
          }
        }
      });

      function toPcmInt16Array(arrayBuffer) {
        const validByteLength = arrayBuffer.byteLength - (arrayBuffer.byteLength % 2);
        if (validByteLength <= 0) {
          return new Int16Array(0);
        }
        if (validByteLength === arrayBuffer.byteLength) {
          return new Int16Array(arrayBuffer);
        }
        return new Int16Array(arrayBuffer.slice(0, validByteLength));
      }

      function rememberCurrentScreenBrightness() {
        if (typeof originalScreenBrightness.value === "number") {
          return Promise.resolve(originalScreenBrightness.value);
        }
        return new Promise((resolve) => {
          wx.getScreenBrightness({
            success(res) {
              const currentBrightness =
                res && typeof res.value === "number" ? res.value : 1;
              originalScreenBrightness.value = currentBrightness;
              resolve(currentBrightness);
            },
            fail(err) {
              console.warn("[SnoreRecording] 获取当前亮度失败", err);
              resolve(null);
            },
          });
        });
      }

      async function dimScreenForRecording() {
        if (hasDimmedScreen.value) {
          return;
        }
        await rememberCurrentScreenBrightness();
        wx.setScreenBrightness({
          value: minimumScreenBrightness,
          success() {
            hasDimmedScreen.value = !0;
          },
          fail(err) {
            console.warn("[SnoreRecording] 降低屏幕亮度失败", err);
          },
        });
      }

      function restoreScreenBrightness() {
        if (!hasDimmedScreen.value) {
          return;
        }
        const targetBrightness =
          typeof originalScreenBrightness.value === "number"
            ? originalScreenBrightness.value
            : 1;
        wx.setScreenBrightness({
          value: targetBrightness,
          complete() {
            hasDimmedScreen.value = !1;
            originalScreenBrightness.value = null;
          },
        });
      }

      function handleBack() {
        restoreScreenBrightness();
        e.index.navigateBack({
          delta: 1,
          fail() {
            e.index.navigateTo({ url: "/pages/assessment/index" });
          },
        });
      }

      const durationStr = e.computed(() => {
          const minutes = Math.floor(recordingDurationSeconds.value / 60),
            seconds = recordingDurationSeconds.value % 60;
          return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        });
      const audioLevels = e.ref(new Array(16).fill(6));
      const statusText = e.computed(() => {
        if (isAnalyzing.value) return "AI正在离线分析呼吸指标...";
        if (isRecording.value && !hasRecordingEnded.value) return "正在监测睡眠声音...";
        if (!isRecording.value && !isSubmitting.value) return "点击麦克风开启睡眠监测";
        return "正在监测睡眠声音...";
      });
      const statusClass = e.computed(() => {
        if (isAnalyzing.value) return "status-text--analyzing";
        if (isRecording.value && !hasRecordingEnded.value) return "status-text--recording";
        if (hasRecordingEnded.value) return "status-text--paused";
        return "";
      });
      const showStatusText = e.computed(() => {
        if (isAnalyzing.value) return true;
        if (isRecording.value && !hasRecordingEnded.value) return true;
        if (!isRecording.value && !isSubmitting.value) return true;
        return false;
      });

      function startRecording() {
        wx.authorize({
          scope: "scope.record",
          success: async () => {
            await dimScreenForRecording();
            isRecording.value = !0;
            hasRecordingEnded.value = !1;
            recordingDurationSeconds.value = 0;
            volumeScale.value = 0.5;
            audioLevels.value = new Array(16).fill(6);
            recordingStartTime = Date.now();
            lastFrameTime = 0;
            
            // Start simulation interval fallback (for WeChat Simulator where microphone input frames may be mock-disabled)
            simInterval && clearInterval(simInterval);
            simInterval = setInterval(() => {
              if (Date.now() - lastFrameTime > 400) {
                const elapsed = (Date.now() - recordingStartTime) / 1000;
                const breathe = Math.sin(elapsed * Math.PI / 2.0); // deep breath oscillation
                const isSnoring = Math.sin(elapsed * Math.PI / 10) > 0.6; // sleep snore surge
                const baseScale = isSnoring ? 0.6 : 0.2;
                const scale = Math.min(1.0, Math.max(0.02, baseScale + breathe * baseScale + (Math.random() * 0.12)));
                
                const newLevels = [];
                for (let i = 0; i < 16; i++) {
                  const maxJump = 32;
                  const noise = 0.8 + Math.random() * 0.4;
                  const height = 6 + Math.floor(maxJump * scale * factors[i] * noise);
                  newLevels.push(Math.min(38, Math.max(6, height)));
                }
                audioLevels.value = newLevels;
                volumeScale.value = Math.min(1.3, Math.max(0.15, scale * 1.2));
              }
            }, 150);

            r = setInterval(() => {
              recordingDurationSeconds.value++;
            }, 1000);
            recorderManager.start({
              duration: 600000,
              sampleRate: 8000,
              numberOfChannels: 1,
              format: "pcm",
              frameSize: 2,
            });
          },
          fail: () => {
            e.index.showModal({
              title: "授权提示",
              content: "我们需使用麦克风来分析您的鼾声，请在系统设置中开启麦克风录音权限。",
              confirmText: "去设置",
              success: (res) => {
                if (res.confirm) {
                  wx.openSetting();
                }
              }
            });
          }
        });
      }

      function pauseRecording() {
        if (isRecording.value) {
          r && clearInterval(r);
          simInterval && clearInterval(simInterval);
          isRecording.value = !1;
          hasRecordingEnded.value = !0;
          isSubmitting.value = !0;
          volumeScale.value = 1.0;
          audioLevels.value = new Array(16).fill(6);
          recorderManager.pause();
          restoreScreenBrightness();
        }
      }

      function resumeRecording() {
        if (!isRecording.value && hasRecordingEnded.value) {
          dimScreenForRecording();
          isRecording.value = !0;
          hasRecordingEnded.value = !1;
          isSubmitting.value = !1;
          volumeScale.value = 0.5;
          audioLevels.value = new Array(16).fill(6);
          recordingStartTime = Date.now();
          lastFrameTime = 0;
          
          simInterval && clearInterval(simInterval);
          simInterval = setInterval(() => {
            if (Date.now() - lastFrameTime > 400) {
              const elapsed = (Date.now() - recordingStartTime) / 1000;
              const breathe = Math.sin(elapsed * Math.PI / 2.0);
              const isSnoring = Math.sin(elapsed * Math.PI / 10) > 0.6;
              const baseScale = isSnoring ? 0.6 : 0.2;
              const scale = Math.min(1.0, Math.max(0.02, baseScale + breathe * baseScale + (Math.random() * 0.12)));
              
              const newLevels = [];
              for (let i = 0; i < 16; i++) {
                const maxJump = 32;
                const noise = 0.8 + Math.random() * 0.4;
                const height = 6 + Math.floor(maxJump * scale * factors[i] * noise);
                newLevels.push(Math.min(38, Math.max(6, height)));
              }
              audioLevels.value = newLevels;
              volumeScale.value = Math.min(1.3, Math.max(0.15, scale * 1.2));
            }
          }, 150);

          r = setInterval(() => {
            recordingDurationSeconds.value++;
          }, 1000);
          recorderManager.resume();
        }
      }

      function stopAndAnalyze() {
        if (recordingDurationSeconds.value < 5) {
          e.index.showToast({
            title: "录音时间过短，分析前请至少录制5秒",
            icon: "none",
          });
          return;
        }
        isAnalyzing.value = !0;
        recorderManager.stop();
      }

      function onMicTap() {
        if (isRecording.value) {
          pauseRecording();
        } else if (hasRecordingEnded.value) {
          resumeRecording();
        } else {
          startRecording();
        }
      }

      function analyzePcmOnClient(pcmData, durationSeconds) {
        const lowCut = 80;
        const highCut = 800;
        const sampleRate = 8000;
        const rcLow = 1.0 / (2.0 * Math.PI * lowCut);
        const rcHigh = 1.0 / (2.0 * Math.PI * highCut);
        const dt = 1.0 / sampleRate;
        const alphaLow = dt / (rcLow + dt);
        const alphaHigh = rcHigh / (rcHigh + dt);
        let lastLowVal = 0;
        let lastHighVal = 0;
        const frameSamples = 16000;
        const totalSamples = pcmData.length;
        const frameDuration = 2;
        let totalDurationSeconds = 0;
        let averageDecibelSum = 0;
        let decibelSamplesCount = 0;
        let peakDecibel = 30;
        let tempSnoreEventStreak = 0;
        let lastSnoreTime = 0;
        let snoreCount = 0;
        let snoreDurationSeconds = 0;
        let silenceSeconds = 0;
        let inApneaState = false;
        let apneaEventsCount = 0;
        for (let offset = 0; offset < totalSamples; offset += frameSamples) {
          const end = Math.min(totalSamples, offset + frameSamples);
          const size = end - offset;
          if (size < 4000) continue;
          let sumAbsolute = 0;
          for (let i = offset; i < end; i++) {
            const rawSample = pcmData[i] / 32768.0;
            lastLowVal = lastLowVal + alphaLow * (rawSample - lastLowVal);
            const filteredSample = alphaHigh * (lastLowVal - lastHighVal);
            lastHighVal = lastLowVal;
            sumAbsolute += Math.abs(filteredSample);
          }
          const avgEnergy = sumAbsolute / size;
          const frameDecibel = Math.min(95, Math.max(30, Math.round(30 + avgEnergy * 85)));
          totalDurationSeconds += frameDuration;
          averageDecibelSum += frameDecibel;
          decibelSamplesCount++;
          if (frameDecibel > peakDecibel) {
            peakDecibel = frameDecibel;
          }
          const isLoudEvent = frameDecibel >= 42;
          if (isLoudEvent) {
            const timeSinceLastSnore = totalDurationSeconds - lastSnoreTime;
            if (timeSinceLastSnore >= 2 && timeSinceLastSnore <= 6) {
              tempSnoreEventStreak++;
              if (tempSnoreEventStreak >= 3) {
                snoreCount++;
                snoreDurationSeconds += frameDuration;
              }
            } else if (timeSinceLastSnore > 6) {
              tempSnoreEventStreak = 1;
            }
            lastSnoreTime = totalDurationSeconds;
          }
          const isSilent = frameDecibel < 35;
          if (isSilent) {
            silenceSeconds += frameDuration;
            if (silenceSeconds >= 10 && !inApneaState) {
              inApneaState = !0;
            }
          } else {
            if (inApneaState) {
              if (frameDecibel >= 60) {
                apneaEventsCount++;
              }
              inApneaState = !1;
            }
            silenceSeconds = 0;
          }
        }
        const snoreRate = Math.min(95, Math.max(0, Math.round((snoreDurationSeconds / Math.max(1, totalDurationSeconds)) * 100)));
        const avgDecibel = decibelSamplesCount > 0 ? Math.round(averageDecibelSum / decibelSamplesCount) : 35;
        const apneaEvents = apneaEventsCount;
        const hours = Math.max(0.1, durationSeconds / 3600);
        const AHI = apneaEvents / hours;
        let riskLevel = "normal";
        if (AHI < 5) riskLevel = "normal";
        else if (AHI < 15) riskLevel = "mild";
        else if (AHI < 30) riskLevel = "moderate";
        else riskLevel = "severe";
        return { avgDecibel, peakDecibel, snoreRate, apneaEvents, riskLevel };
      }

      async function submitRecording() {
        if (recordingDurationSeconds.value < 5) {
          e.index.showToast({ title: "录音时间过短，分析前请至少录制5秒", icon: "none" });
          return;
        }
        isAnalyzing.value = !0;
        let shouldExitAnalyzingState = !0;
        try {
          let analysisResult = null;
          if (tempFilePath.value) {
            try {
              const fs = wx.getFileSystemManager();
              const arrayBuffer = fs.readFileSync(tempFilePath.value);
              const pcmData = toPcmInt16Array(arrayBuffer);
              analysisResult = analyzePcmOnClient(pcmData, recordingDurationSeconds.value);
              console.log("[SnoreRecording] Client analysis completed:", analysisResult);
            } catch (fsErr) {
              console.error("[SnoreRecording] Local DSP analysis failed:", fsErr);
            }
          }
          if (!analysisResult) {
            throw new Error("未能读取到有效的音频数据，请开启权限重新录音");
          }
          const localReport = {
            id: "local",
            userId: "user-001",
            patientId: selectedMemberId.value || "pat-001",
            type: "ai_snore",
            snoreRecordUrl: "",
            snoreAnalysis: {
              duration: recordingDurationSeconds.value,
              avgDecibel: analysisResult.avgDecibel,
              peakDecibel: analysisResult.peakDecibel,
              snoreRate: analysisResult.snoreRate,
              apneaEvents: analysisResult.apneaEvents,
              qualityScore: 85,
              riskLevel: analysisResult.riskLevel
            },
            recommendation: "这是在微信小程序端本地进行实时声学分析得出的报告结论。",
            createdAt: new Date().toISOString()
          };
          wx.setStorageSync("last_local_snore_result", localReport);
          const payload = { 
            duration: recordingDurationSeconds.value,
            client_side_analysis: !0,
            analysis_result: analysisResult,
            timestamp: Date.now(),
            patientId: selectedMemberId.value
          };
          try {
            const submitResult = (await assessmentApi.submitSnoreRecording(payload)).data;
            if (submitResult && submitResult.id) {
              shouldExitAnalyzingState = !1;
              e.index.redirectTo({
                url: "/pages/assessment/snore-result/index?id=" + submitResult.id,
              });
              return;
            } else {
              throw new Error("Invalid response");
            }
          } catch (uploadErr) {
            console.warn("[SnoreRecording] Upload failed, caching for silent retry:", uploadErr);
            const pending = wx.getStorageSync("pending_snore_uploads") || [];
            pending.push(payload);
            wx.setStorageSync("pending_snore_uploads", pending);
            e.index.showToast({ title: "已离线生成报告，联网后将自动同步", icon: "none", duration: 2500 });
            shouldExitAnalyzingState = !1;
            e.index.redirectTo({
              url: "/pages/assessment/snore-result/index?id=local",
            });
            return;
          }
        } catch (l) {
          (console.error("[SnoreRecording] 提交失败", l),
            e.index.showToast({
              title: (l && l.message) || "分析失败，请重试",
              icon: "none",
            }));
        } finally {
          if (shouldExitAnalyzingState) {
            isAnalyzing.value = !1;
          }
        }
      }

      e.onMounted(async () => {
        try {
          await loadFamilyMembers();
          await assessmentApi.syncPendingSnoreRecordings();
        } catch (err) {
          console.error("Silent sync error:", err);
        }
      });
      e.onHide(() => {
        restoreScreenBrightness();
      });

      return (
        e.onUnmounted(() => {
          r && clearInterval(r);
          restoreScreenBrightness();
        }),
        (a, l) =>
          e.e(
            {
              memberNames: e.unref(memberNames),
              memberIndex: e.unref(memberIndex),
              selectedMemberName: e.unref(selectedMemberName),
              onMemberChange: e.o(onMemberChange),
              disabledSelector: e.unref(disabledSelector),
              handleBack: e.o(handleBack, "2f"),
              navbarProps: e.p({ title: "AI鼾声分析", showBack: !0, customBack: !0, transparent: !0, textColor: "#ffffff" }),
              waveVisible: isRecording.value || isSubmitting.value,
              volScale: e.unref(volumeScale),
              showPlayIcon: !isRecording.value || hasRecordingEnded.value,
              showPauseIcon: isRecording.value && !hasRecordingEnded.value,
              showAnalyzingIcon: isAnalyzing.value,
              statusText: e.unref(statusText),
              statusClass: e.unref(statusClass),
              showStatusText: e.unref(showStatusText),
            },
            isRecording.value || isSubmitting.value
              ? {
                  c: e.f(audioLevels.value, (e, a, l) => ({
                    a: a,
                    b: e + "px",
                    c: 0.05 * a + "s",
                  })),
                  d: isRecording.value && !hasRecordingEnded.value ? 1 : "",
                }
              : {},
            { e: isRecording.value || isSubmitting.value },
            isRecording.value || isSubmitting.value ? { f: e.t(durationStr.value) } : {},
            { g: isRecording.value && !hasRecordingEnded.value ? 1 : "", h: !isRecording.value && !isSubmitting.value },
            isRecording.value || isSubmitting.value ? (isAnalyzing.value || isSubmitting.value, {}) : {},
            {
              i: isAnalyzing.value,
              j: isSubmitting.value,
              k: isRecording.value && !hasRecordingEnded.value ? 1 : "",
              l: hasRecordingEnded.value ? 1 : "",
              m: isSubmitting.value && !isRecording.value ? 1 : "",
              n: isAnalyzing.value ? 1 : "",
              o: e.o(onMicTap, "e5"),
              p: !isRecording.value && !isSubmitting.value,
            },
            isRecording.value || isSubmitting.value
              ? ((isRecording.value && !hasRecordingEnded.value) ||
                  hasRecordingEnded.value ||
                  (isSubmitting.value && !isAnalyzing.value) ||
                  isAnalyzing.value,
                {})
              : {},
            {
              q: isRecording.value && !hasRecordingEnded.value,
              r: hasRecordingEnded.value,
              s: isSubmitting.value && !isAnalyzing.value,
              t: isAnalyzing.value,
              v: isSubmitting.value && !isAnalyzing.value,
            },
            isSubmitting.value && !isAnalyzing.value ? { w: e.o(resumeRecording, "2f"), x: e.o(stopAndAnalyze, "5b") } : {},
            { y: isAnalyzing.value },
            (isAnalyzing.value, {}),
          )
      );
    },
  }),
  v = e._export_sfc(pageComponent, [["__scopeId", "data-v-70350287"]]);
wx.createPage(v);
