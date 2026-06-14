const fs = require('fs');
const path = require('path');

const workspace = '/Users/apple/Desktop/WorkSpace/hanjing';
const mpWeixinPath = path.join(workspace, 'mp-weixin');
const uiPath = path.join(workspace, 'UI');

if (!fs.existsSync(uiPath)) {
  fs.mkdirSync(uiPath, { recursive: true });
}

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.includes('vendor.js')) {
    return {
      ref: (v) => ({ value: v }),
      computed: (fn) => ({ get value() { return fn(); } }),
      index: { getStorageSync: () => "", getWindowInfo: () => ({ statusBarHeight: 44 }) },
      defineComponent: (obj) => obj,
      _export_sfc: (c, p) => c
    };
  }
  if (id.includes('stores/index.js')) {
    return {
      useUserStore: () => ({ profile: null }),
      useStoreStore: () => ({ stores: [] }),
      useDoctorStore: () => ({ doctors: [] }),
      useAppointmentStore: () => ({})
    };
  }
  return originalRequire.apply(this, arguments);
};

// 1. Load mock data from mp-weixin/mock/index.js
function loadMocks() {
  const mockFilePath = path.join(mpWeixinPath, 'mock/index.js');
  if (!fs.existsSync(mockFilePath)) return {};
  try {
    return require(mockFilePath);
  } catch (err) {
    console.error('Failed to load mock/index.js via require', err);
    return {};
  }
}

const mocks = loadMocks();

// Extracted mock collections
const mockStores = mocks.mockStores || [
  { id: 'store-001', name: '鼾静健康·深圳旗舰中心', address: '深圳市福田区卓越世纪中心1号楼18层', phone: '0755-88886666', businessHours: '09:00-18:00', isOpen: true, tags: ['旗舰店', '地铁直达'], doctorCount: 6, deviceCount: 12 },
  { id: 'store-002', name: '鼾静健康·南山分中心', address: '深圳市南山区科兴科学园B栋2层', phone: '0755-88887777', businessHours: '09:00-17:30', isOpen: true, tags: ['科技园区', '免费停车'], doctorCount: 4, deviceCount: 8 }
];

const mockDoctors = mocks.mockDoctors || [
  { id: 'doc-001', name: '李明辉', title: '主任医师', specialty: '睡眠呼吸', experience: 22, rating: 4.9, reviewCount: 326, consultCount: 10280, expertise: ['睡眠呼吸暂停', '阻鼾器适配'] },
  { id: 'doc-002', name: '王芳', title: '副主任医师', specialty: '口腔正畸', experience: 15, rating: 4.8, reviewCount: 218, consultCount: 6520, expertise: ['口腔矫治器', '下颌前移控制'] }
];

