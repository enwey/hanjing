const fs = require('fs');
const path = require('path');

const uiPath = '/Users/apple/Desktop/WorkSpace/hanjing/UI';
const pagesPath = path.join(uiPath, 'pages');

if (!fs.existsSync(pagesPath)) {
  fs.mkdirSync(pagesPath, { recursive: true });
}

// Global WXSS-like styles converted to CSS
const cssCommon = `
:root {
  --color-primary: #3B6BF5;
  --color-primary-gradient: linear-gradient(135deg, #3B6BF5 0%, #5A85F5 50%, #8EAFFF 100%);
  --color-primary-dark: #1A3580;
  --color-secondary: #1A9D5C;
  --color-bg: #F9FAFB;
  --color-card-bg: #FFFFFF;
  --color-text-main: #1F2937;
  --color-text-sub: #6B7280;
  --color-text-muted: #9CA3AF;
  --color-gold: #F59E0B;
  --color-red: #EF4444;
  --color-border: #E5E7EB;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.08);
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', sans-serif;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--color-bg);
  font-family: var(--font-family);
  color: var(--color-text-main);
  -webkit-font-smoothing: antialiased;
}

/* App Shell container to simulate mobile app */
.app-screen {
  width: 100%;
  max-width: 375px;
  min-height: 812px;
  background-color: var(--color-bg);
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  margin: 0 auto;
  overflow: hidden;
  padding-bottom: 64px; /* Space for TabBar */
}

/* WeChat-style header */
.wechat-header {
  background-color: #ffffff;
  color: #1f2937;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}
.wechat-header.transparent {
  background: transparent;
  color: #ffffff;
  box-shadow: none;
}
.status-bar {
  height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 600;
}
.status-bar-icons {
  display: flex;
  gap: 6px;
  align-items: center;
}
.nav-bar {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  position: relative;
}
.nav-back {
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  width: 40px;
}
.nav-title {
  font-size: 17px;
  font-weight: 700;
  flex: 1;
  text-align: center;
}
.nav-capsule {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 99px;
  padding: 5px 10px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
  width: 64px;
  justify-content: space-around;
}
.wechat-header.transparent .nav-capsule {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.15);
}
.capsule-dot {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
}
.capsule-circle {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.capsule-circle-inner {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
}

/* WeChat TabBar */
.wechat-tabbar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 375px;
  height: 56px;
  background-color: #ffffff;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 100;
  box-sizing: border-box;
}
.tabbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 500;
  gap: 3px;
}
.tabbar-item.active {
  color: var(--color-primary);
}
.tabbar-icon {
  font-size: 20px;
}

/* Common UI Elements */
.card {
  background: var(--color-card-bg);
  border-radius: var(--radius-lg);
  padding: 16px;
  margin: 12px 16px;
  box-shadow: var(--shadow-sm);
  border: 1px solid rgba(0,0,0,0.015);
}
.flex-row {
  display: flex;
  flex-direction: row;
}
.flex-col {
  display: flex;
  flex-direction: column;
}
.align-center {
  align-items: center;
}
.justify-between {
  justify-content: space-between;
}
.gap-2 {
  gap: 8px;
}
.gap-3 {
  gap: 12px;
}
.btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  padding: 12px 20px;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}
.btn:hover {
  background: #2a52d4;
}
.btn-outline {
  background: #ffffff;
  color: var(--color-text-main);
  border: 1px solid var(--color-border);
}
.btn-outline:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  background: var(--color-bg);
  color: var(--color-text-sub);
}
.tag-blue {
  background: #EEF4FF;
  color: var(--color-primary);
}
.tag-green {
  background: #EDFBF5;
  color: var(--color-secondary);
}
.tag-gold {
  background: #FFFBEB;
  color: var(--color-gold);
}

/* Micro-animations */
.hover-scale {
  transition: transform 0.2s;
}
.hover-scale:hover {
  transform: translateY(-2px);
}
`;

const pages = {};

// 1. HOME PAGE
pages['home'] = {
  title: '首页',
  body: `
    <div class="app-screen">
      <!-- Transparent Header since we have top gradient -->
      <div class="wechat-header transparent">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <div class="nav-back"></div>
          <div class="nav-title">鼾静健康诊所</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(255,255,255,0.2)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <!-- Top gradient hero section -->
      <div style="background: linear-gradient(160deg, var(--color-primary-dark) 0%, var(--color-primary) 60%, #5A85F5 100%); margin-top: -88px; padding: 108px 20px 40px; color: white; border-bottom-left-radius: 30px; border-bottom-right-radius: 30px;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 800;">鼾静健康诊所</h1>
        <p style="margin: 6px 0 20px; font-size: 13px; color: rgba(255,255,255,0.8);">专注睡眠呼吸健康 · 让每个夜晚安宁无声</p>
        
        <div class="flex-row justify-between" style="background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); border-radius: var(--radius-lg); padding: 14px 20px;">
          <div class="flex-col align-center">
            <span style="font-size: 20px; font-weight: 800;">12,850+</span>
            <span style="font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 2px;">累计接诊</span>
          </div>
          <div style="width: 1px; background: rgba(255,255,255,0.2);"></div>
          <div class="flex-col align-center">
            <span style="font-size: 20px; font-weight: 800;">99.2%</span>
            <span style="font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 2px;">好评率</span>
          </div>
          <div style="width: 1px; background: rgba(255,255,255,0.2);"></div>
          <div class="flex-col align-center">
            <span style="font-size: 20px; font-weight: 800;">3家</span>
            <span style="font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 2px;">直营中心</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="card flex-row justify-between" style="margin-top: -20px; position: relative; z-index: 10; padding: 16px 10px;">
        <a href="appointment.html" class="flex-col align-center hover-scale" style="text-decoration:none; flex:1;">
          <div style="width:48px; height:48px; background:#EEF4FF; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:8px;">📅</div>
          <span style="font-size:12px; color:var(--color-text-main); font-weight:600;">预约挂号</span>
        </a>
        <a href="assessment.html" class="flex-col align-center hover-scale" style="text-decoration:none; flex:1;">
          <div style="width:48px; height:48px; background:#EDFBF5; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:8px;">📊</div>
          <span style="font-size:12px; color:var(--color-text-main); font-weight:600;">睡眠评估</span>
        </a>
        <a href="treatment.html" class="flex-col align-center hover-scale" style="text-decoration:none; flex:1;">
          <div style="width:48px; height:48px; background:#FFFBEB; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:8px;">💊</div>
          <span style="font-size:12px; color:var(--color-text-main); font-weight:600;">治疗追踪</span>
        </a>
        <a href="profile_medical_records.html" class="flex-col align-center hover-scale" style="text-decoration:none; flex:1;">
          <div style="width:48px; height:48px; background:#FEF2F2; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:8px;">📋</div>
          <span style="font-size:12px; color:var(--color-text-main); font-weight:600;">我的病历</span>
        </a>
      </div>

      <!-- Recommended Doctors -->
      <div style="padding: 10px 16px 0;">
        <div class="flex-row justify-between align-center" style="margin-bottom:12px;">
          <h3 style="margin:0; font-size:17px; font-weight:800; color:var(--color-text-main);">专家推荐</h3>
          <a href="appointment.html" style="font-size:13px; color:var(--color-primary); text-decoration:none; font-weight:600;">全部 ›</a>
        </div>
        
        <!-- Doctor 1 -->
        <div class="card flex-row hover-scale" style="margin: 0 0 12px; padding:16px;">
          <div style="width:56px; height:56px; border-radius:50%; background: linear-gradient(135deg, var(--color-primary), #8EAFFF); display:flex; align-items:center; justify-content:center; color:white; font-size:20px; font-weight:700; margin-right:12px;">李</div>
          <div class="flex-col" style="flex:1;">
            <div class="flex-row align-center justify-between">
              <div class="flex-row align-center gap-2">
                <span style="font-size:16px; font-weight:700;">李明辉</span>
                <span class="tag tag-gold" style="font-size:9px; padding:1px 4px;">主任医师</span>
              </div>
              <span style="font-size:12px; color:var(--color-primary); font-weight:700;">⭐ 4.9</span>
            </div>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">原深圳市人民医院 · 睡眠呼吸科</span>
            <div class="flex-row gap-2" style="margin-top:8px;">
              <span class="tag tag-blue" style="font-size:9px;">睡眠呼吸暂停</span>
              <span class="tag tag-blue" style="font-size:9px;">下颌前移治疗</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recommended Stores -->
      <div style="padding: 10px 16px 20px;">
        <div class="flex-row justify-between align-center" style="margin-bottom:12px;">
          <h3 style="margin:0; font-size:17px; font-weight:800; color:var(--color-text-main);">诊所门店</h3>
        </div>
        
        <!-- Store 1 -->
        <div class="card flex-row hover-scale" style="margin: 0; padding:16px;">
          <div style="width:60px; height:60px; background:#F3F4F6; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:28px; margin-right:12px;">🏥</div>
          <div class="flex-col" style="flex:1;">
            <div class="flex-row justify-between align-center">
              <span style="font-size:15px; font-weight:700;">深圳旗舰中心</span>
              <span class="tag tag-green" style="font-size:9px; padding:2px 6px;">营业中</span>
            </div>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">📍 福田区卓越世纪中心1号楼18层</span>
            <div class="flex-row justify-between align-center" style="margin-top:8px; font-size:11px; color:var(--color-text-muted);">
              <span>👨‍⚕️ 6位在诊专家</span>
              <span>🕐 09:00-18:00</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TabBar Navigation -->
      <div class="wechat-tabbar">
        <a href="home.html" class="tabbar-item active">
          <div class="tabbar-icon">🏠</div>
          <span>首页</span>
        </a>
        <a href="appointment.html" class="tabbar-item">
          <div class="tabbar-icon">📅</div>
          <span>预约</span>
        </a>
        <a href="treatment.html" class="tabbar-item">
          <div class="tabbar-icon">💊</div>
          <span>治疗</span>
        </a>
        <a href="product.html" class="tabbar-item">
          <div class="tabbar-icon">🛍️</div>
          <span>商城</span>
        </a>
        <a href="profile.html" class="tabbar-item">
          <div class="tabbar-icon">👤</div>
          <span>我的</span>
        </a>
      </div>
    </div>
  `
};

