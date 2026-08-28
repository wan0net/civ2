import { FONT } from '../renderConstants.js';
import { createStoredZip } from '../../utils/bugReportZip.js';

const GITHUB_ISSUES_URL = 'https://github.com/wan0net/civ2/issues/new';

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** @param {typeof import('../MapRenderer.js').MapRenderer} MapRenderer */
export function applyBugReportMixin(MapRenderer) {
  MapRenderer.prototype._bugReportRendererState = function() {
    const city = this._cityScreen;
    const active = this.gameState.activeUnit;
    return {
      viewX: this.viewX,
      viewY: this.viewY,
      zoomLevel: this._zoomLevel,
      viewOnlyMode: this._viewOnlyMode,
      showGrid: this._showGrid,
      showHiddenTerrain: this._showHiddenTerrain,
      activeUnitId: active?.id ?? null,
      hoveredTile: this._hoveredTile ? { ...this._hoveredTile } : null,
      cityScreenId: city?.id ?? null,
      cityProductionListOpen: !!this._cityScreenProdList,
      civilopedia: this._civilopedia ? {
        tab: this._civilopedia.tab,
        selIdx: this._civilopedia.selIdx,
        scroll: this._civilopedia.scroll,
        mode: this._civilopedia.mode,
      } : null,
      researchChooserOpen: !!this._researchChooser,
      researchGoalOpen: !!this._researchGoalDialog,
      openScreens: [
        '_scienceAdvisor', '_tradeAdvisor', '_domesticAdvisor', '_militaryAdvisor',
        '_attitudeAdvisor', '_demographicsScreen', '_top5Cities', '_wondersList',
        '_palaceView', '_throneRoom', '_spaceshipViewer', '_highCouncil',
      ].filter(key => !!this[key]),
    };
  };

  MapRenderer.prototype._buildBugReportFile = async function(rendererState, createdAt = new Date()) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) throw new Error('Game canvas is unavailable.');
    // Snapshot gameplay first, then render during the same JavaScript turn so
    // the screenshot and save data describe one state rather than adjacent
    // animation/update frames.
    const gameState = this.gameState.toSaveData();
    const gameYear = this.gameState.year;

    // Render the exact underlying scene without the Game menu or report dialog.
    const capture = document.createElement('canvas');
    capture.width = canvas.width;
    capture.height = canvas.height;
    this.render(capture.getContext('2d'), capture.width, capture.height);
    const screenshot = await new Promise((resolve, reject) => {
      capture.toBlob(blob => blob ? resolve(blob) : reject(new Error('Screenshot capture failed.')), 'image/png');
    });

    const stamp = createdAt.toISOString().replace(/[:.]/g, '-');
    const filename = `civ2-bug-report-${stamp}.zip`;
    const report = {
      format: 'civ2-web-bug-report',
      formatVersion: 1,
      createdAt: createdAt.toISOString(),
      page: `${location.origin}${location.pathname}`,
      browser: navigator.userAgent,
      viewport: {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        cssWidth: canvas.clientWidth,
        cssHeight: canvas.clientHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      summary: {
        turn: gameState.turn,
        year: gameYear,
        activeCivilization: gameState.activeCivIdx,
        activeUnitId: gameState.activeUnitId,
        mapCols: gameState.mapCols,
        mapRows: gameState.mapRows,
      },
      rendererState,
    };
    const instructions = [
      'Civilization II Browser Recreation - Bug Report',
      '',
      'screenshot.png    Exact visible state when Report Bug was chosen.',
      'game-state.json   Full restorable GameState.toSaveData() snapshot.',
      'report.json       View/camera state, browser details, and summary.',
      '',
      'Attach this ZIP to a GitHub issue or email. Do not unpack it first.',
      'The screenshot may contain original MGE artwork; share only for bug diagnosis.',
      '',
    ].join('\n');
    const archive = createStoredZip([
      { name: 'screenshot.png', data: new Uint8Array(await screenshot.arrayBuffer()) },
      { name: 'game-state.json', data: JSON.stringify(gameState, null, 2) },
      { name: 'report.json', data: JSON.stringify(report, null, 2) },
      { name: 'README.txt', data: instructions },
    ], createdAt);
    return new File([archive], filename, { type: 'application/zip', lastModified: createdAt.getTime() });
  };

  MapRenderer.prototype._openBugReportDialog = function() {
    if (this._bugReportDialog) return;
    const rendererState = this._bugReportRendererState();
    // Start the async capture before the dialog exists. _buildBugReportFile()
    // renders synchronously up to canvas.toBlob(), so the PNG contains the
    // precise game screen beneath this support UI rather than the UI itself.
    const capturePromise = this._buildBugReportFile(rendererState);
    const dialog = this._bugReportDialog = {
      status: 'capturing',
      message: 'Capturing screenshot and exact game state...',
      file: null,
      rects: [],
    };
    dialog.promise = capturePromise
      .then(file => {
        if (this._bugReportDialog !== dialog) return file;
        dialog.file = file;
        dialog.status = 'ready';
        dialog.message = `Ready: ${file.name} (${formatBytes(file.size)})`;
        return file;
      })
      .catch(error => {
        console.error('Bug report capture failed:', error);
        if (this._bugReportDialog === dialog) {
          dialog.status = 'error';
          dialog.message = `Capture failed: ${error.message}`;
        }
        return null;
      });
  };

  MapRenderer.prototype._downloadBugReport = function() {
    const dialog = this._bugReportDialog;
    if (!dialog?.file) return false;
    downloadFile(dialog.file);
    dialog.message = `Downloaded ${dialog.file.name}`;
    return true;
  };

  MapRenderer.prototype._shareBugReport = async function() {
    const dialog = this._bugReportDialog;
    if (!dialog?.file) return false;
    const shareData = {
      title: 'Civilization II bug report',
      text: 'Civ2 browser recreation bug report with screenshot and exact game state.',
      files: [dialog.file],
    };
    try {
      if (navigator.canShare?.(shareData) && navigator.share) {
        await navigator.share(shareData);
        dialog.message = 'Report shared.';
        return true;
      }
      downloadFile(dialog.file);
      const subject = 'Civilization II bug report';
      const body = [
        'Please attach the downloaded Civ2 bug-report ZIP to this email.',
        '',
        `File: ${dialog.file.name}`,
        `Turn: ${this.gameState.turn}`,
        '',
        'The ZIP contains a screenshot, exact game state, view state, and diagnostics.',
      ].join('\n');
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        '_blank', 'noopener,noreferrer');
      dialog.message = 'Email draft opened. Attach the downloaded ZIP before sending.';
      return false;
    } catch (error) {
      if (error?.name === 'AbortError') {
        dialog.message = 'Sharing cancelled. The report is still ready.';
        return false;
      }
      console.error('Bug report sharing failed:', error);
      dialog.message = 'Sharing failed. Use Download instead.';
      return false;
    }
  };

  MapRenderer.prototype._openGitHubBugReport = function() {
    const dialog = this._bugReportDialog;
    if (!dialog?.file) return false;
    downloadFile(dialog.file);
    const reportName = dialog.file.name;
    const turn = this.gameState.turn;
    const body = [
      '## Bug description',
      '',
      '<!-- What happened, and what did you expect? -->',
      '',
      '## Reproduction package',
      '',
      `Turn: ${turn}`,
      `Please attach the downloaded \`${reportName}\` file to this issue.`,
      'It contains a screenshot, exact game state, view state, and diagnostics.',
    ].join('\n');
    const url = `${GITHUB_ISSUES_URL}?title=${encodeURIComponent('[Bug] ')}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    dialog.message = 'GitHub opened. Attach the downloaded ZIP before submitting.';
    return true;
  };

  MapRenderer.prototype._drawBugReportDialog = function(ctx, canvasW, canvasH) {
    const dialog = this._bugReportDialog;
    if (!dialog) return;
    const PW = Math.min(680, canvasW - 40);
    const PH = 250;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Report a Bug');

    ctx.font = FONT.BODY_TIMES;
    this._panelText(ctx, 'Create one support package containing:', px + 24, py + 56);
    const lines = [
      'Screenshot of the exact visible game',
      'Full restorable game-state snapshot',
      'Camera, zoom, open-screen, browser, and viewport details',
    ];
    lines.forEach((line, index) => this._panelText(ctx, `\u2022 ${line}`, px + 38, py + 82 + index * 22));
    ctx.font = FONT.BODY_SMALL;
    this._panelText(ctx, 'GitHub opens a prepared issue. Share / Email uses system sharing or opens an email draft.',
      px + 24, py + 156);

    ctx.font = FONT.SMALL_BOLD;
    ctx.fillStyle = dialog.status === 'error' ? '#a00000' : '#000000';
    ctx.fillText(dialog.message, px + 24, py + 184, PW - 48);

    const labels = ['Download ZIP', 'Share / Email', 'GitHub Issue', 'Close'];
    const gap = 10;
    const bw = Math.floor((PW - 48 - gap * 3) / 4);
    const by = py + PH - 39;
    dialog.rects = [];
    labels.forEach((label, index) => {
      const bx = px + 24 + index * (bw + gap);
      this._drawWin95Button(ctx, bx, by, bw, 26, label);
      dialog.rects.push({ action: ['download', 'share', 'github', 'close'][index], x: bx, y: by, w: bw, h: 26 });
    });

    if (dialog.status !== 'ready') {
      for (const rect of dialog.rects.slice(0, 3)) {
        ctx.fillStyle = 'rgba(192,192,192,0.58)';
        ctx.fillRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
      }
    }
  };

  MapRenderer.prototype._handleBugReportClick = function(px, py) {
    const dialog = this._bugReportDialog;
    if (!dialog) return;
    const hit = dialog.rects.find(rect => px >= rect.x && px < rect.x + rect.w && py >= rect.y && py < rect.y + rect.h);
    if (!hit) return;
    if (hit.action === 'close') {
      this._bugReportDialog = null;
      return;
    }
    if (dialog.status !== 'ready') return;
    if (hit.action === 'download') this._downloadBugReport();
    if (hit.action === 'share') void this._shareBugReport();
    if (hit.action === 'github') this._openGitHubBugReport();
  };

  MapRenderer.prototype._handleBugReportKey = function(event) {
    if (event.key === 'Escape') this._bugReportDialog = null;
    if (event.key === 'Enter' && this._bugReportDialog?.status === 'ready') this._downloadBugReport();
  };
}