// 2. Parse WXML into AST
function parseWxml(wxml) {
  wxml = wxml.replace(/<([\w-]+)([^>]*?)\/>/g, '<$1$2></$1>');
  
  let pos = 0;
  const len = wxml.length;
  
  function nextToken() {
    if (pos >= len) return null;
    
    if (wxml[pos] === '<') {
      if (wxml.substr(pos, 4) === '<!--') {
        const end = wxml.indexOf('-->', pos + 4);
        if (end === -1) {
          const t = { type: 'comment', content: wxml.substring(pos + 4) };
          pos = len;
          return t;
        }
        const t = { type: 'comment', content: wxml.substring(pos + 4, end) };
        pos = end + 3;
        return t;
      }
      
      const isClose = wxml[pos + 1] === '/';
      const startIdx = isClose ? pos + 2 : pos + 1;
      const endIdx = wxml.indexOf('>', startIdx);
      if (endIdx === -1) {
        pos = len;
        return null;
      }
      
      const tagContent = wxml.substring(startIdx, endIdx).trim();
      pos = endIdx + 1;
      
      if (isClose) {
        return { type: 'tag-close', tagName: tagContent };
      } else {
        const firstSpace = tagContent.search(/\s/);
        let tagName = tagContent;
        let attrsStr = '';
        if (firstSpace !== -1) {
          tagName = tagContent.substring(0, firstSpace);
          attrsStr = tagContent.substring(firstSpace).trim();
        }
        
        const attrs = {};
        const attrRegex = /([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
        let match;
        while ((match = attrRegex.exec(attrsStr)) !== null) {
          const name = match[1];
          const val = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : (match[4] !== undefined ? match[4] : 'true'));
          attrs[name] = val;
        }
        
        return { type: 'tag-open', tagName, attrs };
      }
    } else {
      const nextLT = wxml.indexOf('<', pos);
      if (nextLT === -1) {
        const t = { type: 'text', content: wxml.substring(pos) };
        pos = len;
        return t;
      }
      const t = { type: 'text', content: wxml.substring(pos, nextLT) };
      pos = nextLT;
      return t;
    }
  }
  
  const root = { type: 'element', tagName: 'root', attrs: {}, children: [] };
  const stack = [root];
  
  let token;
  while ((token = nextToken()) !== null) {
    if (token.type === 'tag-open') {
      const node = { type: 'element', tagName: token.tagName, attrs: token.attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (token.type === 'tag-close') {
      if (stack.length > 1 && stack[stack.length - 1].tagName === token.tagName) {
        stack.pop();
      } else {
        const idx = stack.map(s => s.tagName).lastIndexOf(token.tagName);
        if (idx > 0) {
          while (stack.length > idx) {
            stack.pop();
          }
        }
      }
    } else if (token.type === 'text') {
      if (token.content.trim() !== '') {
        stack[stack.length - 1].children.push({ type: 'text', content: token.content });
      }
    } else if (token.type === 'comment') {
      stack[stack.length - 1].children.push({ type: 'comment', content: token.content });
    }
  }
  
  return root.children;
}

// 3. Evaluate expressions in bindings
function evalExpression(expr, context) {
  expr = expr.trim();
  
  // Ternary cond ? val1 : val2
  const ternaryMatch = expr.match(/^([^?]+)\s*\?\s*([^:]+)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    const condStr = ternaryMatch[1].trim();
    const val1Str = ternaryMatch[2].trim();
    const val2Str = ternaryMatch[3].trim();
    const condVal = evalExpression(condStr, context);
    const resultStr = condVal ? val1Str : val2Str;
    if (resultStr.startsWith("'") && resultStr.endsWith("'")) return resultStr.slice(1, -1);
    if (resultStr.startsWith('"') && resultStr.endsWith('"')) return resultStr.slice(1, -1);
    return evalExpression(resultStr, context);
  }
  
  // Comparisons
  const compMatch = expr.match(/^([^\s=]+)\s*(==|===|!=|!==)\s*([^\s=]+)$/);
  if (compMatch) {
    const left = evalExpression(compMatch[1].trim(), context);
    const op = compMatch[2];
    let right = compMatch[3].trim();
    if (right.startsWith("'") && right.endsWith("'")) right = right.slice(1, -1);
    else if (right.startsWith('"') && right.endsWith('"')) right = right.slice(1, -1);
    else if (right === 'true') right = true;
    else if (right === 'false') right = false;
    else right = evalExpression(right, context);
    
    if (op === '==' || op === '===') return left === right;
    if (op === '!=' || op === '!==') return left !== right;
  }
  
  // Property path
  let parts = expr.split('.');
  let val = context;
  for (let part of parts) {
    if (val === null || val === undefined) return '';
    val = val[part];
  }
  return val === undefined ? '' : val;
}

function resolveInterpolation(str, context) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
    return evalExpression(expr, context);
  });
}