// 2. APPOINTMENT HOME
pages['appointment'] = {
  title: '预约挂号',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <div class="nav-back"></div>
          <div class="nav-title">选择医生挂号</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <!-- Filter tabs -->
      <div class="flex-row justify-between align-center" style="background:#ffffff; padding: 12px 20px; border-bottom:1px solid var(--color-border); font-size:14px; font-weight:600; color:var(--color-text-sub);">
        <a href="store_select.html" style="text-decoration:none; color:inherit;" class="flex-row align-center gap-2">深圳旗舰中心 ▾</a>
        <span>全部科室 ▾</span>
        <span>智能排序 ▾</span>
      </div>

      <!-- Search bar -->
      <div style="padding:12px 16px 4px;">
        <input type="text" placeholder="🔍 搜索专家、科室、疾病" style="width:100%; border:none; padding:10px 14px; background:#E5E7EB; border-radius:10px; font-size:13px; box-sizing:border-box; outline:none;" />
      </div>

      <!-- Doctors list -->
      <div style="flex:1; overflow-y:auto; padding-bottom:20px;">
        <!-- Doctor 1 -->
        <a href="doctor_detail.html" class="card flex-row hover-scale" style="text-decoration:none; margin:12px 16px 0; color:inherit;">
          <div style="width:56px; height:56px; border-radius:50%; background: linear-gradient(135deg, var(--color-primary), #8EAFFF); display:flex; align-items:center; justify-content:center; color:white; font-size:20px; font-weight:700; margin-right:12px;">李</div>
          <div class="flex-col" style="flex:1;">
            <div class="flex-row justify-between align-center">
              <div class="flex-row align-center gap-2">
                <span style="font-size:16px; font-weight:700;">李明辉</span>
                <span class="tag tag-gold" style="font-size:9px; padding:1px 4px;">主任医师</span>
              </div>
              <span class="btn" style="padding:4px 12px; font-size:12px; border-radius:6px; font-weight:600;">挂号</span>
            </div>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">原深圳市人民医院 · 22年经验</span>
            <span style="font-size:11px; color:var(--color-text-muted); margin-top:6px;">⭐ 4.9 (326条评价) · 已接诊 1万+</span>
            <div class="flex-row gap-2" style="margin-top:8px;">
              <span class="tag tag-blue" style="font-size:9px;">睡眠呼吸暂停</span>
              <span class="tag tag-blue" style="font-size:9px;">鼾症非手术</span>
            </div>
          </div>
        </a>

        <!-- Doctor 2 -->
        <a href="doctor_detail.html" class="card flex-row hover-scale" style="text-decoration:none; margin:12px 16px 0; color:inherit;">
          <div style="width:56px; height:56px; border-radius:50%; background: linear-gradient(135deg, var(--color-secondary), #ACEAC8); display:flex; align-items:center; justify-content:center; color:white; font-size:20px; font-weight:700; margin-right:12px;">王</div>
          <div class="flex-col" style="flex:1;">
            <div class="flex-row justify-between align-center">
              <div class="flex-row align-center gap-2">
                <span style="font-size:16px; font-weight:700;">王芳</span>
                <span class="tag tag-gold" style="font-size:9px; padding:1px 4px;">副主任医师</span>
              </div>
              <span class="btn" style="padding:4px 12px; font-size:12px; border-radius:6px; font-weight:600;">挂号</span>
            </div>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">原北京大学深圳医院 · 15年经验</span>
            <span style="font-size:11px; color:var(--color-text-muted); margin-top:6px;">⭐ 4.8 (218条评价) · 已接诊 6.5k</span>
            <div class="flex-row gap-2" style="margin-top:8px;">
              <span class="tag tag-blue" style="font-size:9px;">口腔矫治器</span>
              <span class="tag tag-blue" style="font-size:9px;">儿童鼾症</span>
            </div>
          </div>
        </a>
      </div>

      <!-- TabBar Navigation -->
      <div class="wechat-tabbar">
        <a href="home.html" class="tabbar-item">
          <div class="tabbar-icon">🏠</div>
          <span>首页</span>
        </a>
        <a href="appointment.html" class="tabbar-item active">
          <div class="tabbar-icon">📅</div>
          <span>预约</span>
        </a>
        <a href="treatment.html" class="tabbar-item">
          <div class="tabbar-icon">💊</div>
          <span>治疗</span>
        </a>
        <a href="product.html" class="tabbar-item">
          <div class="tabbar-icon">🛍️</div>
          <span>商城</span>
        </a>
        <a href="profile.html" class="tabbar-item">
          <div class="tabbar-icon">👤</div>
          <span>我的</span>
        </a>
      </div>
    </div>
  `
};

// 3. TREATMENT TRACKING
pages['treatment'] = {
  title: '治疗追踪',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <div class="nav-back"></div>
          <div class="nav-title">我的治疗追踪</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div style="flex:1; overflow-y:auto; padding-bottom:20px;">
        <!-- Device Connection Info Card -->
        <div class="card flex-row align-center justify-between" style="background:linear-gradient(135deg, var(--color-primary-dark), var(--color-primary)); color:white;">
          <div class="flex-col">
            <span style="font-size:16px; font-weight:700;">阻鼾器 HJ-MAD-03</span>
            <span style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:4px;">🔋 剩余电量 92% · 正常工作</span>
          </div>
          <a href="treatment_adjust_detail.html" style="background:rgba(255,255,255,0.2); border-radius:30px; font-size:11px; font-weight:600; padding:4px 12px; color:white; text-decoration:none;">微调记录</a>
        </div>

        <!-- Today Stats Info -->
        <div class="card flex-row justify-between" style="margin-top:0;">
          <div class="flex-col" style="flex:1; border-right:1px solid var(--color-border); padding-right:10px;">
            <span style="font-size:12px; color:var(--color-text-sub);">昨晚佩戴时长</span>
            <span style="font-size:24px; font-weight:800; color:var(--color-primary); margin-top:6px;">7.2 <span style="font-size:12px; font-weight:600; color:var(--color-text-sub);">小时</span></span>
            <span class="tag tag-green" style="font-size:9px; margin-top:8px; align-self:flex-start;">达标 (>=6小时)</span>
          </div>
          <div class="flex-col" style="flex:1; padding-left:20px;">
            <span style="font-size:12px; color:var(--color-text-sub);">AHI指数 (暂停频率)</span>
            <span style="font-size:24px; font-weight:800; color:var(--color-secondary); margin-top:6px;">5.8 <span style="font-size:12px; font-weight:600; color:var(--color-text-sub);">次/时</span></span>
            <span class="tag tag-green" style="font-size:9px; margin-top:8px; align-self:flex-start;">轻度/正常</span>
          </div>
        </div>

        <!-- Chart block -->
        <div class="card flex-col">
          <div class="flex-row justify-between align-center" style="margin-bottom:16px;">
            <span style="font-size:15px; font-weight:800;">睡眠戴镜趋势</span>
            <a href="treatment_sleep_trend.html" style="font-size:12px; color:var(--color-primary); text-decoration:none; font-weight:600;">详细报表</a>
          </div>
          <!-- Bar chart representation -->
          <div class="flex-row align-end justify-between" style="height:120px; padding: 0 10px 8px; border-bottom:1px solid var(--color-border);">
            <div class="flex-col align-center"><div style="height:80px; width:16px; background:var(--color-primary); border-radius:4px 4px 0 0;"></div><span style="font-size:10px; color:var(--color-text-sub); margin-top:6px;">周一</span></div>
            <div class="flex-col align-center"><div style="height:92px; width:16px; background:var(--color-primary); border-radius:4px 4px 0 0;"></div><span style="font-size:10px; color:var(--color-text-sub); margin-top:6px;">周二</span></div>
            <div class="flex-col align-center"><div style="height:65px; width:16px; background:var(--color-primary); border-radius:4px 4px 0 0;"></div><span style="font-size:10px; color:var(--color-text-sub); margin-top:6px;">周三</span></div>
            <div class="flex-col align-center"><div style="height:102px; width:16px; background:var(--color-primary); border-radius:4px 4px 0 0;"></div><span style="font-size:10px; color:var(--color-text-sub); margin-top:6px;">周四</span></div>
            <div class="flex-col align-center"><div style="height:85px; width:16px; background:var(--color-primary); border-radius:4px 4px 0 0;"></div><span style="font-size:10px; color:var(--color-text-sub); margin-top:6px;">周五</span></div>
            <div class="flex-col align-center"><div style="height:90px; width:16px; background:var(--color-primary); border-radius:4px 4px 0 0;"></div><span style="font-size:10px; color:var(--color-text-sub); margin-top:6px;">周六</span></div>
            <div class="flex-col align-center"><div style="height:98px; width:16px; background:var(--color-primary); border-radius:4px 4px 0 0;"></div><span style="font-size:10px; color:var(--color-text-sub); margin-top:6px;">周日</span></div>
          </div>
        </div>

        <!-- Medical Advice Timeline link -->
        <a href="treatment_timeline.html" class="card flex-row justify-between align-center hover-scale" style="text-decoration:none; color:inherit;">
          <div class="flex-col">
            <span style="font-size:15px; font-weight:700;">查看主治医生就诊建议</span>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">上一次微调前伸量 3.5mm · 王芳医生</span>
          </div>
          <span style="font-size:18px; color:var(--color-text-muted);">›</span>
        </a>
      </div>

      <!-- TabBar Navigation -->
      <div class="wechat-tabbar">
        <a href="home.html" class="tabbar-item">
          <div class="tabbar-icon">🏠</div>
          <span>首页</span>
        </a>
        <a href="appointment.html" class="tabbar-item">
          <div class="tabbar-icon">📅</div>
          <span>预约</span>
        </a>
        <a href="treatment.html" class="tabbar-item active">
          <div class="tabbar-icon">💊</div>
          <span>治疗</span>
        </a>
        <a href="product.html" class="tabbar-item">
          <div class="tabbar-icon">🛍️</div>
          <span>商城</span>
        </a>
        <a href="profile.html" class="tabbar-item">
          <div class="tabbar-icon">👤</div>
          <span>我的</span>
        </a>
      </div>
    </div>
  `
};

