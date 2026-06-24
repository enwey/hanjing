// Hanjing Clinic Mini-Program UI Portal Script (Iframe-Based Architecture)

document.addEventListener('DOMContentLoaded', () => {
  // Check if data is loaded
  if (typeof HJ_UI_PAGES === 'undefined') {
    console.error('Page data not loaded. Make sure page-data.js is included.');
    return;
  }

  // DOM Elements
  const menuScroll = document.getElementById('menuScroll');
  const searchInput = document.getElementById('searchInput');
  const zoomSlider = document.getElementById('zoomSlider');
  const zoomVal = document.getElementById('zoomVal');
  const themeToggle = document.getElementById('themeToggle');
  const inspectToggle = document.getElementById('inspectToggle');
  const resetBtn = document.getElementById('resetBtn');
  
  // Views
  const btnDevice = document.getElementById('btnDevice');
  const btnGrid = document.getElementById('btnGrid');
  const btnCompare = document.getElementById('btnCompare');
  
  const deviceView = document.getElementById('deviceView');
  const gridView = document.getElementById('gridView');
  const compareView = document.getElementById('compareView');
  
  // Single Phone Parts
  const phoneIframe = document.getElementById('phoneIframe');
  const mpTabbar = document.getElementById('mpTabbar');
  const deviceTime = document.getElementById('deviceTime');
  const deviceLabelTitle = document.getElementById('deviceLabelTitle');
  const deviceLabelPath = document.getElementById('deviceLabelPath');
  
  // Compare Phones Parts
  const compSelector1 = document.getElementById('compSelector1');
  const compSelector2 = document.getElementById('compSelector2');
  const compIframe1 = document.getElementById('compIframe1');
  const compIframe2 = document.getElementById('compIframe2');
  
  // Inspect Pane
  const inspectPane = document.getElementById('inspectPane');
  const inspectClose = document.getElementById('inspectClose');
  const inspectTag = document.getElementById('inspectTag');
  const inspectClasses = document.getElementById('inspectClasses');
  const inspectDimensions = document.getElementById('inspectDimensions');
  const inspectStylesList = document.getElementById('inspectStylesList');

  // State Variables
  let currentPage = null;
  let currentZoom = 90;
  let isInspectMode = false;
  let inspectTarget = null;
  let navigationHistory = [];

  // Tabbar page routes
  const tabbarRoutes = [
    'pages/index/index',
    'pages/appointment/index',
    'pages/treatment/index',
    'pages/product/index',
    'pages/profile/index'
  ];

  // Initialize
  init();

  function init() {
    // 1. Set simulated status bar time
    updateTime();
    setInterval(updateTime, 60000);

    // 2. Render Sidebar Navigation
    renderSidebar();

    // 3. Set up Compare View dropdown options
    populateCompareSelectors();

    // 4. Load initial page (Home Page)
    loadPage('pages/index/index');

    // 5. Register Event Listeners
    registerEventListeners();
  }

  // Set local simulated time in iOS header
  function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    
    if (deviceTime) deviceTime.textContent = timeStr;
    
    // Also update compare screen times if they exist
    const compTimes = document.querySelectorAll('.comp-device-time');
    compTimes.forEach(t => t.textContent = timeStr);
  }

  // Render Sidebar Menu Grouped by Category
  function renderSidebar() {
    menuScroll.innerHTML = '';
    
    // Group pages by category
    const grouped = {};
    HJ_UI_CATEGORIES.forEach(cat => grouped[cat] = []);
    
    HJ_UI_PAGES.forEach(page => {
      if (!grouped[page.category]) {
        grouped[page.category] = [];
      }
      grouped[page.category].push(page);
    });

    // Generate HTML
    HJ_UI_CATEGORIES.forEach(category => {
      const pages = grouped[category];
      if (pages.length === 0) return;

      const section = document.createElement('div');
      section.className = 'menu-section';
      
      const title = document.createElement('div');
      title.className = 'menu-section-title';
      title.innerHTML = `${category} (${pages.length})`;
      title.addEventListener('click', () => {
        section.classList.toggle('collapsed');
      });

      const list = document.createElement('ul');
      list.className = 'menu-list';

      pages.forEach(page => {
        const item = document.createElement('li');
        item.className = 'menu-item';
        item.dataset.path = page.path;
        
        const link = document.createElement('a');
        link.href = `#${page.path}`;
        link.className = 'menu-link';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = page.title;
        
        const pathSpan = document.createElement('span');
        pathSpan.className = 'menu-link-badge';
        pathSpan.textContent = page.path;

        link.appendChild(nameSpan);
        link.appendChild(pathSpan);
        item.appendChild(link);
        list.appendChild(item);

        // Click to load page
        link.addEventListener('click', (e) => {
          e.preventDefault();
          switchView('device');
          loadPage(page.path);
        });
      });

      section.appendChild(title);
      section.appendChild(list);
      menuScroll.appendChild(section);
    });
  }

  // Populate comparison drop-downs
  function populateCompareSelectors() {
    compSelector1.innerHTML = '';
    compSelector2.innerHTML = '';
    
    HJ_UI_PAGES.forEach(page => {
      const opt1 = document.createElement('option');
      opt1.value = page.path;
      opt1.textContent = `${page.title} (${page.path})`;
      
      const opt2 = opt1.cloneNode(true);
      
      compSelector1.appendChild(opt1);
      compSelector2.appendChild(opt2);
    });

    // Default select
    compSelector1.value = 'pages/index/index';
    compSelector2.value = 'pages/appointment/index';
  }

  // Load page into the mock iPhone iframe
  function loadPage(path, pushHistory = true) {
    const basePath = path.split('?')[0];
    const query = path.split('?')[1] || '';
    const page = HJ_UI_PAGES.find(p => p.path === basePath);
    if (!page) return;

    currentPage = page;
    
    // Clear inspect selected styling before page transition
    clearInspectSelection();

    // Push into navigation history
    if (pushHistory) {
      if (navigationHistory.length === 0 || navigationHistory[navigationHistory.length - 1] !== path) {
        navigationHistory.push(path);
      }
    }

    // Set page iframe src
    phoneIframe.src = `${basePath}.html${query ? '?' + query : ''}`;

    // Update labels underneath phone
    deviceLabelTitle.textContent = page.title;
    deviceLabelPath.textContent = page.path;

    // Show/Hide bottom tabbar based on route
    const isTab = tabbarRoutes.includes(basePath);
    if (isTab) {
      mpTabbar.style.display = 'flex';
      phoneIframe.style.height = 'calc(100% - 54px)'; // subtract tabbar height
    } else {
      mpTabbar.style.display = 'none';
      phoneIframe.style.height = '100%';
    }

    // Update active tabbar item
    updateTabbarActiveState(path);

    // Sync sidebar active state
    document.querySelectorAll('.menu-item').forEach(item => {
      if (item.dataset.path === basePath) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('active');
      }
    });

    // Adjust theme styling (dark content checks)
    const isDarkThemePage = basePath === 'pages/assessment/recording/index' || basePath === 'pages/live/playback/index';
    const statusBar = document.querySelector('#deviceView .ios-status-bar');
    if (isDarkThemePage) {
      statusBar.className = 'ios-status-bar light-content';
    } else {
      statusBar.className = 'ios-status-bar dark-content';
    }
  }

  // Load comparison page in slot
  function loadComparePage(path, slotNum) {
    const basePath = path.split('?')[0];
    const query = path.split('?')[1] || '';
    const page = HJ_UI_PAGES.find(p => p.path === basePath);
    if (!page) return;

    const iframe = slotNum === 1 ? compIframe1 : compIframe2;
    const tabbar = document.getElementById(`compTabbar${slotNum}`);
    const statusBar = document.getElementById(`compStatusBar${slotNum}`);

    iframe.src = `${basePath}.html${query ? '?' + query : ''}`;
    
    // Tabbar show/hide
    const isTab = tabbarRoutes.includes(basePath);
    if (isTab) {
      tabbar.style.display = 'flex';
      iframe.style.height = 'calc(100% - 54px)';
      
      // Highlight correct tab
      const tabs = tabbar.querySelectorAll('.mp-tabbar-item');
      tabs.forEach(tab => {
        if (tab.dataset.path === basePath) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
    } else {
      tabbar.style.display = 'none';
      iframe.style.height = '100%';
    }

    // Dark layout mapping
    const isDark = basePath === 'pages/assessment/recording/index' || basePath === 'pages/live/playback/index';
    if (isDark) {
      statusBar.className = 'ios-status-bar light-content';
    } else {
      statusBar.className = 'ios-status-bar dark-content';
    }
  }

  // Highlight active bottom navigation item
  function updateTabbarActiveState(path) {
    const basePath = path.split('?')[0];
    const items = mpTabbar.querySelectorAll('.mp-tabbar-item');
    items.forEach(item => {
      if (item.dataset.path === basePath) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // Go back one page in mock navigation
  function handleGoBack() {
    if (navigationHistory.length > 1) {
      navigationHistory.pop(); // Remove current
      const prev = navigationHistory.pop(); // Pop target
      loadPage(prev, true); // Reload target (will push it back)
    }
  }

  // Intercept element clicks inside the iframe document
  function bindIframeInteractions(iframe, customNavigationHandler = null) {
    const navHandler = customNavigationHandler || ((path) => loadPage(path));
    
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (!doc) return;

      // 1. Intercept Back Buttons
      const backButtons = doc.querySelectorAll('.hj-navbar-back, .back-btn, [class*="back"]');
      backButtons.forEach(btn => {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', (e) => {
          if (isInspectMode) return;
          e.preventDefault();
          e.stopPropagation();
          if (customNavigationHandler) {
            // Compare view just goes back to index
            navHandler('pages/index/index');
          } else {
            handleGoBack();
          }
        });
      });

      // 2. Intercept Navigation Buttons by Text Analysis
      const clickables = doc.querySelectorAll('.menu-link, .btn, button, .card, .item, .badge, [onclick]');
      clickables.forEach(el => {
        const text = el.textContent ? el.textContent.trim() : '';
        let targetPath = null;
        
        if (text.includes('就诊预约') || text.includes('预约挂号') || text.includes('去预约') || text.includes('预约医生')) {
          targetPath = 'pages/appointment/index';
        } else if (text.includes('睡眠评估') || text.includes('开始评估') || text.includes('重新评估') || text.includes('进行睡眠评估')) {
          targetPath = 'pages/assessment/questionnaire/index';
        } else if (text.includes('鼾声分析') || text.includes('开始录音') || text.includes('录音中')) {
          targetPath = 'pages/assessment/recording/index';
        } else if (text.includes('治疗追踪') || text.includes('调整记录') || text.includes('治疗建议')) {
          targetPath = 'pages/treatment/index';
        } else if (text.includes('健康商城') || text.includes('产品中心') || text.includes('商城')) {
          targetPath = 'pages/product/index';
        } else if (text.includes('我的') || text.includes('个人中心')) {
          targetPath = 'pages/profile/index';
        } else if (text.includes('在线客服') || text.includes('联系客服')) {
          targetPath = 'pages/profile/online-service/index';
        } else if (text.includes('家庭成员') || text.includes('管理家人')) {
          targetPath = 'pages/profile/family-members/index';
        } else if (text.includes('病历档案') || text.includes('就诊卡')) {
          targetPath = 'pages/profile/medical-records/index';
        } else if (text.includes('分销') || text.includes('邀请好友') || text.includes('推广员') || text.includes('我的团队')) {
          targetPath = 'pages/distribution/center/index';
        } else if (text.includes('医生详情') || text.includes('选择医生')) {
          targetPath = 'pages/appointment/doctor-detail';
        } else if (text.includes('选择门店') || text.includes('更换门店')) {
          targetPath = 'pages/appointment/store-select';
        } else if (text.includes('选择时段') || text.includes('选择时间')) {
          targetPath = 'pages/appointment/time-select';
        } else if (text.includes('确认预约') || text.includes('去付款')) {
          targetPath = 'pages/appointment/confirm';
        } else if (text.includes('登录') || text.includes('授权')) {
          targetPath = 'pages/auth/login';
        }

        if (targetPath) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            if (isInspectMode) return;
            e.preventDefault();
            e.stopPropagation();
            navHandler(targetPath);
          });
        }
      });

      // 3. Intercept cells / list items
      const cells = doc.querySelectorAll('.hj-cell, .cell, .list-item');
      cells.forEach(cell => {
        const titleEl = cell.querySelector('.cell-title, .title, span');
        if (!titleEl) return;
        const text = titleEl.textContent.trim();
        let targetPath = null;
        
        if (text.includes('病历档案')) targetPath = 'pages/profile/medical-records/index';
        else if (text.includes('设备管理') || text.includes('我的设备')) targetPath = 'pages/profile/device-manage/index';
        else if (text.includes('家庭成员')) targetPath = 'pages/profile/family-members/index';
        else if (text.includes('设置')) targetPath = 'pages/profile/settings/index';
        else if (text.includes('会员') || text.includes('权益')) targetPath = 'pages/profile/member-benefits/index';
        else if (text.includes('消息') || text.includes('通知')) targetPath = 'pages/profile/notifications/index';
        else if (text.includes('客服')) targetPath = 'pages/profile/online-service/index';
        else if (text.includes('订单')) targetPath = 'pages/order/index';
        
        if (targetPath) {
          cell.style.cursor = 'pointer';
          cell.addEventListener('click', (e) => {
            if (isInspectMode) return;
            e.preventDefault();
            e.stopPropagation();
            navHandler(targetPath);
          });
        }
      });

    } catch (err) {
      // CORS Error occurs under file:// protocol. It's expected.
      console.warn("CORS Security Warning: Cannot bind clicks inside iframe due to file:// browser restrictions. Running 'npm run serve' enables fully interactive clicks inside screens.");
    }
  }

  // Register Event Listeners for controls
  function registerEventListeners() {
    // Zoom control
    zoomSlider.addEventListener('input', (e) => {
      currentZoom = parseInt(e.target.value);
      zoomVal.textContent = `${currentZoom}%`;
      updateZoomScale();
    });

    // Theme toggle (Light/Dark)
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      
      const isLight = document.body.classList.contains('light-theme');
      themeToggle.innerHTML = isLight 
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>`;
    });

    // Reset View Button
    resetBtn.addEventListener('click', () => {
      currentZoom = 90;
      zoomSlider.value = 90;
      zoomVal.textContent = '90%';
      updateZoomScale();
    });

    // View Switching Buttons
    btnDevice.addEventListener('click', () => switchView('device'));
    btnGrid.addEventListener('click', () => switchView('grid'));
    btnCompare.addEventListener('click', () => switchView('compare'));

    // Capsule buttons mock reload
    document.querySelectorAll('.mp-capsule-close').forEach(btn => {
      btn.addEventListener('click', () => {
        loadPage('pages/index/index');
      });
    });

    // Bottom Tabbar items click mapping
    document.querySelectorAll('.mp-tabbar-sim .mp-tabbar-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const path = item.dataset.path;
        if (path) {
          const parentDevice = item.closest('.compare-pane');
          if (parentDevice) {
            const slot = parentDevice.id === 'compPane1' ? 1 : 2;
            if (slot === 1) compSelector1.value = path;
            else compSelector2.value = path;
            loadComparePage(path, slot);
          } else {
            loadPage(path);
          }
        }
      });
    });

    // Compare selectors changes
    compSelector1.addEventListener('change', (e) => loadComparePage(e.target.value, 1));
    compSelector2.addEventListener('change', (e) => loadComparePage(e.target.value, 2));

    // Search Box Input Event (Live Filter)
    searchInput.addEventListener('input', () => filterPages());

    // Inspect Mode Switch
    inspectToggle.addEventListener('click', () => {
      isInspectMode = !isInspectMode;
      inspectToggle.classList.toggle('active');
      
      if (isInspectMode) {
        enablePageInspection();
        inspectPane.classList.add('active');
      } else {
        disablePageInspection();
        inspectPane.classList.remove('active');
        clearInspectSelection();
      }
    });

    inspectClose.addEventListener('click', () => {
      isInspectMode = false;
      inspectToggle.classList.remove('active');
      inspectPane.classList.remove('active');
      disablePageInspection();
      clearInspectSelection();
    });

    // Handle iframe load events for binding interactions
    phoneIframe.addEventListener('load', () => {
      bindIframeInteractions(phoneIframe);
      // Re-enable inspection listeners if active
      if (isInspectMode) {
        enablePageInspection();
      }
    });

    compIframe1.addEventListener('load', () => {
      bindIframeInteractions(compIframe1, (path) => {
        compSelector1.value = path;
        loadComparePage(path, 1);
      });
    });

    compIframe2.addEventListener('load', () => {
      bindIframeInteractions(compIframe2, (path) => {
        compSelector2.value = path;
        loadComparePage(path, 2);
      });
    });
  }

  // Update zoom CSS scale rules
  function updateZoomScale() {
    const scale = currentZoom / 100;
    const device = document.querySelector('#deviceView .iphone-15');
    if (device) device.style.transform = `scale(${scale})`;
    
    const compDevices = document.querySelectorAll('.compare-pane .iphone-15');
    compDevices.forEach(d => d.style.transform = `scale(${scale * 0.9})`);
  }

  // Switch between Portal Views
  function switchView(viewName) {
    btnDevice.classList.remove('active');
    btnGrid.classList.remove('active');
    btnCompare.classList.remove('active');

    deviceView.style.display = 'none';
    gridView.classList.remove('active');
    compareView.classList.remove('active');

    if (viewName === 'device') {
      btnDevice.classList.add('active');
      deviceView.style.display = 'flex';
    } else if (viewName === 'grid') {
      btnGrid.classList.add('active');
      gridView.classList.add('active');
      renderGridView();
    } else if (viewName === 'compare') {
      btnCompare.classList.add('active');
      compareView.classList.add('active');
      loadComparePage(compSelector1.value, 1);
      loadComparePage(compSelector2.value, 2);
    }
    
    updateZoomScale();
  }

  // Render Flat Figma-like Grid of All Pages using lazy iframes
  function renderGridView() {
    gridView.innerHTML = '';
    
    HJ_UI_PAGES.forEach(page => {
      const card = document.createElement('div');
      card.className = 'grid-card';
      
      const header = document.createElement('div');
      header.className = 'grid-card-header';
      
      const title = document.createElement('div');
      title.className = 'grid-card-title';
      title.textContent = page.title;
      
      const path = document.createElement('div');
      path.className = 'grid-card-path';
      path.textContent = page.path;
      
      header.appendChild(title);
      header.appendChild(path);
      
      const screenWrapper = document.createElement('div');
      screenWrapper.className = 'grid-card-screen';
      
      // Use iframe in grid
      const iframe = document.createElement('iframe');
      iframe.className = 'grid-iframe';
      iframe.src = `${page.path}.html`;
      iframe.loading = 'lazy';
      iframe.style.border = 'none';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.pointerEvents = 'none';
      
      screenWrapper.appendChild(iframe);
      card.appendChild(header);
      card.appendChild(screenWrapper);
      
      gridView.appendChild(card);

      card.addEventListener('click', () => {
        switchView('device');
        loadPage(page.path);
      });
    });
  }

  // Search box live filter logic
  function filterPages() {
    const query = searchInput.value.toLowerCase().trim();
    const sections = menuScroll.querySelectorAll('.menu-section');

    sections.forEach(section => {
      const items = section.querySelectorAll('.menu-item');
      let visibleCount = 0;

      items.forEach(item => {
        const title = item.querySelector('.menu-link span:first-child').textContent.toLowerCase();
        const path = item.dataset.path.toLowerCase();
        
        if (title.includes(query) || path.includes(query)) {
          item.style.display = 'block';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });

      if (visibleCount === 0) {
        section.style.display = 'none';
      } else {
        section.style.display = 'block';
        if (query !== '') {
          section.classList.remove('collapsed');
        }
      }
    });
  }

  // ==========================================================================
  // Inspect Spec Mode Logic (Handling Iframe DOM)
  // ==========================================================================
  function enablePageInspection() {
    try {
      const doc = phoneIframe.contentDocument || phoneIframe.contentWindow.document;
      if (!doc) return;
      
      doc.addEventListener('mouseover', handleInspectMouseOver, true);
      doc.addEventListener('mouseout', handleInspectMouseOut, true);
      doc.addEventListener('click', handleInspectClick, true);
      
      // Clear panel error if any
      inspectStylesList.innerHTML = '<div style="color: var(--text-muted); font-size:12px;">鼠标移入手机屏幕并点击任意元素进行审查</div>';
    } catch (err) {
      // CORS block on file:// protocol
      showInspectError(
        "CORS 跨域安全限制",
        "由于浏览器的同源安全策略，当您直接通过本地文件双击打开 `index.html` 时（即 `file://` 协议），浏览器会禁止读取和审查 iframe 内部元素。\n\n" +
        "💡 解决方案：请在终端运行本地服务以解除限制，并体验全功能的代码标注模式：\n\n" +
        "  1. 终端执行：\n" +
        "     npm run serve\n\n" +
        "  2. 在浏览器中访问本地服务端口即可！"
      );
    }
  }

  function disablePageInspection() {
    try {
      const doc = phoneIframe.contentDocument || phoneIframe.contentWindow.document;
      if (!doc) return;
      doc.removeEventListener('mouseover', handleInspectMouseOver, true);
      doc.removeEventListener('mouseout', handleInspectMouseOut, true);
      doc.removeEventListener('click', handleInspectClick, true);
    } catch (err) {
      // Ignore
    }
  }

  function handleInspectMouseOver(e) {
    if (!isInspectMode) return;
    e.stopPropagation();
    e.target.classList.add('inspect-highlight');
  }

  function handleInspectMouseOut(e) {
    e.stopPropagation();
    e.target.classList.remove('inspect-highlight');
  }

  function handleInspectClick(e) {
    if (!isInspectMode) return;
    e.preventDefault();
    e.stopPropagation();

    clearInspectSelection();

    inspectTarget = e.target;
    inspectTarget.classList.add('inspect-selected');

    displayElementMetadata(inspectTarget);
  }

  function clearInspectSelection() {
    try {
      const doc = phoneIframe.contentDocument || phoneIframe.contentWindow.document;
      if (!doc) return;
      
      const highlighted = doc.querySelectorAll('.inspect-highlight, .inspect-selected');
      highlighted.forEach(el => {
        el.classList.remove('inspect-highlight', 'inspect-selected');
      });
      inspectTarget = null;
    } catch (err) {
      // Ignore
    }
  }

  function showInspectError(title, desc) {
    inspectTag.textContent = "N/A";
    inspectClasses.textContent = "N/A";
    inspectDimensions.textContent = "N/A";
    inspectStylesList.innerHTML = `
      <div style="padding: 12px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; color: #fca5a5; font-size: 12px; line-height: 1.6;">
        <h4 style="font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">⚠️ ${title}</h4>
        <p style="white-space: pre-wrap; font-family: sans-serif;">${desc}</p>
      </div>
    `;
  }

  // Display CSS details of hovered element in Inspect Pane
  function displayElementMetadata(el) {
    const rect = el.getBoundingClientRect();
    const computed = el.ownerDocument.defaultView.getComputedStyle(el);

    inspectTag.textContent = el.tagName.toLowerCase();
    
    // Classes
    const classList = Array.from(el.classList).filter(c => c !== 'inspect-selected' && c !== 'inspect-highlight');
    inspectClasses.textContent = classList.length > 0 ? classList.map(c => `.${c}`).join(' ') : 'None';
    
    // Dimensions
    inspectDimensions.textContent = `${Math.round(rect.width)}px × ${Math.round(rect.height)}px`;

    // Key Styles
    const styleKeys = [
      'color',
      'font-size',
      'font-weight',
      'background-color',
      'background-image',
      'padding',
      'margin',
      'border-radius',
      'border-width',
      'border-color',
      'box-shadow',
      'display',
      'flex-direction',
      'justify-content',
      'align-items',
      'line-height',
      'opacity'
    ];

    inspectStylesList.innerHTML = '';
    
    styleKeys.forEach(key => {
      const val = computed.getPropertyValue(key);
      if (!val || val === 'none' || val === 'normal' || val === '0px' || val === 'rgba(0, 0, 0, 0)' || val === '0px none rgb(31, 41, 55)' || val === 'auto') {
        return;
      }

      const row = document.createElement('div');
      row.className = 'inspect-style-row';
      
      const name = document.createElement('span');
      name.className = 'inspect-style-name';
      name.textContent = key;
      
      const value = document.createElement('span');
      value.className = 'inspect-style-val';
      value.textContent = val;

      row.appendChild(name);
      row.appendChild(value);
      inspectStylesList.appendChild(row);
    });
  }
});