// 4. Component renderer
function renderComponent(tagName, attrs, context) {
  let props = {};
  if (tagName === 'hj-navbar') {
    const titleVal = resolveInterpolation(attrs['title'] || '', context);
    const showBackVal = attrs['show-back'] === 'true' || attrs['showBack'] === 'true';
    const transparent = attrs['transparent'] === 'true' || attrs['transparent'] === '{{true}}';
    props = { title: titleVal || context.pageTitle || '鼾静健康诊所', showBack: showBackVal, transparent };
    
    const wxmlPath = path.join(mpWeixinPath, 'components/base/hj-navbar.wxml');
    if (!fs.existsSync(wxmlPath)) return `<div class="hj-navbar-fallback">${props.title}</div>`;
    const wxml = fs.readFileSync(wxmlPath, 'utf8');
    const nodes = parseWxml(wxml);
    
    const isTabbar = ['pages/index/index', 'pages/appointment/index', 'pages/treatment/index', 'pages/product/index', 'pages/profile/index'].includes(context.pagePath);
    const shouldShowBack = props.showBack || !isTabbar;
    const n = 44;
    const compContext = {
      showNavbar: true,
      a: shouldShowBack,
      b: props.transparent ? '#FFFFFF' : '#1F2937',
      d: props.title,
      e: props.transparent ? '#FFFFFF' : '#1F2937',
      f: '44px',
      g: true,
      h: props.transparent,
      i: (n + 44) + 'px',
      j: n + 'px',
      k: props.transparent ? 'transparent' : '#FFFFFF',
      l: true,
      m: (n + 44) + 'px'
    };
    return `<div class="component-hj-navbar">${renderChildren(nodes, compContext)}</div>`;
  }
  
  if (tagName === 'hj-doctor-card') {
    const wxmlPath = path.join(mpWeixinPath, 'components/business/hj-doctor-card.wxml');
    if (!fs.existsSync(wxmlPath)) return `<div class="hj-doctor-card-fallback">医生卡片</div>`;
    const wxml = fs.readFileSync(wxmlPath, 'utf8');
    const nodes = parseWxml(wxml);
    let doctor = null;
    const upAttr = attrs['u-p'];
    if (upAttr) {
      const upExpr = upAttr.replace(/\{\{|\}\}/g, '');
      const upVal = evalExpression(upExpr, context);
      if (upVal && upVal.doctor) {
        doctor = upVal.doctor;
      }
    }
    if (!doctor) {
      doctor = context.doctor || mockDoctors[0];
    }
    if (doctor && doctor.doctor) doctor = doctor.doctor;

    const compContext = {
      a: doctor.name.slice(0, 1),
      b: doctor.name,
      c: doctor.title ? { a: doctor.title, b: 'gold' } : null,
      d: doctor.specialty,
      e: doctor.experience,
      f: doctor.expertise ? doctor.expertise.map(t => ({ a: t })) : [],
      g: doctor.rating,
      h: doctor.reviewCount,
      i: doctor.consultCount,
      j: ''
    };
    return `<div class="component-hj-doctor-card">${renderChildren(nodes, compContext)}</div>`;
  }
  
  if (tagName === 'hj-store-card') {
    const wxmlPath = path.join(mpWeixinPath, 'components/business/hj-store-card.wxml');
    if (!fs.existsSync(wxmlPath)) return `<div class="hj-store-card-fallback">门店卡片</div>`;
    const wxml = fs.readFileSync(wxmlPath, 'utf8');
    const nodes = parseWxml(wxml);
    
    let store = null;
    const upAttr = attrs['u-p'];
    if (upAttr) {
      const upExpr = upAttr.replace(/\{\{|\}\}/g, '');
      const upVal = evalExpression(upExpr, context);
      if (upVal && upVal.store) {
        store = upVal.store;
      }
    }
    if (!store) {
      store = context.store || mockStores[0];
    }
    if (store && store.store) store = store.store;

    const compContext = {
      a: !store.isOpen,
      b: store.name,
      c: store.tags ? store.tags.map(t => ({ a: t })) : [],
      d: store.address,
      e: store.doctorCount,
      f: store.businessHours,
      g: true,
      h: '1.2km',
      i: ''
    };
    return `<div class="component-hj-store-card">${renderChildren(nodes, compContext)}</div>`;
  }
  
  if (tagName === 'hj-tag') {
    const text = resolveInterpolation(attrs['text'] || '', context);
    const type = resolveInterpolation(attrs['type'] || 'primary', context);
    return `<span class="hj-tag hj-tag-${type}">${text}</span>`;
  }
  
  if (tagName === 'hj-button') {
    const text = resolveInterpolation(attrs['text'] || '', context);
    const type = resolveInterpolation(attrs['type'] || 'primary', context);
    return `<button class="hj-btn hj-btn-${type}">${text}</button>`;
  }

  if (tagName === 'hj-empty') {
    const text = resolveInterpolation(attrs['text'] || '暂无数据', context);
    return `<div class="hj-empty"><div class="hj-empty-icon">📁</div><div class="hj-empty-text">${text}</div></div>`;
  }
  
  return `<!-- Unknown component: ${tagName} -->`;
}