// 4. ASSESSMENT HOME
pages['assessment'] = {
  title: '就诊评估',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <div class="nav-back"></div>
          <div class="nav-title">睡眠呼吸健康自我评估</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div style="flex:1; overflow-y:auto; padding-bottom:20px;">
        <!-- Card 1: ESS Questionnaire -->
        <a href="assessment_questionnaire.html" class="card flex-row align-center hover-scale" style="text-decoration:none; color:inherit; padding:20px;">
          <div style="font-size:36px; margin-right:16px;">📋</div>
          <div class="flex-col" style="flex:1;">
            <span style="font-size:16px; font-weight:800; color:var(--color-text-main);">ESS 嗜睡自我量表评估</span>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">微信小程序量表自测，仅需2分钟</span>
          </div>
          <span style="font-size:18px; color:var(--color-text-muted);">›</span>
        </a>

        <!-- Card 2: AI Snore Recording -->
        <a href="assessment_recording.html" class="card flex-row align-center hover-scale" style="text-decoration:none; color:inherit; padding:20px;">
          <div style="font-size:36px; margin-right:16px;">🎙️</div>
          <div class="flex-col" style="flex:1;">
            <span style="font-size:16px; font-weight:800; color:var(--color-text-main);">AI 睡眠鼾声实时监测</span>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">开启麦克风记录睡眠呼吸与声音分析</span>
          </div>
          <span style="font-size:18px; color:var(--color-text-muted);">›</span>
        </a>

        <!-- History Results -->
        <div style="padding:10px 16px 0;">
          <h3 style="font-size:15px; font-weight:800; color:var(--color-text-main); margin-bottom:12px;">评估历史</h3>
          
          <a href="assessment_result.html" class="card flex-row justify-between align-center hover-scale" style="margin:0 0 12px; text-decoration:none; color:inherit; padding:14px 16px;">
            <div class="flex-col">
              <span style="font-size:14px; font-weight:700;">ESS 量表测评 (中度嗜睡)</span>
              <span style="font-size:11px; color:var(--color-text-muted); margin-top:4px;">测评得分: 12分 · 2026-06-01</span>
            </div>
            <span class="tag tag-gold" style="font-size:10px;">已评估</span>
          </a>

          <a href="assessment_snore_result.html" class="card flex-row justify-between align-center hover-scale" style="margin:0; text-decoration:none; color:inherit; padding:14px 16px;">
            <div class="flex-col">
              <span style="font-size:14px; font-weight:700;">AI 鼾声分析报告 (中危暂停风险)</span>
              <span style="font-size:11px; color:var(--color-text-muted); margin-top:4px;">平均分贝: 58dB · 2026-05-28</span>
            </div>
            <span class="tag tag-gold" style="font-size:10px;">已评估</span>
          </a>
        </div>
      </div>
    </div>
  `
};

// 5. PROFILE PAGE
pages['profile'] = {
  title: '个人中心',
  body: `
    <div class="app-screen">
      <div class="wechat-header transparent" style="background:#3B6BF5;">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <div class="nav-back"></div>
          <div class="nav-title" style="color:white;">我的</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(255,255,255,0.2)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <!-- Top profile card background -->
      <div style="background:#3B6BF5; padding: 20px 20px 48px; display:flex; align-items:center; color:white; border-bottom-left-radius: 20px; border-bottom-right-radius: 20px; margin-top:-1px;">
        <a href="profile_settings.html" style="text-decoration:none; color:inherit; display:flex; align-items:center; width:100%;">
          <div style="width:64px; height:64px; border-radius:50%; background:rgba(255,255,255,0.3); border:2px solid #ffffff; display:flex; align-items:center; justify-content:center; font-size:32px; font-weight:700; margin-right:16px;">张</div>
          <div class="flex-col" style="flex:1;">
            <span style="font-size:20px; font-weight:800;">张明华</span>
            <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
              <span class="tag tag-gold" style="font-size:9px; padding:1px 6px; background:#FFFBEB; color:#D97706;">黄金会员</span>
            </div>
          </div>
          <span style="font-size:20px;">›</span>
        </a>
      </div>

      <!-- Scrollable Menus -->
      <div style="flex:1; overflow-y:auto; padding-bottom:30px; margin-top:-24px; position:relative; z-index:10;">
        <!-- Health Section -->
        <div class="card flex-col" style="padding:4px 0;">
          <div style="padding: 12px 16px; font-size:12px; font-weight:800; color:var(--color-text-muted); border-bottom:1px solid var(--color-border);">我的健康</div>
          
          <a href="profile_medical_records.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit; border-bottom:1px solid var(--color-border);">
            <div class="flex-row align-center gap-3"><span>📋</span><span style="font-size:14px; font-weight:600;">就诊病历档案</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>

          <a href="profile_device_manage.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit; border-bottom:1px solid var(--color-border);">
            <div class="flex-row align-center gap-3"><span>💊</span><span style="font-size:14px; font-weight:600;">定制阻鼾器管理</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>

          <a href="profile_family_members.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit;">
            <div class="flex-row align-center gap-3"><span>👨‍👩‍👧</span><span style="font-size:14px; font-weight:600;">家庭就诊成员</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>
        </div>

        <!-- Service Section -->
        <div class="card flex-col" style="padding:4px 0; margin-top:0;">
          <div style="padding: 12px 16px; font-size:12px; font-weight:800; color:var(--color-text-muted); border-bottom:1px solid var(--color-border);">合伙服务</div>

          <a href="profile_member_benefits.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit; border-bottom:1px solid var(--color-border);">
            <div class="flex-row align-center gap-3"><span>👑</span><span style="font-size:14px; font-weight:600;">会员权益中心</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>

          <a href="order_index.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit; border-bottom:1px solid var(--color-border);">
            <div class="flex-row align-center gap-3"><span>📦</span><span style="font-size:14px; font-weight:600;">商城购物订单</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>

          <a href="distribution_center.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit;">
            <div class="flex-row align-center gap-3"><span>🔗</span><span style="font-size:14px; font-weight:600;">健康合伙人中心</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>
        </div>
      </div>

      <!-- TabBar Navigation -->
      <div class="wechat-tabbar">
        <a href="home.html" class="tabbar-item">
          <div class="tabbar-icon">🏠</div>
          <span>首页</span>
        </a>
        <a href="appointment.html" class="tabbar-item">
          <div class="tabbar-icon">📅</div>
          <span>预约</span>
        </a>
        <a href="treatment.html" class="tabbar-item">
          <div class="tabbar-icon">💊</div>
          <span>治疗</span>
        </a>
        <a href="product.html" class="tabbar-item">
          <div class="tabbar-icon">🛍️</div>
          <span>商城</span>
        </a>
        <a href="profile.html" class="tabbar-item active">
          <div class="tabbar-icon">👤</div>
          <span>我的</span>
        </a>
      </div>
    </div>
  `
};

// 6. LOGIN PAGE
pages['login'] = {
  title: '授权登录',
  body: `
    <div class="app-screen" style="background:linear-gradient(180deg, var(--color-primary-dark) 0%, #1e293b 100%);">
      <div class="wechat-header transparent">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <div class="nav-back">‹</div>
          <div class="nav-title">微信登录</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(255,255,255,0.2)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div class="flex-col align-center justify-between" style="flex:1; padding:60px 24px 40px; box-sizing:border-box;">
        <div class="flex-col align-center">
          <div style="width:80px; height:80px; background:rgba(255,255,255,0.1); border-radius:20px; display:flex; align-items:center; justify-content:center; font-size:48px; margin-bottom:20px;">💤</div>
          <h2 style="color:white; margin:0; font-size:22px; font-weight:800;">鼾静健康诊所</h2>
          <span style="color:rgba(255,255,255,0.6); font-size:12px; margin-top:8px;">授权微信，为您记录每一次安心好眠</span>
        </div>

        <div class="flex-col" style="width:100%; gap:16px;">
          <!-- WeChat login btn -->
          <button class="btn hover-scale" style="background:#1AAD19; width:100%; border-radius:24px; padding:14px; display:flex; align-items:center; justify-content:center; gap:8px;">
            <span style="font-size:20px;">💬</span>
            <span>微信一键授权登录</span>
          </button>
          
          <button class="btn btn-outline hover-scale" style="background:transparent; border-color:rgba(255,255,255,0.3); color:white; width:100%; border-radius:24px; padding:14px;">
            手机号短信验证登录
          </button>
        </div>

        <div style="font-size:11px; color:rgba(255,255,255,0.4); text-align:center; line-height:1.5;">
          登录即代表您同意并接受 <br />
          <a href="#" style="color:#5A85F5; text-decoration:none;">《鼾静隐私保护政策》</a> 与 <a href="#" style="color:#5A85F5; text-decoration:none;">《服务条款协议》</a>
        </div>
      </div>
    </div>
  `
};

// 7. DOCTOR DETAIL
pages['doctor_detail'] = {
  title: '医生详情',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <a href="appointment.html" class="nav-back" style="text-decoration:none; color:inherit;">‹</a>
          <div class="nav-title">医生详情</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div style="flex:1; overflow-y:auto; padding-bottom:40px;">
        <!-- Doctor info header -->
        <div class="card flex-row" style="margin-top:16px;">
          <div style="width:64px; height:64px; border-radius:50%; background: linear-gradient(135deg, var(--color-primary), #8EAFFF); display:flex; align-items:center; justify-content:center; color:white; font-size:24px; font-weight:700; margin-right:16px;">李</div>
          <div class="flex-col" style="flex:1;">
            <div class="flex-row align-center gap-2">
              <span style="font-size:18px; font-weight:800;">李明辉</span>
              <span class="tag tag-gold" style="font-size:9px;">主任医师</span>
            </div>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">临床工作22年 · 睡眠呼吸科</span>
            <span style="font-size:12px; color:var(--color-text-muted); margin-top:4px;">深圳市第二人民医院 / 门诊中心</span>
          </div>
        </div>

        <!-- Bio card -->
        <div class="card flex-col">
          <span style="font-size:14px; font-weight:800; color:var(--color-text-main); margin-bottom:8px;">专业擅长</span>
          <p style="margin:0; font-size:12px; color:var(--color-text-sub); line-height:1.6;">
            从事睡眠呼吸障碍诊疗20余年，擅长阻塞性睡眠呼吸暂停综合症（OSAS）的非手术治疗，尤其在各类阻鼾器的临床适配、前伸量调整与长期随访管理方面积累了丰富的临床经验。
          </p>
        </div>

        <!-- Booking schedule calendar -->
        <div class="card flex-col">
          <span style="font-size:14px; font-weight:800; color:var(--color-text-main); margin-bottom:12px;">选择预约时段</span>
          
          <div class="flex-row justify-between align-center" style="margin-bottom:12px;">
            <a href="time_select.html" class="flex-col align-center justify-center hover-scale" style="width:48px; height:58px; background:#EEF4FF; border-radius:8px; text-decoration:none; color:inherit;">
              <span style="font-size:10px; color:var(--color-primary); font-weight:600;">今天</span>
              <span style="font-size:14px; font-weight:800; margin-top:4px; color:var(--color-primary);">6/15</span>
              <span style="font-size:8px; color:var(--color-primary); margin-top:2px;">有号</span>
            </a>
            <a href="time_select.html" class="flex-col align-center justify-center hover-scale" style="width:48px; height:58px; background:#EEF4FF; border-radius:8px; text-decoration:none; color:inherit;">
              <span style="font-size:10px; color:var(--color-primary); font-weight:600;">周二</span>
              <span style="font-size:14px; font-weight:800; margin-top:4px; color:var(--color-primary);">6/16</span>
              <span style="font-size:8px; color:var(--color-primary); margin-top:2px;">有号</span>
            </a>
            <a href="time_select.html" class="flex-col align-center justify-center hover-scale" style="width:48px; height:58px; background:#F3F4F6; border-radius:8px; text-decoration:none; color:inherit;">
              <span style="font-size:10px; color:var(--color-text-sub); font-weight:600;">周三</span>
              <span style="font-size:14px; font-weight:800; margin-top:4px; color:var(--color-text-sub);">6/17</span>
              <span style="font-size:8px; color:var(--color-text-muted); margin-top:2px;">满诊</span>
            </a>
            <a href="time_select.html" class="flex-col align-center justify-center hover-scale" style="width:48px; height:58px; background:#EEF4FF; border-radius:8px; text-decoration:none; color:inherit;">
              <span style="font-size:10px; color:var(--color-primary); font-weight:600;">周四</span>
              <span style="font-size:14px; font-weight:800; margin-top:4px; color:var(--color-primary);">6/18</span>
              <span style="font-size:8px; color:var(--color-primary); margin-top:2px;">有号</span>
            </a>
            <a href="time_select.html" class="flex-col align-center justify-center hover-scale" style="width:48px; height:58px; background:#EEF4FF; border-radius:8px; text-decoration:none; color:inherit;">
              <span style="font-size:10px; color:var(--color-primary); font-weight:600;">周五</span>
              <span style="font-size:14px; font-weight:800; margin-top:4px; color:var(--color-primary);">6/19</span>
              <span style="font-size:8px; color:var(--color-primary); margin-top:2px;">有号</span>
            </a>
          </div>

          <a href="time_select.html" class="btn" style="text-decoration:none; margin-top:12px;">立即预约门诊</a>
        </div>
      </div>
    </div>
  `
};

