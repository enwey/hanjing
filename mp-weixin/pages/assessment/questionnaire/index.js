"use strict";
const e = require("../../../common/vendor.js"),
  n = require("../../../stores/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  r = e.defineComponent({
    __name: "index",
    setup(t) {
      const r = n.useAssessmentStore();
      const api = require("../../../api/index.js");
      const familyMembers = e.ref([]);
      const memberNames = e.ref([]);
      const memberIndex = e.ref(0);
      const selectedMemberName = e.ref("本人");
      const selectedMemberId = e.ref("");

      async function loadFamilyMembers() {
        try {
          const res = await api.getFamilyMembers();
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

      function s() {
        r.prev();
      }
      function u() {
        r.currentQuestion < r.totalQuestions - 1 && r.next();
      }
      async function o() {
        try {
          (await r.submit(selectedMemberId.value),
            e.index.navigateTo({ url: "/pages/assessment/result/index" }));
        } catch (n) {
          e.index.showToast({ title: "提交失败，请重试", icon: "none" });
        }
      }
      function i() {
        e.index.navigateBack({ delta: 1 });
      }
      return (
        e.onMounted(async () => {
          await loadFamilyMembers();
          await r.fetchQuestions();
        }),
        (n, t) =>
          e.e(
            {
              a: e.o(i, "98"),
              b: e.p({ title: "ESS嗜睡量表", showBack: !0 }),
              memberNames: e.unref(memberNames),
              memberIndex: e.unref(memberIndex),
              selectedMemberName: e.unref(selectedMemberName),
              onMemberChange: e.o(onMemberChange),
              c: 100 * e.unref(r).progress + "%",
              d: e.t(e.unref(r).currentQuestion + 1),
              e: e.t(e.unref(r).totalQuestions),
              f: e.unref(r).questions.length > 0,
            },
            e.unref(r).questions.length > 0
              ? {
                  g: e.t(
                    e.unref(r).questions[e.unref(r).currentQuestion].emoji,
                  ),
                  h: e.t(e.unref(r).questions[e.unref(r).currentQuestion].id),
                  i: e.t(
                    e.unref(r).questions[e.unref(r).currentQuestion].situation,
                  ),
                  j: e.t(e.unref(r).questions[e.unref(r).currentQuestion].hint),
                  k: e.f(
                    [
                      { score: 0, label: "从不打瞌睡", emoji: "😀" },
                      { score: 1, label: "轻度可能", emoji: "🙂" },
                      { score: 2, label: "中度可能", emoji: "😐" },
                      { score: 3, label: "高度可能", emoji: "😴" },
                    ],
                    (n, t, s) =>
                      e.e(
                        {
                          a: e.t(n.emoji),
                          b: e.t(n.label),
                          c:
                            e.unref(r).answers[e.unref(r).currentQuestion] ===
                            n.score,
                        },
                        (e.unref(r).answers[e.unref(r).currentQuestion],
                        n.score,
                        {}),
                        {
                          d:
                            e.unref(r).answers[e.unref(r).currentQuestion] ===
                            n.score
                              ? 1
                              : "",
                          e: n.score,
                          f:
                            e.unref(r).answers[e.unref(r).currentQuestion] ===
                            n.score
                              ? 1
                              : "",
                          g: e.o((e) => {
                            return ((t = n.score), void r.selectAnswer(t));
                            var t;
                          }, n.score),
                        },
                      ),
                  ),
                }
              : {},
            {
              l: e.f(e.unref(r).totalQuestions, (n, t, s) => ({
                a: n,
                b: e.unref(r).answers[n - 1] >= 0 ? 1 : "",
                c: n - 1 === e.unref(r).currentQuestion ? 1 : "",
                d: e.o((t) => e.unref(r).goToQuestion(n - 1), n),
              })),
              m: e.unref(r).currentQuestion > 0,
            },
            e.unref(r).currentQuestion > 0 ? { n: e.o(s, "18") } : {},
            { o: e.unref(r).currentQuestion < e.unref(r).totalQuestions - 1 },
            e.unref(r).currentQuestion < e.unref(r).totalQuestions - 1
              ? { p: e.o(u, "0a") }
              : {},
            {
              q:
                e.unref(r).currentQuestion === e.unref(r).totalQuestions - 1 &&
                e.unref(r).answers.every((e) => e >= 0),
            },
            e.unref(r).currentQuestion === e.unref(r).totalQuestions - 1 &&
              e.unref(r).answers.every((e) => e >= 0)
              ? { r: e.o(o, "03") }
              : {},
          )
      );
    },
  }),
  s = e._export_sfc(r, [["__scopeId", "data-v-c4ff781e"]]);
wx.createPage(s);