// 5. Render Node to HTML string
function renderNode(node, context) {
  if (node.type === 'text') {
    return resolveInterpolation(node.content, context);
  }
  if (node.type === 'comment') {
    return `<!-- ${node.content} -->`;
  }
  
  const tagName = node.tagName;
  
  if (['hj-navbar', 'hj-doctor-card', 'hj-store-card', 'hj-tag', 'hj-button', 'hj-empty'].includes(tagName)) {
    return renderComponent(tagName, node.attrs, context);
  }
  
  let htmlTagName = 'div';
  if (tagName === 'text') htmlTagName = 'span';
  else if (tagName === 'image') htmlTagName = 'img';
  else if (tagName === 'button') htmlTagName = 'button';
  else if (tagName === 'navigator') htmlTagName = 'a';
  else if (tagName === 'input') htmlTagName = 'input';
  else if (tagName === 'textarea') htmlTagName = 'textarea';
  else if (tagName === 'scroll-view') htmlTagName = 'div';
  else if (tagName === 'swiper' || tagName === 'swiper-item') htmlTagName = 'div';
  else if (tagName === 'form') htmlTagName = 'form';
  else htmlTagName = tagName;
  
  let attrsHtml = '';
  for (let [name, val] of Object.entries(node.attrs)) {
    if (name.startsWith('wx:')) continue;
    if (name.startsWith('bind') || name.startsWith('catch')) continue;
    
    let resolvedVal = resolveInterpolation(val, context);
    
    // Class binding evaluator
    if (name === 'class' && val.includes('[')) {
      const arrayContent = val.replace(/\{\{|\}\}|\[|\]/g, '');
      const elements = arrayContent.split(',').map(e => e.trim());
      const resolvedClasses = elements.map(expr => {
        if (expr.startsWith("'") && expr.endsWith("'")) return expr.slice(1, -1);
        if (expr.startsWith('"') && expr.endsWith('"')) return expr.slice(1, -1);
        return evalExpression(expr, context);
      }).filter(c => !!c).join(' ');
      resolvedVal = resolvedClasses;
    }
    
    if (name === 'src' && htmlTagName === 'img') {
      if (resolvedVal.startsWith('/')) {
        resolvedVal = '../mp-weixin' + resolvedVal;
      }
    }
    
    attrsHtml += ` ${name}="${resolvedVal}"`;
  }
  
  if (['img', 'input', 'br', 'hr'].includes(htmlTagName)) {
    return `<${htmlTagName}${attrsHtml} />`;
  }
  
  const childrenHtml = renderChildren(node.children, context);
  return `<${htmlTagName}${attrsHtml}>${childrenHtml}</${htmlTagName}>`;
}

function renderChildren(children, context) {
  let html = '';
  let i = 0;
  while (i < children.length) {
    const child = children[i];
    if (child.type === 'element') {
      if (child.attrs['wx:if']) {
        const condExpr = child.attrs['wx:if'].replace(/\{\{|\}\}/g, '');
        const condVal = evalExpression(condExpr, context);
        if (condVal) {
          html += renderNode(child, context);
        } else {
          let siblingIdx = i + 1;
          let matched = false;
          while (siblingIdx < children.length) {
            const nextChild = children[siblingIdx];
            if (nextChild.type === 'element') {
              if (nextChild.attrs['wx:elif']) {
                const elifExpr = nextChild.attrs['wx:elif'].replace(/\{\{|\}\}/g, '');
                const elifVal = evalExpression(elifExpr, context);
                if (elifVal && !matched) {
                  html += renderNode(nextChild, context);
                  matched = true;
                }
                siblingIdx++;
              } else if (nextChild.attrs['wx:else'] !== undefined) {
                if (!matched) {
                  html += renderNode(nextChild, context);
                  matched = true;
                }
                siblingIdx++;
              } else {
                break;
              }
            } else {
              if (nextChild.type === 'text' && nextChild.content.trim() === '') {
                siblingIdx++;
              } else {
                break;
              }
            }
          }
          i = siblingIdx - 1;
        }
      } else if (child.attrs['wx:elif'] || child.attrs['wx:else'] !== undefined) {
        // Skip
      } else if (child.attrs['wx:for']) {
        const listExpr = child.attrs['wx:for'].replace(/\{\{|\}\}/g, '');
        const list = evalExpression(listExpr, context);
        const itemVar = child.attrs['wx:for-item'] || 'item';
        const indexVar = child.attrs['wx:for-index'] || 'index';
        if (Array.isArray(list)) {
          for (let index = 0; index < list.length; index++) {
            const item = list[index];
            const newContext = { ...context, [itemVar]: item, [indexVar]: index };
            html += renderNode(child, newContext);
          }
        }
      } else {
        html += renderNode(child, context);
      }
    } else if (child.type === 'text') {
      html += resolveInterpolation(child.content, context);
    }
    i++;
  }
  return html;
}