// 8. STORE SELECT
pages['store_select'] = {
  title: '选择门店',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <a href="appointment.html" class="nav-back" style="text-decoration:none; color:inherit;">‹</a>
          <div class="nav-title">选择直营门店</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div style="flex:1; overflow-y:auto; padding-bottom:30px;">
        <!-- Store 1 -->
        <a href="appointment.html" class="card flex-row hover-scale" style="text-decoration:none; color:inherit; margin:16px 16px 0;">
          <div style="width:60px; height:60px; background:#F3F4F6; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:28px; margin-right:12px;">🏥</div>
          <div class="flex-col" style="flex:1;">
            <div class="flex-row justify-between align-center">
              <span style="font-size:15px; font-weight:700;">深圳旗舰中心</span>
              <span class="tag tag-green" style="font-size:9px; padding:2px 6px;">当前就诊</span>
            </div>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">📍 福田区卓越世纪中心1号楼18层</span>
            <div class="flex-row justify-between align-center" style="margin-top:8px; font-size:11px; color:var(--color-text-muted);">
              <span>🕐 09:00-18:00</span>
              <span>📞 0755-88886666</span>
            </div>
          </div>
        </a>

        <!-- Store 2 -->
        <a href="appointment.html" class="card flex-row hover-scale" style="text-decoration:none; color:inherit; margin:12px 16px 0;">
          <div style="width:60px; height:60px; background:#F3F4F6; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:28px; margin-right:12px;">🏥</div>
          <div class="flex-col" style="flex:1;">
            <div class="flex-row justify-between align-center">
              <span style="font-size:15px; font-weight:700;">南山分中心</span>
              <span class="tag tag-green" style="font-size:9px; padding:2px 6px; background:#EDFBF5; color:#1A9D5C;">营业中</span>
            </div>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:4px;">📍 南山区科兴科学园B栋2层</span>
            <div class="flex-row justify-between align-center" style="margin-top:8px; font-size:11px; color:var(--color-text-muted);">
              <span>🕐 09:00-17:30</span>
              <span>📞 0755-88887777</span>
            </div>
          </div>
        </a>
      </div>
    </div>
  `
};

// 9. TIME SELECT
pages['time_select'] = {
  title: '选择时段',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <a href="doctor_detail.html" class="nav-back" style="text-decoration:none; color:inherit;">‹</a>
          <div class="nav-title">选择预约时段</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div style="flex:1; overflow-y:auto; padding-bottom:30px;">
        <!-- Info summary -->
        <div class="card flex-row align-center" style="background:#EEF4FF; border:1px dashed var(--color-primary); margin-top:16px;">
          <div style="font-size:24px; margin-right:12px;">📅</div>
          <div class="flex-col">
            <span style="font-size:14px; font-weight:700; color:var(--color-primary);">您正在预约：李明辉 主任医师</span>
            <span style="font-size:12px; color:var(--color-text-sub); margin-top:2px;">就诊日期：2026年6月15日 (今天)</span>
          </div>
        </div>

        <!-- Time Grid -->
        <div style="padding:10px 16px 0;">
          <h3 style="font-size:14px; font-weight:800; color:var(--color-text-main); margin-bottom:12px;">上午时段</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:20px;">
            <a href="appointment_confirm.html" class="flex-col align-center justify-center hover-scale" style="background:white; border:1px solid var(--color-border); border-radius:8px; padding:10px; text-decoration:none; color:inherit;">
              <span style="font-size:14px; font-weight:700;">09:00</span>
              <span style="font-size:10px; color:var(--color-secondary); margin-top:2px;">可约</span>
            </a>
            <a href="appointment_confirm.html" class="flex-col align-center justify-center hover-scale" style="background:white; border:1px solid var(--color-border); border-radius:8px; padding:10px; text-decoration:none; color:inherit;">
              <span style="font-size:14px; font-weight:700;">09:30</span>
              <span style="font-size:10px; color:var(--color-secondary); margin-top:2px;">可约</span>
            </a>
            <div class="flex-col align-center justify-center" style="background:#F3F4F6; border:1px solid var(--color-border); border-radius:8px; padding:10px; color:var(--color-text-muted);">
              <span style="font-size:14px; font-weight:700;">10:00</span>
              <span style="font-size:10px; margin-top:2px;">约满</span>
            </div>
          </div>

          <h3 style="font-size:14px; font-weight:800; color:var(--color-text-main); margin-bottom:12px;">下午时段</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
            <a href="appointment_confirm.html" class="flex-col align-center justify-center hover-scale" style="background:white; border:1px solid var(--color-border); border-radius:8px; padding:10px; text-decoration:none; color:inherit;">
              <span style="font-size:14px; font-weight:700;">14:30</span>
              <span style="font-size:10px; color:var(--color-secondary); margin-top:2px;">可约</span>
            </a>
            <a href="appointment_confirm.html" class="flex-col align-center justify-center hover-scale" style="background:white; border:1px solid var(--color-border); border-radius:8px; padding:10px; text-decoration:none; color:inherit;">
              <span style="font-size:14px; font-weight:700;">15:00</span>
              <span style="font-size:10px; color:var(--color-secondary); margin-top:2px;">可约</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  `
};

