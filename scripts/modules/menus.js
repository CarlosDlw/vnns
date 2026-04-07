(() => {
  window.VNNSModules = window.VNNSModules || {};

  window.VNNSModules.createMenusUI = function createMenusUI(deps) {
    const onMenuAction = deps.onMenuAction;
    const onPredictPanel = deps.onPredictPanel;

    const handle = document.getElementById('resize-handle');
    const panelTop = document.getElementById('panel-top');
    const panelBottom = document.getElementById('panel-bottom');
    const rightPanel = document.querySelector('.right-panel');
    let isResizing = false;

    if (handle && panelTop && panelBottom && rightPanel) {
      handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        handle.classList.add('active');
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const panelRect = rightPanel.getBoundingClientRect();
        const offset = e.clientY - panelRect.top;
        const totalHeight = panelRect.height - 4;
        const clampedOffset = Math.max(50, Math.min(offset, totalHeight - 50));
        panelTop.style.flex = 'none';
        panelBottom.style.flex = 'none';
        panelTop.style.height = `${clampedOffset}px`;
        panelBottom.style.height = `${totalHeight - clampedOffset}px`;
      });

      document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        handle.classList.remove('active');
        document.body.style.cursor = '';
      });
    }

    const menuItems = document.querySelectorAll('.menubar .menu-item');
    let activeMenu = null;

    function closeAllMenus() {
      menuItems.forEach((m) => m.classList.remove('active'));
      activeMenu = null;
    }

    menuItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.classList.contains('active')) {
          closeAllMenus();
        } else {
          closeAllMenus();
          item.classList.add('active');
          activeMenu = item;
        }
      });

      item.addEventListener('mouseenter', () => {
        if (activeMenu && activeMenu !== item) {
          closeAllMenus();
          item.classList.add('active');
          activeMenu = item;
        }
      });
    });

    document.addEventListener('click', (e) => {
      if (activeMenu && !e.target.closest('.menubar')) {
        closeAllMenus();
      }
    });

    document.querySelectorAll('.menu-dropdown-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllMenus();
        const action = btn.dataset.action;
        if (action) onMenuAction(action);
      });
    });

    const leftActivityIcons = document.querySelectorAll('.activitybar .activity-icon');
    const sidebarViews = document.querySelectorAll('.sidebar-view');

    function switchPanel(viewName) {
      leftActivityIcons.forEach((i) => {
        i.classList.remove('active');
        if (i.dataset.view === viewName) i.classList.add('active');
      });
      sidebarViews.forEach((view) => {
        view.classList.remove('active');
        if (view.id === `view-${viewName}`) view.classList.add('active');
      });
      if (viewName === 'predict' && typeof onPredictPanel === 'function') {
        onPredictPanel();
      }
    }

    leftActivityIcons.forEach((icon) => {
      icon.addEventListener('click', () => {
        switchPanel(icon.dataset.view);
      });
    });

    return {
      switchPanel,
      closeAllMenus
    };
  };
})();