// 6. Define page mock variables dynamically
function buildPageContext(pagePath, title) {
  const defaultCtx = {
    pagePath: pagePath,
    pageTitle: title,
    // Add fallback variables
    a: true, b: '示例', c: '示例', d: [], e: '', f: '', g: '', h: [], i: [], j: '', k: '', l: '', m: ''
  };

  // Specific mappings for major pages
  const mappings = {
    'pages/index/index': {
      a: { transparent: true, textColor: '#FFFFFF' },
      j: '12,850+',
      k: '99.2%',
      l: '3',
      h: mockDoctors.slice(0, 3).map((d, idx) => ({ id: d.id, b: '', c: 'e9-1-' + idx, d: { doctor: d } })),
      i: mockStores.map((s, idx) => ({ id: s.id, b: '', c: 'e9-2-' + idx, d: { store: s } }))
    },
    'pages/profile/index': {
      a: { title: '我的' },
      b: '张',
      c: '张明华',
      f: '黄金会员',
      d: [
        {
          a: '我的健康',
          b: [
            { a: '📋', b: '病历档案', c: '病历档案', d: '' },
            { a: '💊', b: '阻鼾器管理', c: '阻鼾器管理', d: '' },
            { a: '👨‍👩‍👧', b: '家庭成员', c: '家庭成员', d: '' }
          ]
        },
        {
          a: '我的服务',
          b: [
            { a: '💰', b: '会员权益', c: '会员权益', d: '' },
            { a: '📦', b: '我的订单', c: '我的订单', d: '' },
            { a: '🔗', b: '分销中心', c: '分销中心', d: '' },
            { a: '🎬', b: '直播中心', c: '直播中心', d: '' }
          ]
        },
        {
          a: '其他',
          b: [
            { a: '💬', b: '在线客服', c: '在线客服', d: '' },
            { a: '🔔', b: '消息通知', c: '消息通知', d: '' },
            { a: '⚙️', b: '设置', c: '设置', d: '' }
          ]
        }
      ]
    },
    'pages/appointment/index': {
      a: { title: '预约挂号' },
      b: '深圳',
      c: '深圳旗舰中心',
      d: '全部科室',
      e: '智能排序',
      f: mockDoctors.map((d, idx) => ({ id: d.id, b: '', c: 'ap-1-' + idx, d: { doctor: d } })),
      g: true
    },
    'pages/treatment/index': {
      a: { title: '治疗追踪' },
      b: '定制阻鼾器 HJ-MAD-03',
      c: '深圳旗舰中心',
      d: '进行中',
      e: '当前前伸量: 3.0mm',
      f: '设备已连接 (电量 92%)',
      g: [
        { a: '06-11', b: '6.8小时', c: 'AHI 6.5', d: '#1A9D5C' },
        { a: '06-10', b: '7.2小时', c: 'AHI 5.8', d: '#1A9D5C' },
        { a: '06-09', b: '5.5小时', c: 'AHI 8.2', d: '#F59E0B' }
      ]
    },
    'pages/product/index': {
      a: { title: '健康商城' },
      b: [
        { id: 'p1', a: '/static/demo/prod-1.jpg', b: '定制型下颌前移阻鼾器 HJ-MAD-03', c: '物理防鼾，轻量便携，睡眠守护', d: '2980', e: '3600', f: '已售 1240' },
        { id: 'p2', a: '/static/demo/prod-2.jpg', b: '阻鼾器专用声波消毒清洁盒', c: '99.9% 紫外线声波双重清洁', d: '298', e: '398', f: '已售 890' }
      ]
    }
  };

  const pageSpecific = mappings[pagePath] || {};
  
  // Fallback scanner from JS bundle to capture any defined refs
  const jsPath = path.join(mpWeixinPath, pagePath + '.js');
  if (fs.existsSync(jsPath)) {
    const jsContent = fs.readFileSync(jsPath, 'utf8');
    const refRegex = /(\w+)\s*=\s*\w+\.ref\(([^)]+)\)/g;
    let match;
    while ((match = refRegex.exec(jsContent)) !== null) {
      const key = match[1];
      let val = match[2].trim();
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      else if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      else if (val === '!0') val = true;
      else if (val === '!1') val = false;
      
      if (pageSpecific[key] === undefined) {
        pageSpecific[key] = val;
      }
    }
  }

  return { ...defaultCtx, ...pageSpecific };
}