// 10. APPOINTMENT CONFIRM
pages['appointment_confirm'] = {
  title: '预约确认',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <a href="time_select.html" class="nav-back" style="text-decoration:none; color:inherit;">‹</a>
          <div class="nav-title">确认挂号信息</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div style="flex:1; overflow-y:auto; padding-bottom:30px;">
        <!-- Details Card -->
        <div class="card flex-col" style="margin-top:16px;">
          <div class="flex-row align-center justify-between" style="border-bottom:1px solid var(--color-border); padding-bottom:12px; margin-bottom:12px;">
            <span style="font-size:16px; font-weight:800;">深圳旗舰中心</span>
            <span class="tag tag-blue" style="font-size:11px;">睡眠呼吸科</span>
          </div>
          
          <div class="flex-col gap-2" style="font-size:13px; color:var(--color-text-sub);">
            <div class="flex-row justify-between"><span>就诊专家:</span><span style="font-weight:700; color:var(--color-text-main);">李明辉 主任医师</span></div>
            <div class="flex-row justify-between"><span>就诊时间:</span><span style="font-weight:700; color:var(--color-text-main);">2026-06-15 (今天) 09:30</span></div>
            <div class="flex-row justify-between"><span>挂号服务费:</span><span style="font-weight:700; color:var(--color-primary);">¥ 200.00</span></div>
          </div>
        </div>

        <!-- Patient information selection -->
        <div class="card flex-col">
          <span style="font-size:14px; font-weight:800; color:var(--color-text-main); margin-bottom:12px;">选择就诊人</span>
          <div class="flex-row justify-between align-center" style="background:#F9FAFB; padding:10px; border-radius:8px; border:1px solid var(--color-border);">
            <div class="flex-col">
              <span style="font-size:14px; font-weight:700;">张明华 (本人)</span>
              <span style="font-size:11px; color:var(--color-text-muted); margin-top:2px;">身份证：4403**********1234</span>
            </div>
            <span style="color:var(--color-primary); font-size:12px; font-weight:700;">切换 ›</span>
          </div>
        </div>

        <div style="padding: 10px 16px;">
          <a href="appointment_success.html" class="btn" style="width:100%; display:block; text-decoration:none; box-sizing:border-box;">确认并在线支付 ¥200.00</a>
        </div>
      </div>
    </div>
  `
};

// 11. APPOINTMENT SUCCESS
pages['appointment_success'] = {
  title: '预约成功',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <div class="nav-back"></div>
          <div class="nav-title">预约挂号成功</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div class="flex-col align-center" style="flex:1; padding:40px 24px; box-sizing:border-box; justify-content:center;">
        <div style="width:64px; height:64px; background:#EDFBF5; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--color-secondary); font-size:32px; margin-bottom:16px;">✓</div>
        <h2 style="margin:0; font-size:20px; font-weight:800;">门诊预约成功</h2>
        <span style="color:var(--color-text-sub); font-size:12px; margin-top:6px;">就诊号：A012 · 准时签到就诊</span>

        <div class="card flex-col" style="width:100%; margin-top:24px; box-sizing:border-box;">
          <div class="flex-col gap-2" style="font-size:13px; color:var(--color-text-sub);">
            <div class="flex-row justify-between"><span>就诊专家:</span><span style="color:var(--color-text-main); font-weight:700;">李明辉 主任医师</span></div>
            <div class="flex-row justify-between"><span>就诊日期:</span><span style="color:var(--color-text-main); font-weight:700;">2026-06-15 (今天) 09:30</span></div>
            <div class="flex-row justify-between"><span>就诊中心:</span><span style="color:var(--color-text-main); font-weight:700;">深圳福田旗舰中心 18楼</span></div>
          </div>
        </div>

        <div class="flex-row gap-3" style="width:100%; margin-top:24px;">
          <a href="home.html" class="btn btn-outline" style="flex:1; text-decoration:none; text-align:center;">返回首页</a>
          <a href="profile_medical_records.html" class="btn" style="flex:1; text-decoration:none; text-align:center;">查看挂号</a>
        </div>
      </div>
    </div>
  `
};

