"use strict";
const e = require("../../../common/vendor.js"),
  a = require("../../../api/index.js");
Math || l();
const l = () => "../../../components/base/hj-navbar.js",
  u = e.defineComponent({
    __name: "index",
    setup(l) {
      const u = e.ref(!1),
        v = e.ref(!1),
        n = e.ref(!1),
        t = e.ref(0),
        o = e.ref(!1);

      const familyMembers = e.ref([]);
      const memberNames = e.ref([]);
      const memberIndex = e.ref(0);
      const selectedMemberName = e.ref("本人");
      const selectedMemberId = e.ref("");
      const disabledSelector = e.computed(() => u.value || n.value || o.value);

      async function loadFamilyMembers() {
        try {
          const res = await a.getFamilyMembers();
          const list = res.data?.list || [];
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
      const recorderManager = wx.getRecorderManager();
      const tempFilePath = e.ref("");

      recorderManager.onStop((res) => {
        console.log("[RecorderManager] Stopped, tempFilePath:", res.tempFilePath);
        tempFilePath.value = res.tempFilePath;
        setTimeout(() => {
          d();
        }, 100);
      });
      recorderManager.onError((err) => {
        console.error("[RecorderManager] Error:", err);
      });

      const s = e.computed(() => {
          const e = Math.floor(t.value / 60),
            a = t.value % 60;
          return `${String(e).padStart(2, "0")}:${String(a).padStart(2, "0")}`;
        }),
        i = e.computed(() => {
          const e = [];
          for (let a = 0; a < 16; a++)
            u.value ? e.push(10 + Math.floor(40 * Math.random())) : e.push(6);
          return e;
        });

      function c() {
        wx.authorize({
          scope: "scope.record",
          success: () => {
            u.value = !0;
            v.value = !1;
            t.value = 0;
            r = setInterval(() => {
              t.value++;
            }, 1000);
            recorderManager.start({
              duration: 600000,
              sampleRate: 8000,
              numberOfChannels: 1,
              format: "pcm",
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

      function onMicTap() {
        if (u.value || n.value) {
          if (u.value) {
            r && clearInterval(r);
            u.value = !1;
            v.value = !1;
            n.value = !0;
            recorderManager.stop();
          }
        } else {
          c();
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

      async function d() {
        if (t.value < 5) {
          e.index.showToast({ title: "录音时间过短，分析前请至少录制5秒", icon: "none" });
          return;
        }
        o.value = !0;
        try {
          let analysisResult = null;
          if (tempFilePath.value) {
            try {
              const fs = wx.getFileSystemManager();
              const arrayBuffer = fs.readFileSync(tempFilePath.value);
              const pcmData = new Int16Array(arrayBuffer);
              analysisResult = analyzePcmOnClient(pcmData, t.value);
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
              duration: t.value,
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
          wx.setStorageSync('last_local_snore_result', localReport);
          const payload = { 
            duration: t.value,
            client_side_analysis: !0,
            analysis_result: analysisResult,
            timestamp: Date.now(),
            patientId: selectedMemberId.value
          };
          try {
            const l = (await a.submitSnoreRecording(payload)).data;
            if (l && l.id) {
              e.index.navigateTo({
                url: "/pages/assessment/snore-result/index?id=" + l.id,
              });
            } else {
              throw new Error("Invalid response");
            }
          } catch (uploadErr) {
            console.warn("[SnoreRecording] Upload failed, caching for silent retry:", uploadErr);
            const pending = wx.getStorageSync('pending_snore_uploads') || [];
            pending.push(payload);
            wx.setStorageSync('pending_snore_uploads', pending);
            e.index.showToast({ title: "已离线生成报告，联网后将自动同步", icon: "none", duration: 2500 });
            setTimeout(() => {
              e.index.navigateTo({
                url: "/pages/assessment/snore-result/index?id=local",
              });
            }, 1000);
          }
        } catch (l) {
          (console.error("[SnoreRecording] 提交失败", l),
            e.index.showToast({
              title: (l && l.message) || "分析失败，请重试",
              icon: "none",
            }));
        } finally {
          o.value = !1;
        }
      }

      e.onMounted(async () => {
        try {
          await loadFamilyMembers();
          await a.syncPendingSnoreRecordings();
        } catch (err) {
          console.error("Silent sync error:", err);
        }
      });

      return (
        e.onUnmounted(() => {
          r && clearInterval(r);
        }),
        (a, l) =>
          e.e(
            {
              memberNames: e.unref(memberNames),
              memberIndex: e.unref(memberIndex),
              selectedMemberName: e.unref(selectedMemberName),
              onMemberChange: e.o(onMemberChange),
              disabledSelector: e.unref(disabledSelector),
              a: e.p({ title: "AI鼾声分析", showBack: !0 }),
              b: u.value || n.value,
            },
            u.value || n.value
              ? {
                  c: e.f(i.value, (e, a, l) => ({
                    a: a,
                    b: e + "px",
                    c: 0.05 * a + "s",
                  })),
                  d: u.value && !v.value ? 1 : "",
                }
              : {},
            { e: u.value || n.value },
            u.value || n.value ? { f: e.t(s.value) } : {},
            { g: u.value && !v.value ? 1 : "", h: !u.value && !n.value },
            u.value || n.value ? (o.value || n.value, {}) : {},
            {
              i: o.value,
              j: n.value,
              k: u.value && !v.value ? 1 : "",
              l: v.value ? 1 : "",
              m: n.value && !u.value ? 1 : "",
              n: o.value ? 1 : "",
              o: e.o(onMicTap, "e5"),
              p: !u.value && !n.value,
            },
            u.value || n.value
              ? ((u.value && !v.value) ||
                  v.value ||
                  (n.value && !o.value) ||
                  o.value,
                {})
              : {},
            {
              q: u.value && !v.value,
              r: v.value,
              s: n.value && !o.value,
              t: o.value,
              v: n.value && !o.value,
            },
            n.value && !o.value ? { w: e.o(c, "2f"), x: e.o(d, "5b") } : {},
            { y: o.value },
            (o.value, {}),
          )
      );
    },
  }),
  v = e._export_sfc(u, [["__scopeId", "data-v-70350287"]]);
wx.createPage(v);