// 7. Get page route titles from app.json
function getRouteTitles() {
  const titles = {};
  const appJsonPath = path.join(mpWeixinPath, 'app.json');
  if (!fs.existsSync(appJsonPath)) return titles;
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  
  // Check tabbar list
  if (appJson.tabBar && appJson.tabBar.list) {
    appJson.tabBar.list.forEach(item => {
      titles[item.pagePath] = item.text;
    });
  }
  
  // Custom manual mappings for other major pages
  const manual = {
    'pages/auth/login': '微信授权登录',
    'pages/appointment/store-select': '选择就诊门店',
    'pages/appointment/doctor-detail': '接诊医生详情',
    'pages/appointment/time-select': '选择预约时段',
    'pages/appointment/confirm': '确认挂号信息',
    'pages/appointment/success': '挂号预约成功',
    'pages/appointment/detail': '门诊预约详情',
    'pages/appointment/reschedule': '就诊预约改期',
    'pages/assessment/questionnaire/index': 'ESS 嗜睡自我量表评估',
    'pages/assessment/result/index': '睡眠呼吸初评报告',
    'pages/assessment/recording/index': 'AI 睡眠鼾声实时录音',
    'pages/assessment/snore-result/index': 'AI 睡眠鼾声分析报告',
    'pages/treatment/sleep-trend/index': '近期睡眠戴镜数据趋势',
    'pages/treatment/timeline/index': '临床治疗记录时间轴',
    'pages/treatment/doctor-advice/index': '主诊医生就诊建议书',
    'pages/treatment/adjust-detail/index': '阻鼾器下颌前伸微调记录',
    'pages/treatment/sleep-report/index': '多导睡眠监测评估报告 (PSG)',
    'pages/product/detail/index': '商品详情',
    'pages/profile/medical-records/index': '就诊门诊电子病历',
    'pages/profile/device-manage/index': '我的定制阻鼾器管理',
    'pages/profile/device-manage/wearing-data/index': '佩戴追踪数据图表',
    'pages/profile/family-members/index': '家庭就诊成员列表',
    'pages/profile/family-members/add-member/index': '添加家庭成员卡',
    'pages/profile/member-benefits/index': '会员特权与服务权益',
    'pages/profile/settings/index': '系统设置',
    'pages/profile/settings/personal-info/index': '修改个人基本资料',
    'pages/profile/settings/account-security/index': '账号安全维护中心',
    'pages/profile/notifications/index': '系统消息与服务通知',
    'pages/profile/online-service/index': '在线客服实时咨询',
    'pages/order/index': '商城购物订单',
    'pages/order/detail': '订单详情',
    'pages/distribution/center/index': '健康合伙人分销中心',
    'pages/distribution/commission/index': '分销金及推广佣金明细',
    'pages/distribution/withdraw/index': '佣金余额提现申请',
    'pages/distribution/withdraw-records/index': '资金提现记录表',
    'pages/distribution/team/index': '我推荐的合伙人团队',
    'pages/distribution/invite/index': '邀请好友加入合伙人',
    'pages/distribution/products/index': '推广健康包赚佣金',
    'pages/distribution/rules/index': '鼾静分销合伙人规则',
    'pages/live/list/index': '睡眠呼吸健康直播课',
    'pages/live/playback/index': '往期直播精彩回放',
    'pages/community/index': '睡眠呼吸健康交流圈',
    'pages/community/detail/index': '圈子讨论详情',
    'pages/community/publish/index': '发布科普/提问帖子'
  };
  
  return { ...titles, ...manual };
}

const routeTitles = getRouteTitles();

// 8. Compile a specific page
function compilePage(pagePath, title) {
  const wxmlPath = path.join(mpWeixinPath, pagePath + '.wxml');
  const wxssPath = path.join(mpWeixinPath, pagePath + '.wxss');
  
  if (!fs.existsSync(wxmlPath)) {
    return `<div class="p-4 text-center text-gray-500">页面模板 ${pagePath}.wxml 不存在</div>`;
  }
  
  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const ast = parseWxml(wxml);
  const context = buildPageContext(pagePath, title);
  
  let html = renderChildren(ast, context);
  
  // Load local page CSS if exists
  let css = '';
  if (fs.existsSync(wxssPath)) {
    css = fs.readFileSync(wxssPath, 'utf8');
  }
  
  return { html, css };
}