// 12. ASSESSMENT QUESTIONNAIRE
pages['assessment_questionnaire'] = {
  title: 'ESS嗜睡评估',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <a href="assessment.html" class="nav-back" style="text-decoration:none; color:inherit;">‹</a>
          <div class="nav-title">ESS量表评估</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div style="flex:1; display:flex; flex-direction:column; padding:24px; box-sizing:border-box;">
        <!-- Progress bar -->
        <div class="flex-row justify-between align-center" style="margin-bottom:24px;">
          <span style="font-size:13px; color:var(--color-text-sub);">量表问答评估</span>
          <span style="font-size:13px; font-weight:700; color:var(--color-primary);">第 3 / 8 题</span>
        </div>
        <div style="height:6px; background:#E5E7EB; border-radius:99px; width:100%; margin-bottom:40px; overflow:hidden;">
          <div style="width:37.5%; height:100%; background:var(--color-primary); border-radius:99px;"></div>
        </div>

        <!-- Question content -->
        <div class="card" style="margin:0 0 40px 0; padding:24px; box-shadow:var(--shadow-md);">
          <h2 style="margin:0; font-size:18px; font-weight:800; line-height:1.5;">在公共场所坐着不动时（如在影剧院或会议室）是否瞌睡？</h2>
        </div>

        <!-- Answers / options -->
        <div class="flex-col gap-3">
          <a href="assessment_result.html" class="btn btn-outline hover-scale" style="text-decoration:none; text-align:left; padding:14px 20px; font-weight:600; font-size:14px; border-radius:12px;">0 - 从不瞌睡</a>
          <a href="assessment_result.html" class="btn btn-outline hover-scale" style="text-decoration:none; text-align:left; padding:14px 20px; font-weight:600; font-size:14px; border-radius:12px;">1 - 轻度打瞌睡</a>
          <a href="assessment_result.html" class="btn btn-outline hover-scale" style="text-decoration:none; text-align:left; padding:14px 20px; font-weight:600; font-size:14px; border-radius:12px;">2 - 中度打瞌睡</a>
          <a href="assessment_result.html" class="btn btn-outline hover-scale" style="text-decoration:none; text-align:left; padding:14px 20px; font-weight:600; font-size:14px; border-radius:12px;">3 - 重度打瞌睡</a>
        </div>
      </div>
    </div>
  `
};

// 13. ASSESSMENT RESULT
pages['assessment_result'] = {
  title: '评估结果',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <a href="assessment.html" class="nav-back" style="text-decoration:none; color:inherit;">‹</a>
          <div class="nav-title">嗜睡量表结果</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <div style="flex:1; overflow-y:auto; padding-bottom:30px;">
        <!-- Gauge card -->
        <div class="card flex-col align-center" style="margin-top:20px; padding:24px;">
          <span style="font-size:12px; color:var(--color-text-sub); text-transform:uppercase;">ESS 量表得分</span>
          <span style="font-size:48px; font-weight:800; color:var(--color-gold); margin-top:8px;">12 <span style="font-size:16px; font-weight:600; color:var(--color-text-sub);">分</span></span>
          <span class="tag tag-gold" style="font-size:11px; padding:3px 10px; margin-top:10px;">中度白天嗜睡 (Medium Risk)</span>
        </div>

        <!-- Explanation -->
        <div class="card flex-col">
          <span style="font-size:14px; font-weight:800; color:var(--color-text-main); margin-bottom:8px;">结果解析</span>
          <p style="margin:0; font-size:12px; color:var(--color-text-sub); line-height:1.6;">
            您的评分为12分，提示存在中度白天打瞌睡倾向。这常与夜间睡眠质量不佳、频繁发生睡眠呼吸暂停（OSAS）导致微觉醒和睡眠结构碎片化相关。建议结合医生临床诊断进行睡眠监测。
          </p>
        </div>

        <!-- Action suggestion card -->
        <div class="card flex-col align-center" style="background:#FFFBEB; border:1px solid #FCD34D;">
          <span style="font-size:15px; font-weight:800; color:#D97706;">建议预约医生挂号诊疗</span>
          <span style="font-size:11px; color:#D97706; text-align:center; margin-top:6px; line-height:1.4;">定制型下颌前移阻鼾器（HJ-MAD-03）可以有效防止舌后坠并消除鼾声，需门诊检查。</span>
          <a href="appointment.html" class="btn" style="background:#D97706; width:100%; margin-top:14px; text-decoration:none; text-align:center; box-sizing:border-box;">预约挂号专家</a>
        </div>
      </div>
    </div>
  `
};

