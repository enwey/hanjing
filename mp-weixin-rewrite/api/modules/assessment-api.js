const { request } = require('../request');

function getAssessments() {
  return request({ url: '/assessments', method: 'GET', failMessage: '加载评估记录失败' });
}

function getESSQuestions() {
  return request({ url: '/assessments/ess-questions', method: 'GET', failMessage: '加载量表题目失败' });
}

function submitESS(data) {
  return request({ url: '/assessments/ess', method: 'POST', data, failMessage: '提交 ESS 评估失败' });
}

function submitSnoreRecording(data) {
  return request({ url: '/assessments/snore', method: 'POST', data, failMessage: '提交鼾声录音失败' });
}

function getSnoreAnalysis(assessmentId) {
  return request({ url: '/assessments/snore-analysis/' + assessmentId, method: 'GET', failMessage: '加载鼾声分析失败' });
}

function getAssessmentDetail(assessmentId) {
  return request({ url: '/assessments/snore-analysis/' + assessmentId, method: 'GET', failMessage: '加载评估详情失败' });
}

module.exports = {
  getAssessments,
  getESSQuestions,
  submitESS,
  submitSnoreRecording,
  getSnoreAnalysis,
  getAssessmentDetail
};