// 9. Main process
function main() {
  const appJsonPath = path.join(mpWeixinPath, 'app.json');
  if (!fs.existsSync(appJsonPath)) {
    console.error('app.json not found in ' + mpWeixinPath);
    return;
  }
  
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const allPagePaths = [];
  
  if (appJson.pages) {
    allPagePaths.push(...appJson.pages);
  }
  if (appJson.subpackages) {
    appJson.subpackages.forEach(sub => {
      sub.pages.forEach(p => {
        allPagePaths.push(sub.root + '/' + p);
      });
    });
  }
  
  console.log(`Discovered ${allPagePaths.length} pages in WeChat Mini Program.`);
  
  // Read global app.wxss
  let globalCss = '';
  const appWxssPath = path.join(mpWeixinPath, 'app.wxss');
  if (fs.existsSync(appWxssPath)) {
    globalCss = fs.readFileSync(appWxssPath, 'utf8');
  }
  
  const compiledPages = [];
  
  allPagePaths.forEach(pagePath => {
    const title = routeTitles[pagePath] || '鼾静健康诊所';
    console.log(`Compiling: ${pagePath} (${title})...`);
    try {
      const res = compilePage(pagePath, title);
      compiledPages.push({
        path: pagePath,
        title: title,
        html: res.html,
        css: res.css
      });
    } catch (err) {
      console.error(`Failed to compile page: ${pagePath}`, err);
    }
  });
  
  // Compile all components styles to bundle them
  let componentsCss = '';
  const componentPaths = [
    'components/base/hj-navbar.wxss',
    'components/business/hj-doctor-card.wxss',
    'components/business/hj-store-card.wxss',
    'components/business/hj-appointment-item.wxss',
    'components/business/hj-schedule-calendar.wxss',
    'components/base/hj-tag.wxss',
    'components/base/hj-button.wxss',
    'components/base/hj-empty.wxss',
    'components/base/hj-empty/hj-empty.wxss'
  ];
  componentPaths.forEach(cp => {
    const absPath = path.join(mpWeixinPath, cp);
    if (fs.existsSync(absPath)) {
      componentsCss += fs.readFileSync(absPath, 'utf8') + '\n';
    }
  });
  
  // Generate Compiled Master Preview HTML
  const masterHtmlTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>鼾静健康诊所 - 微信小程序开发全页面平铺设计稿</title>
<style>
/* === Global App.wxss === */
${globalCss}

/* === Components Styles === */
${componentsCss}

/* === Page specific styles === */
${compiledPages.map(p => `/* ${p.path} CSS */\n${p.css}`).join('\n')}

/* === App Shell Layout Styles === */
body {
  margin: 0;
  padding: 0;
  background-color: #0f172a;
  color: #f8fafc;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-container {
  display: flex;
  width: 100%;
  height: 100%;
}

.sidebar {
  width: 320px;
  background-color: #1e293b;
  border-right: 1px solid #334155;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 10;
}

.sidebar-header {
  padding: 24px;
  border-bottom: 1px solid #334155;
}

.sidebar-header h2 {
  margin: 0 0 6px 0;
  font-size: 18px;
  font-weight: 700;
  color: #3b6bf5;
}

.sidebar-header p {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.toolbar {
  padding: 16px 20px;
  background: #0f172a;
  border-bottom: 1px solid #334155;
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #334155;
  background-color: #1e293b;
  color: #f8fafc;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.slider-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  font-size: 12px;
  color: #94a3b8;
}

.zoom-slider {
  width: 120px;
  accent-color: #3b6bf5;
}

.menu-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.menu-section {
  margin-bottom: 24px;
}

.menu-section-title {
  padding: 0 24px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.menu-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.menu-item {
  margin: 2px 12px;
}

.menu-link {
  display: flex;
  flex-direction: column;
  padding: 10px 16px;
  border-radius: 8px;
  color: #cbd5e1;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.menu-link:hover {
  background-color: #334155;
  color: #f8fafc;
}

.menu-link-badge {
  font-size: 10px;
  color: #64748b;
  margin-top: 4px;
}

.menu-item.active .menu-link {
  background-color: #3b6bf5;
  color: #ffffff;
}

.menu-item.active .menu-link-badge {
  color: rgba(255, 255, 255, 0.7);
}

.main-content {
  flex: 1;
  overflow: auto;
  background-color: #0f172a;
  padding: 40px;
  display: flex;
  flex-wrap: wrap;
  gap: 40px;
  align-content: flex-start;
  justify-content: center;
}

.phone-wrapper {
  margin-bottom: 40px;
  scroll-margin-top: 40px;
}

.page-label {
  margin-bottom: 12px;
  text-align: center;
}

.page-label span {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
}

.page-label .path {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
  font-family: monospace;
}

.phone {
  width: 375px;
  height: 812px;
  border: 12px solid #334155;
  border-radius: 40px;
  background-color: #f9fafb;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  position: relative;
}

/* Phone notch mock */
.phone::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 150px;
  height: 25px;
  background-color: #334155;
  border-bottom-left-radius: 18px;
  border-bottom-right-radius: 18px;
  z-index: 1000;
}

.phone-screen {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background-color: #f9fafb;
  color: #1f2937;
  padding-bottom: 34px; /* safe bottom */
  box-sizing: border-box;
}

.phone-screen::-webkit-scrollbar {
  display: none;
}

/* Fix navbar positions for inlined components */
.component-hj-navbar {
  position: sticky;
  top: 0;
  width: 100%;
  z-index: 99;
}

.hj-navbar.is-fixed {
  position: relative !important;
}

</style>
</head>
<body>

<div class="app-container">
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>鼾静健康诊所</h2>
      <p>编译自小程序开发源码 (${compiledPages.length}个页面)</p>
    </div>
    
    <div class="toolbar">
      <input type="text" id="searchInput" class="search-input" placeholder="搜索页面路径或标题..." oninput="filterPages()">
      <div class="slider-container">
        <span>视图缩放: <span id="zoomVal">100%</span></span>
        <input type="range" id="zoomSlider" class="zoom-slider" min="40" max="120" value="100" oninput="adjustZoom(this.value)">
      </div>
    </div>
    
    <div class="menu-container">
      <div class="menu-section">
        <div class="menu-section-title">全页面列表 (All Pages)</div>
        <ul class="menu-list">
          ${compiledPages.map((p, idx) => `
          <li class="menu-item" id="menu-item-${idx}" data-path="${p.path}" data-title="${p.title}">
            <a href="#phone-${idx}" class="menu-link" onclick="highlightMenu(${idx})">
              <span>${p.title}</span>
              <span class="menu-link-badge">${p.path}</span>
            </a>
          </li>
          `).join('')}
        </ul>
      </div>
    </div>
  </div>

  <div class="main-content" id="mainContent">
    ${compiledPages.map((p, idx) => `
    <div class="phone-wrapper" id="phone-${idx}" data-path="${p.path}" data-title="${p.title}">
      <div class="page-label">
        <span>${p.title}</span>
        <span class="path">${p.path}</span>
      </div>
      <div class="phone">
        <div class="phone-screen">
          ${p.html}
        </div>
      </div>
    </div>
    `).join('')}
  </div>
</div>

<script>
function filterPages() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const items = document.querySelectorAll('.menu-item');
  const phones = document.querySelectorAll('.phone-wrapper');
  
  items.forEach((item, idx) => {
    const path = item.getAttribute('data-path').toLowerCase();
    const title = item.getAttribute('data-title').toLowerCase();
    const isMatch = path.includes(query) || title.includes(query);
    item.style.display = isMatch ? 'block' : 'none';
    phones[idx].style.display = isMatch ? 'block' : 'none';
  });
}

function adjustZoom(val) {
  document.getElementById('zoomVal').innerText = val + '%';
  const wrappers = document.querySelectorAll('.phone-wrapper');
  wrappers.forEach(w => {
    w.style.transform = 'scale(' + (val / 100) + ')';
    w.style.transformOrigin = 'top center';
    // Handle height compensation for scaling
    w.style.height = (880 * val / 100) + 'px';
    w.style.width = (375 * val / 100) + 'px';
    w.style.marginBottom = '20px';
  });
}

function highlightMenu(idx) {
  document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
  document.getElementById('menu-item-' + idx).classList.add('active');
}
</script>
</body>
</html>`;

  fs.writeFileSync(path.join(uiPath, 'wechat_mini_program_compiled_mockups.html'), masterHtmlTemplate);
  console.log(`Compiled mockup HTML written to: ${path.join(uiPath, 'wechat_mini_program_compiled_mockups.html')}`);
  
  // Write individual HTML files
  const pagesDir = path.join(uiPath, 'pages');
  if (!fs.existsSync(pagesDir)) {
    fs.mkdirSync(pagesDir, { recursive: true });
  }
  
  compiledPages.forEach(p => {
    const fileName = p.path.replace(/\//g, '_') + '.html';
    const singleHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${p.title} - ${p.path}</title>
<style>
${globalCss}
${componentsCss}
${p.css}
body {
  margin: 0;
  padding: 0;
  background-color: #f9fafb;
}
.phone-standalone {
  width: 375px;
  min-height: 812px;
  margin: 40px auto;
  background-color: #f9fafb;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  overflow: hidden;
  position: relative;
}
.component-hj-navbar {
  position: sticky;
  top: 0;
  width: 100%;
  z-index: 99;
}
.hj-navbar.is-fixed {
  position: relative !important;
}
</style>
</head>
<body>
<div class="phone-standalone">
  ${p.html}
</div>
</body>
</html>`;
    fs.writeFileSync(path.join(pagesDir, fileName), singleHtml);
  });
  
  console.log('Successfully completed building all compiled mockups.');
}

main();