// 14. MALL PRODUCT PAGE
pages['product'] = {
  title: '健康商城',
  body: `
    <div class="app-screen">
      <div class="wechat-header">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <div class="nav-back"></div>
          <div class="nav-title">健康商城</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(0,0,0,0.1)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <!-- Categories -->
      <div class="flex-row gap-3" style="background:#ffffff; padding:12px 16px; border-bottom:1px solid var(--color-border); font-size:13px; font-weight:700; color:var(--color-text-sub); overflow-x:auto;">
        <span style="color:var(--color-primary);">热门推荐</span>
        <span>专业阻鼾器</span>
        <span>配件耗材</span>
        <span>睡眠睡眠包</span>
      </div>

      <div style="flex:1; overflow-y:auto; padding: 12px 16px 30px;">
        <!-- Product Grid -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <!-- Item 1 -->
          <a href="product_detail.html" class="flex-col hover-scale" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:var(--shadow-sm); text-decoration:none; color:inherit;">
            <div style="height:140px; background:#F3F4F6; display:flex; align-items:center; justify-content:center; font-size:52px;">🛡️</div>
            <div class="flex-col" style="padding:10px;">
              <span style="font-size:13px; font-weight:700; color:var(--color-text-main); line-height:1.4; height:36px; overflow:hidden;">定制型下颌前移阻鼾器 HJ-MAD-03</span>
              <div class="flex-row justify-between align-center" style="margin-top:8px;">
                <span style="font-size:15px; font-weight:800; color:var(--color-primary);">¥ 2980</span>
                <span style="font-size:10px; color:var(--color-text-muted);">已售 1.2k</span>
              </div>
            </div>
          </a>

          <!-- Item 2 -->
          <a href="product_detail.html" class="flex-col hover-scale" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:var(--shadow-sm); text-decoration:none; color:inherit;">
            <div style="height:140px; background:#F3F4F6; display:flex; align-items:center; justify-content:center; font-size:52px;">🧼</div>
            <div class="flex-col" style="padding:10px;">
              <span style="font-size:13px; font-weight:700; color:var(--color-text-main); line-height:1.4; height:36px; overflow:hidden;">阻鼾器超声波清洗清洁消毒盒</span>
              <div class="flex-row justify-between align-center" style="margin-top:8px;">
                <span style="font-size:15px; font-weight:800; color:var(--color-primary);">¥ 298</span>
                <span style="font-size:10px; color:var(--color-text-muted);">已售 890</span>
              </div>
            </div>
          </a>
        </div>
      </div>

      <!-- TabBar Navigation -->
      <div class="wechat-tabbar">
        <a href="home.html" class="tabbar-item">
          <div class="tabbar-icon">🏠</div>
          <span>首页</span>
        </a>
        <a href="appointment.html" class="tabbar-item">
          <div class="tabbar-icon">📅</div>
          <span>预约</span>
        </a>
        <a href="treatment.html" class="tabbar-item">
          <div class="tabbar-icon">💊</div>
          <span>治疗</span>
        </a>
        <a href="product.html" class="tabbar-item active">
          <div class="tabbar-icon">🛍️</div>
          <span>商城</span>
        </a>
        <a href="profile.html" class="tabbar-item">
          <div class="tabbar-icon">👤</div>
          <span>我的</span>
        </a>
      </div>
    </div>
  `
};

// 15. PARTNER / DISTRIBUTION CENTER
pages['distribution_center'] = {
  title: '合伙人中心',
  body: `
    <div class="app-screen">
      <div class="wechat-header transparent" style="background:#1e293b;">
        <div class="status-bar">
          <span>09:41</span>
          <div class="status-bar-icons">📶 🛜 🔋</div>
        </div>
        <div class="nav-bar">
          <a href="profile.html" class="nav-back" style="text-decoration:none; color:white;">‹</a>
          <div class="nav-title" style="color:white;">健康合伙人</div>
          <div class="nav-capsule">
            <div class="capsule-dot"></div>
            <div class="nav-capsule-divider" style="width:1px; height:12px; background:rgba(255,255,255,0.2)"></div>
            <div class="capsule-circle"><div class="capsule-circle-inner"></div></div>
          </div>
        </div>
      </div>

      <!-- Partner Header card -->
      <div style="background:#1e293b; padding:20px 20px 48px; color:white; border-bottom-left-radius:20px; border-bottom-right-radius:20px; margin-top:-1px;">
        <div class="flex-row justify-between align-center">
          <div class="flex-col">
            <span style="font-size:12px; color:rgba(255,255,255,0.6);">可提现佣金 (元)</span>
            <span style="font-size:32px; font-weight:800; margin-top:8px;">1,250.00</span>
          </div>
          <a href="distribution_withdraw.html" style="background:var(--color-primary); color:white; border-radius:30px; font-size:12px; font-weight:700; padding:6px 16px; text-decoration:none;">提现</a>
        </div>
      </div>

      <div style="flex:1; overflow-y:auto; padding-bottom:30px; margin-top:-24px; position:relative; z-index:10;">
        <!-- Stats cards -->
        <div class="card flex-row justify-between" style="padding:16px;">
          <div class="flex-col" style="flex:1; border-right:1px solid var(--color-border); padding-right:10px;">
            <span style="font-size:11px; color:var(--color-text-sub);">累计收益</span>
            <span style="font-size:18px; font-weight:800; color:var(--color-text-main); margin-top:4px;">¥ 5,800.00</span>
          </div>
          <div class="flex-col" style="flex:1; padding-left:20px;">
            <span style="font-size:11px; color:var(--color-text-sub);">团队成员</span>
            <span style="font-size:18px; font-weight:800; color:var(--color-text-main); margin-top:4px;">12 人</span>
          </div>
        </div>

        <!-- Partner operations menu -->
        <div class="card flex-col" style="padding:4px 0;">
          <a href="distribution_commission.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit; border-bottom:1px solid var(--color-border);">
            <div class="flex-row align-center gap-3"><span>💰</span><span style="font-size:14px; font-weight:600;">推广佣金明细</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>

          <a href="distribution_products.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit; border-bottom:1px solid var(--color-border);">
            <div class="flex-row align-center gap-3"><span>🛍️</span><span style="font-size:14px; font-weight:600;">推广健康商品</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>

          <a href="distribution_invite.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit; border-bottom:1px solid var(--color-border);">
            <div class="flex-row align-center gap-3"><span>✉️</span><span style="font-size:14px; font-weight:600;">邀请好友合伙</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>

          <a href="distribution_rules.html" class="flex-row align-center justify-between hover-scale" style="padding:14px 16px; text-decoration:none; color:inherit;">
            <div class="flex-row align-center gap-3"><span>📖</span><span style="font-size:14px; font-weight:600;">合伙分销规则</span></div>
            <span style="color:var(--color-text-muted); font-size:16px;">›</span>
          </a>
        </div>
      </div>
    </div>
  `
};

// Build individual HTML files
Object.entries(pages).forEach(([name, page]) => {
  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${page.title} - 鼾静小程序</title>
<style>
${cssCommon}
</style>
</head>
<body>
${page.body}
</body>
</html>`;
  
  fs.writeFileSync(path.join(pagesPath, `${name}.html`), htmlContent);
  console.log(`Generated: UI/pages/${name}.html`);
});

// Generate Beautiful Showcase Dashboard
const showcaseHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>鼾静健康诊所 - 小程序高保真UI设计展示</title>
<style>
body {
  margin: 0;
  padding: 0;
  background-color: #0b0f19;
  color: #e2e8f0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.dashboard {
  display: flex;
  width: 100%;
  height: 100%;
}

.left-panel {
  width: 340px;
  background-color: #111827;
  border-right: 1px solid #1f2937;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 10;
}

.header {
  padding: 28px 24px;
  border-bottom: 1px solid #1f2937;
}

.header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #3b6bf5;
  letter-spacing: -0.02em;
}

.header p {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.menu-list {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
}

.menu-section-title {
  font-size: 11px;
  font-weight: 700;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 20px 0 8px 8px;
}

.menu-item {
  margin-bottom: 4px;
}

.menu-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 10px;
  color: #94a3b8;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}

.menu-link:hover {
  background-color: #1f2937;
  color: #f8fafc;
}

.menu-item.active .menu-link {
  background-color: #3b6bf5;
  color: #ffffff;
}

.menu-badge {
  font-size: 11px;
  color: #4b5563;
  font-weight: normal;
}

.menu-item.active .menu-badge {
  color: rgba(255,255,255,0.7);
}

.right-panel {
  flex: 1;
  background-color: #0b0f19;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.iphone-frame {
  width: 375px;
  height: 812px;
  border: 12px solid #1f2937;
  border-radius: 46px;
  background-color: #000;
  overflow: hidden;
  box-shadow: 0 30px 60px rgba(0,0,0,0.8), inset 0 0 4px rgba(255,255,255,0.1);
  position: relative;
}

/* Island Notch */
.iphone-frame::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  height: 28px;
  background-color: #1f2937;
  border-bottom-left-radius: 18px;
  border-bottom-right-radius: 18px;
  z-index: 1000;
}

iframe {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 34px;
  background-color: #f9fafb;
}

.bg-light-glow {
  position: absolute;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(59,107,245,0.1) 0%, transparent 70%);
  top: -100px;
  right: -100px;
  pointer-events: none;
  z-index: 1;
}

</style>
</head>
<body>

<div class="dashboard">
  <div class="left-panel">
    <div class="header">
      <h1>鼾静健康诊所</h1>
      <p>微信小程序高保真 UI 展示面板</p>
    </div>
    
    <ul class="menu-list">
      <div class="menu-section-title">核心一级页面</div>
      <li class="menu-item active" onclick="loadPage('home', this)">
        <a href="#" class="menu-link">
          <span>🏠 诊所首页</span>
          <span class="menu-badge">home.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('appointment', this)">
        <a href="#" class="menu-link">
          <span>📅 预约挂号</span>
          <span class="menu-badge">appointment.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('treatment', this)">
        <a href="#" class="menu-link">
          <span>💊 治疗追踪</span>
          <span class="menu-badge">treatment.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('product', this)">
        <a href="#" class="menu-link">
          <span>🛍️ 健康商城</span>
          <span class="menu-badge">product.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('profile', this)">
        <a href="#" class="menu-link">
          <span>👤 个人中心</span>
          <span class="menu-badge">profile.html</span>
        </a>
      </li>

      <div class="menu-section-title">挂号与就诊流</div>
      <li class="menu-item" onclick="loadPage('doctor_detail', this)">
        <a href="#" class="menu-link">
          <span>👨‍⚕️ 医生详情</span>
          <span class="menu-badge">doctor_detail.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('store_select', this)">
        <a href="#" class="menu-link">
          <span>🏥 选择门店</span>
          <span class="menu-badge">store_select.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('time_select', this)">
        <a href="#" class="menu-link">
          <span>🕐 选择时段</span>
          <span class="menu-badge">time_select.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('appointment_confirm', this)">
        <a href="#" class="menu-link">
          <span>📋 确认信息</span>
          <span class="menu-badge">appointment_confirm.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('appointment_success', this)">
        <a href="#" class="menu-link">
          <span>✓ 预约成功</span>
          <span class="menu-badge">appointment_success.html</span>
        </a>
      </li>

      <div class="menu-section-title">量表与评估</div>
      <li class="menu-item" onclick="loadPage('assessment', this)">
        <a href="#" class="menu-link">
          <span>📊 自我评估</span>
          <span class="menu-badge">assessment.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('assessment_questionnaire', this)">
        <a href="#" class="menu-link">
          <span>📝 答题评估</span>
          <span class="menu-badge">assessment_questionnaire.html</span>
        </a>
      </li>
      <li class="menu-item" onclick="loadPage('assessment_result', this)">
        <a href="#" class="menu-link">
          <span>📈 测评结果</span>
          <span class="menu-badge">assessment_result.html</span>
        </a>
      </li>

      <div class="menu-section-title">健康营销</div>
      <li class="menu-item" onclick="loadPage('distribution_center', this)">
        <a href="#" class="menu-link">
          <span>🔗 合伙人中心</span>
          <span class="menu-badge">distribution_center.html</span>
        </a>
      </li>

      <div class="menu-section-title">身份与安全</div>
      <li class="menu-item" onclick="loadPage('login', this)">
        <a href="#" class="menu-link">
          <span>🔑 授权登录</span>
          <span class="menu-badge">login.html</span>
        </a>
      </li>
    </ul>
  </div>

  <div class="right-panel">
    <div class="bg-light-glow"></div>
    <div class="iphone-frame">
      <iframe id="previewIframe" src="pages/home.html"></iframe>
    </div>
  </div>
</div>

<script>
function loadPage(pageName, el) {
  document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('previewIframe').src = 'pages/' + pageName + '.html';
}
</script>
</body>
</html>`;

fs.writeFileSync(path.join(uiPath, 'index.html'), showcaseHtml);
console.log('Successfully completed building all beautiful UI show cases.');
