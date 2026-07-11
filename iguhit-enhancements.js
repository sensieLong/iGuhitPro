/**
 * iGuhit Enhancements Pack v3.0
 * Fixes: smart guides visibility, ruler unit matching, PDF single download,
 *        artboard tool re-selection persistence, layer radio button,
 *        layer visibility toggle, step-and-repeat
 * New: Step & Repeat panel button
 */
(function () {
    'use strict';

    // ─── Wait for Paper.js + app to be fully ready ─────────────────────────
    function whenReady(fn) {
        if (window.paper && window.state && window.saveState) { fn(); }
        else { setTimeout(() => whenReady(fn), 80); }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 1. BUTTON RIPPLE + SYNTHESIZED CLICK SOUND
    // ═══════════════════════════════════════════════════════════════════
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let _audioCtx = null;
    function getAudio() { if (!_audioCtx) _audioCtx = new AudioCtx(); return _audioCtx; }
    function playClick(isTool) {
        try {
            const ctx = getAudio();
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = isTool ? 'sine' : 'triangle';
            o.frequency.setValueAtTime(isTool ? 900 : 640, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(isTool ? 450 : 520, ctx.currentTime + 0.08);
            g.gain.setValueAtTime(0.08, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.12);
        } catch (_) {}
    }
    function attachRipple(btn) {
        if (btn.dataset.rip) return;
        btn.dataset.rip = '1';
        btn.addEventListener('click', (e) => {
            const r = document.createElement('span');
            r.className = 'iguhit-ripple-effect';
            const rect = btn.getBoundingClientRect();
            r.style.left = (e.clientX - rect.left - 5) + 'px';
            r.style.top  = (e.clientY - rect.top  - 5) + 'px';
            btn.appendChild(r);
            r.addEventListener('animationend', () => r.remove());
            playClick(btn.classList.contains('tool-btn'));
        });
    }
    function rippleAll() { document.querySelectorAll('button').forEach(attachRipple); }
    rippleAll();
    new MutationObserver(rippleAll).observe(document.body, { childList: true, subtree: true });

    // ═══════════════════════════════════════════════════════════════════
    // 2. MATH EXPRESSION EVALUATOR on all inputs
    // ═══════════════════════════════════════════════════════════════════
    function evalMath(str) {
        try {
            const s = String(str).replace(/[^0-9+\-*/().\s]/g, '');
            if (!s.trim()) return NaN;
            const v = Function('"use strict"; return (' + s + ')')();
            return (typeof v === 'number' && isFinite(v)) ? v : NaN;
        } catch (_) { return NaN; }
    }
    window.evalMath = evalMath;
    function attachMath(inp) {
        if (inp.dataset.math) return; inp.dataset.math = '1';
        inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && /[+\-*/(]/.test(this.value)) {
                const v = evalMath(this.value);
                if (!isNaN(v)) {
                    this.value = parseFloat(v.toFixed(4));
                    this.dispatchEvent(new Event('change', { bubbles: true }));
                    this.dispatchEvent(new Event('input',  { bubbles: true }));
                }
            }
        });
    }
    function mathAll() { document.querySelectorAll('input[type="number"],input[type="text"]').forEach(attachMath); }
    mathAll();
    new MutationObserver(mathAll).observe(document.body, { childList: true, subtree: true });

    // ═══════════════════════════════════════════════════════════════════
    // 3. RULERS — handled by inline script in index.html
    // ═══════════════════════════════════════════════════════════════════
    // Ruler drawing is done by window.drawRulers() defined in index.html
    // after Paper.js loads. We just wire the toggle here.
    let rulersVisible = true;
    function toggleRulers() {
        rulersVisible = !rulersVisible;
        ['ruler-h','ruler-v','ruler-corner'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = rulersVisible ? '' : 'none';
        });
        document.getElementById('canvas-viewport')
            ?.classList.toggle('canvas-viewport-with-rulers', rulersVisible);
    }
    document.getElementById('btn-toggle-rulers')?.addEventListener('click', toggleRulers);
    window.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' &&
            !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault(); toggleRulers();
        }
    });

        // ═══════════════════════════════════════════════════════════════════
    // 4. SMART GUIDES — visible magenta lines on snap
    // ═══════════════════════════════════════════════════════════════════
    let smartGuidesEnabled = true;
    const SNAP_THRESHOLD = 7; // px screen space

    // Create SVG overlay for guides (guaranteed visible above canvas)
    let guideSVG = document.getElementById('smart-guide-svg');
    if (!guideSVG) {
        guideSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        guideSVG.id = 'smart-guide-svg';
        guideSVG.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:visible;';
        const vp = document.getElementById('canvas-viewport');
        if (vp) vp.appendChild(guideSVG); else document.body.appendChild(guideSVG);
    }

    let guideLines = [];
    let guideTimeout = null;

    function clearGuides() {
        while (guideSVG.firstChild) guideSVG.removeChild(guideSVG.firstChild);
        guideLines = [];
    }

    function showGuide(type, screenPos) {
        if (!smartGuidesEnabled) return;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('stroke', '#ff00ff');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '4,3');
        line.setAttribute('opacity', '0.95');
        if (type === 'v') { // vertical guide
            line.setAttribute('x1', screenPos); line.setAttribute('y1', '0');
            line.setAttribute('x2', screenPos); line.setAttribute('y2', '9999');
        } else { // horizontal guide
            line.setAttribute('x1', '0');    line.setAttribute('y1', screenPos);
            line.setAttribute('x2', '9999'); line.setAttribute('y2', screenPos);
        }
        guideSVG.appendChild(line);
        guideLines.push(line);
        if (guideTimeout) clearTimeout(guideTimeout);
        guideTimeout = setTimeout(clearGuides, 700);
    }

    function getSnapPoint(movingItem, newCenter) {
        if (!smartGuidesEnabled || !window.paper) return newCenter;
        clearGuides();

        const allItems = [];
        paper.project.layers.forEach(layer => {
            if (layer.name === 'System Artboard') return;
            layer.children.forEach(child => {
                if (child !== movingItem && child.isInserted() && child.visible) allItems.push(child);
            });
        });

        // Also snap to artboard edges
        if (window.artboardRect) {
            allItems.push({ bounds: window.artboardRect.bounds, _isArtboard: true });
        }

        const zoom = paper.view.zoom;
        const thr  = SNAP_THRESHOLD / zoom;

        const mb = movingItem.bounds;
        const halfW = mb.width / 2, halfH = mb.height / 2;
        const mEdges = {
            left: newCenter.x - halfW,
            cx:   newCenter.x,
            right: newCenter.x + halfW,
            top:   newCenter.y - halfH,
            cy:    newCenter.y,
            bottom: newCenter.y + halfH
        };

        let snapX = null, snapY = null;

        for (const other of allItems) {
            const ob = other.bounds || other._b;
            if (!ob) continue;
            const tEdges = {
                left: ob.x, cx: ob.x + ob.width / 2, right: ob.x + ob.width,
                top:  ob.y, cy: ob.y + ob.height / 2, bottom: ob.y + ob.height
            };

            for (const [mk, mv] of Object.entries({ left: mEdges.left, cx: mEdges.cx, right: mEdges.right })) {
                for (const [tk, tv] of Object.entries({ left: tEdges.left, cx: tEdges.cx, right: tEdges.right })) {
                    if (Math.abs(mv - tv) < thr && snapX === null) {
                        snapX = newCenter.x + (tv - mv);
                        const sx = paper.view.projectToView(new paper.Point(tv, 0)).x;
                        showGuide('v', sx);
                    }
                }
            }
            for (const [mk, mv] of Object.entries({ top: mEdges.top, cy: mEdges.cy, bottom: mEdges.bottom })) {
                for (const [tk, tv] of Object.entries({ top: tEdges.top, cy: tEdges.cy, bottom: tEdges.bottom })) {
                    if (Math.abs(mv - tv) < thr && snapY === null) {
                        snapY = newCenter.y + (tv - mv);
                        const sy = paper.view.projectToView(new paper.Point(0, tv)).y;
                        showGuide('h', sy);
                    }
                }
            }
        }

        return new paper.Point(
            snapX !== null ? snapX : newCenter.x,
            snapY !== null ? snapY : newCenter.y
        );
    }

    window.getSmartSnapPoint = getSnapPoint;
    window.clearSmartGuides  = clearGuides;

    document.getElementById('btn-toggle-smartguides')?.addEventListener('click', () => {
        smartGuidesEnabled = !smartGuidesEnabled;
        clearGuides();
        const btn = document.getElementById('btn-toggle-smartguides');
        if (btn) btn.innerHTML = (smartGuidesEnabled ? '<i class="fa-solid fa-check"></i> ' : '') + 'Toggle Smart Guides';
    });

    // ═══════════════════════════════════════════════════════════════════
    // 5. CONTROL BAR VISIBILITY — always correct
    // ═══════════════════════════════════════════════════════════════════
    function setCtx(id, visible) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('visible', visible);
    }

    function updateControlBar() {
        if (!window.state || !window.paper) return;
        const tool = window.state.activeToolName;
        const sel  = window.getSelectedDrawItems ? window.getSelectedDrawItems() : [];

        const showType = tool === 'type' || (sel.length >= 1 && sel[0] instanceof paper.PointText);
        setCtx('type-tool-controls', showType);
        setCtx('type-tool-divider',  showType);
        if (showType && sel.length === 1) syncFontControls(sel[0]);

        const hasPath = sel.some(i => i instanceof paper.Path);
        const showCorner = tool === 'rect' || hasPath;
        setCtx('rect-corner-controls', showCorner);
        setCtx('rect-corner-divider',  showCorner);
        if (showCorner && sel.length === 1 && sel[0] instanceof paper.Path) syncCornerInputs(sel[0]);

        setCtx('direct-select-controls', tool === 'direct-select');
        setCtx('direct-select-divider',  tool === 'direct-select');

        setCtx('artboard-tool-controls', tool === 'artboard');
        setCtx('artboard-tool-divider',  tool === 'artboard');
    }

    whenReady(() => {
        const orig = window.onSelectionChanged;
        window.onSelectionChanged = function () {
            if (orig) orig.apply(this, arguments);
            updateControlBar();
            scheduleArrowRedraw();
        };

        // Wire all current + future tool buttons
        function wireToolBtns() {
            document.querySelectorAll('.tool-btn').forEach(btn => {
                if (btn.dataset.cbWired) return;
                btn.dataset.cbWired = '1';
                btn.addEventListener('click', () => {
                    // Use longer delay so app.js activeToolName is set first
                    setTimeout(updateControlBar, 50);
                });
            });
        }
        wireToolBtns();
        new MutationObserver(wireToolBtns).observe(document.body, { childList: true, subtree: true });
        setTimeout(updateControlBar, 500);
    });

    // ═══════════════════════════════════════════════════════════════════
    // 6. TYPE TOOL FONT CONTROLS
    // ═══════════════════════════════════════════════════════════════════
    // Fallback compose/decompose helpers in case the type-panel addon hasn't
    // loaded yet — paper.js has no native italic support for text, so italic
    // is baked into the fontWeight string ("italic 600") which paper.js
    // concatenates as-is into the canvas font shorthand ("italic 600 24px …").
    function composeWeightLocal(weight, italic) {
        weight = String(weight || '400').replace(/^italic\s+/i, '');
        return italic ? ('italic ' + weight) : weight;
    }
    function decomposeWeightLocal(weightStr) {
        const s = String(weightStr || '400').trim();
        const m = /^italic\s+(.+)$/i.exec(s);
        return m ? { weight: m[1], italic: true } : { weight: s, italic: false };
    }

    function syncFontControls(item) {
        if (!(item instanceof paper.PointText)) return;
        const ff = document.getElementById('ctrl-font-family');
        const fs = document.getElementById('ctrl-font-size');
        const fw = document.getElementById('ctrl-font-weight');
        const fi = document.getElementById('ctrl-font-style');
        if (ff && item.fontFamily) {
            const m = Array.from(ff.options).find(o => o.value === item.fontFamily || o.text === item.fontFamily);
            if (m) ff.value = m.value;
        }
        if (fs) fs.value = Math.round(item.fontSize || 24);
        const decompose = window.__decomposeFontWeight || decomposeWeightLocal;
        const decomposed = decompose(item.fontWeight);
        if (fw && decomposed.weight) {
            const match = Array.from(fw.options).find(o => o.value === decomposed.weight);
            if (match) fw.value = decomposed.weight;
        }
        if (fi) fi.value = decomposed.italic ? 'italic' : 'normal';

        if (window.__iguhitRefreshTypePanel) window.__iguhitRefreshTypePanel(item);
    }
    window.__syncTypeFontControls = syncFontControls;

    function applyFont() {
        if (!window.paper) return;

        const ff = document.getElementById('ctrl-font-family')?.value;
        const fs = parseFloat(document.getElementById('ctrl-font-size')?.value) || 24;
        const fwRaw = document.getElementById('ctrl-font-weight')?.value;
        const fi = document.getElementById('ctrl-font-style')?.value;
        const italic = fi === 'italic';

        // Route through the shared Type panel style applier when available so
        // the quick control bar and the full Type window never drift apart.
        if (window.__iguhitApplyTypeStyle) {
            window.__iguhitApplyTypeStyle({
                fontFamily: ff,
                fontWeight: fwRaw,
                italic: italic,
                fontSize: fs
            });
            return;
        }

        // Fallback (used only if the type-panel addon failed to load)
        const items = window.getSelectedDrawItems ? window.getSelectedDrawItems() : [];
        const compose = window.__composeFontWeight || composeWeightLocal;
        items.forEach(item => {
            if (!(item instanceof paper.PointText)) return;
            if (ff) item.fontFamily = ff;
            if (fs > 0) item.fontSize = fs;
            if (fwRaw) item.fontWeight = compose(fwRaw, italic);
        });
        paper.view.draw();
        if (window.saveState) saveState();
    }
    ['ctrl-font-family','ctrl-font-weight','ctrl-font-style'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyFont);
    });
    document.getElementById('ctrl-font-size')?.addEventListener('change', applyFont);

    // ═══════════════════════════════════════════════════════════════════
    // 7. RECTANGLE CORNER RADIUS
    // ═══════════════════════════════════════════════════════════════════
    let cornerLinked = true;
    const cIds = ['ctrl-corner-tl','ctrl-corner-tr','ctrl-corner-br','ctrl-corner-bl'];

    document.getElementById('btn-corner-link')?.addEventListener('click', function () {
        cornerLinked = !cornerLinked;
        this.classList.toggle('active', cornerLinked);
        const ic = this.querySelector('i');
        if (ic) ic.className = cornerLinked ? 'fa-solid fa-link' : 'fa-solid fa-link-slash';
    });
    cIds.forEach(id => {
        const inp = document.getElementById(id);
        if (!inp) return;
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') { const v = evalMath(inp.value); if (!isNaN(v)) { inp.value = Math.max(0, Math.round(v)); applyCorners(); } }
        });
        inp.addEventListener('change', () => {
            const v = Math.max(0, parseFloat(inp.value)||0); inp.value = v;
            if (cornerLinked) cIds.forEach(cid => { const el = document.getElementById(cid); if (el && cid !== id) el.value = v; });
            applyCorners();
        });
    });
    function getCornerVals() { return cIds.map(id => Math.max(0, parseFloat(document.getElementById(id)?.value)||0)); }
    function syncCornerInputs(path) {
        const d = path.data||{};
        [d.cornerTL||0, d.cornerTR||0, d.cornerBR||0, d.cornerBL||0].forEach((v,i) => {
            const el = document.getElementById(cIds[i]); if (el) el.value = v;
        });
    }
    function applyCorners() {
        if (!window.paper) return;
        const [tl,tr,br,bl] = getCornerVals();
        (window.getSelectedDrawItems ? window.getSelectedDrawItems() : []).forEach(item => {
            if (item instanceof paper.Path) rebuildCorners(item, tl, tr, br, bl);
        });
        paper.view.draw(); if (window.saveState) saveState();
    }
    function rebuildCorners(path, tl, tr, br, bl) {
        const b = path.bounds, x=b.x, y=b.y, w=b.width, h=b.height;
        const mr = Math.min(w,h)/2;
        tl=Math.min(tl,mr); tr=Math.min(tr,mr); br=Math.min(br,mr); bl=Math.min(bl,mr);
        const fill=path.fillColor?path.fillColor.clone():null, stroke=path.strokeColor?path.strokeColor.clone():null;
        const sw=path.strokeWidth, op=path.opacity, k=0.5523;
        const np = new paper.Path();
        np.add(new paper.Point(x+tl, y));
        if (tr>0) { np.add(new paper.Segment(new paper.Point(x+w-tr,y),null,new paper.Point(tr*k,0))); np.add(new paper.Segment(new paper.Point(x+w,y+tr),new paper.Point(0,-tr*k),null)); } else { np.add(new paper.Point(x+w,y)); }
        if (br>0) { np.add(new paper.Segment(new paper.Point(x+w,y+h-br),null,new paper.Point(0,br*k))); np.add(new paper.Segment(new paper.Point(x+w-br,y+h),new paper.Point(br*k,0),null)); } else { np.add(new paper.Point(x+w,y+h)); }
        if (bl>0) { np.add(new paper.Segment(new paper.Point(x+bl,y+h),null,new paper.Point(-bl*k,0))); np.add(new paper.Segment(new paper.Point(x,y+h-bl),new paper.Point(0,bl*k),null)); } else { np.add(new paper.Point(x,y+h)); }
        if (tl>0) { np.add(new paper.Segment(new paper.Point(x,y+tl),null,new paper.Point(0,-tl*k))); np.add(new paper.Segment(new paper.Point(x+tl,y),new paper.Point(-tl*k,0),null)); } else { np.add(new paper.Point(x,y)); }
        np.closed=true; np.fillColor=fill; np.strokeColor=stroke; np.strokeWidth=sw; np.opacity=op;
        np.name=path.name; np.data={...path.data,cornerTL:tl,cornerTR:tr,cornerBR:br,cornerBL:bl};
        path.replaceWith(np); np.selected=true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 8. DIRECT SELECT SEGMENT TYPES
    // ═══════════════════════════════════════════════════════════════════
    document.getElementById('btn-seg-smooth')?.addEventListener('click', () => applySegType('smooth'));
    document.getElementById('btn-seg-corner')?.addEventListener('click', () => applySegType('corner'));
    document.getElementById('btn-seg-handle-in')?.addEventListener('click', () => applySegType('handle-in'));
    document.getElementById('btn-seg-handle-out')?.addEventListener('click', () => applySegType('handle-out'));
    function applySegType(type) {
        if (!window.paper) return;
        let segs = [];
        paper.project.selectedItems.forEach(item => {
            if (item instanceof paper.Path && item.fullySelected)
                item.segments.forEach(s => { if (s.selected) segs.push(s); });
        });
        if (!segs.length) paper.project.selectedItems.forEach(item => { if (item instanceof paper.Path) item.segments.forEach(s => segs.push(s)); });
        segs.forEach(seg => {
            if (type==='smooth') seg.smooth({type:'catmull-rom'});
            else if (type==='corner') { seg.handleIn=new paper.Point(0,0); seg.handleOut=new paper.Point(0,0); }
            else if (type==='handle-in') seg.handleOut=new paper.Point(0,0);
            else seg.handleIn=new paper.Point(0,0);
        });
        paper.view.draw(); if (window.saveState) saveState();
    }

    // ═══════════════════════════════════════════════════════════════════
    // 9. ARROWHEADS — draw as Paper.js paths
    // ═══════════════════════════════════════════════════════════════════
    const arrowPaths = [];
    function clearArrows() {
        arrowPaths.forEach(p => { try { if (p.isInserted()) p.remove(); } catch(_){} });
        arrowPaths.length = 0;
    }
    function makeArrow(pt, dir, color, size, shape) {
        const n = dir.normalize(), perp = new paper.Point(-n.y, n.x);
        let p;
        if (shape === 'triangle') {
            p = new paper.Path([pt, pt.subtract(n.multiply(size)).add(perp.multiply(size*0.4)), pt.subtract(n.multiply(size)).subtract(perp.multiply(size*0.4))]);
            p.closed = true; p.fillColor = color || '#000'; p.strokeColor = null;
        } else if (shape === 'circle') {
            p = new paper.Path.Circle({ center: pt, radius: size * 0.38 });
            p.fillColor = color || '#000'; p.strokeColor = null;
        }
        if (p) { p.data = { isArrow: true }; arrowPaths.push(p); }
    }
    function redrawAllArrows() {
        clearArrows();
        if (!window.paper) return;
        paper.project.layers.forEach(layer => {
            layer.children.forEach(item => {
                if (item instanceof paper.Path && item.data &&
                    (item.data.arrowStart !== 'none' || item.data.arrowEnd !== 'none')) {
                    drawArrowsFor(item);
                }
            });
        });
    }
    function drawArrowsFor(item) {
        if (!item || !item.data || item.segments.length < 2) return;
        const color = item.strokeColor ? item.strokeColor.toCSS(true) : '#000';
        const size  = Math.max(8, (item.strokeWidth || 2) * 3.5);
        if (item.data.arrowStart && item.data.arrowStart !== 'none') {
            const dir = item.segments[0].point.subtract(item.segments[1].point);
            makeArrow(item.segments[0].point, dir, color, size, item.data.arrowStart);
        }
        if (item.data.arrowEnd && item.data.arrowEnd !== 'none') {
            const n = item.segments.length;
            const dir = item.segments[n-1].point.subtract(item.segments[n-2].point);
            makeArrow(item.segments[n-1].point, dir, color, size, item.data.arrowEnd);
        }
    }
    window.redrawAllArrows = redrawAllArrows;

    let _arrowScheduled = false;
    function scheduleArrowRedraw() {
        if (_arrowScheduled) return;
        _arrowScheduled = true;
        requestAnimationFrame(() => { redrawAllArrows(); paper.view.draw(); _arrowScheduled = false; });
    }
    ['stroke-arrow-start','stroke-arrow-end'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', scheduleArrowRedraw);
    });
    whenReady(() => { paper.view.on('updated', redrawAllArrows); });

    // ═══════════════════════════════════════════════════════════════════
    // 10. LAYER RADIO BUTTON + VISIBILITY TOGGLE
    //     Injected into updateLayersUI via monkey-patch
    // ═══════════════════════════════════════════════════════════════════
    whenReady(() => {
        const orig = window.updateLayersUI;
        if (!orig) return;
        window.updateLayersUI = function () {
            orig.apply(this, arguments);
            setTimeout(injectLayerExtras, 0);
        };
        setTimeout(injectLayerExtras, 600);
    });

    function injectLayerExtras() {
        if (!window.paper) return;
        const list = document.getElementById('layers-list');
        if (!list) return;
        const drawLayers = paper.project.layers.filter(l => l.name !== 'System Artboard');
        const listItems  = list.querySelectorAll('li.layer-item');

        listItems.forEach((li, idx) => {
            // Layers are shown in reverse
            const layer = drawLayers[drawLayers.length - 1 - idx];
            if (!layer) return;

            // ── Radio button (select-all toggle) ──
            if (!li.querySelector('.layer-radio')) {
                const radio = document.createElement('div');
                radio.className = 'layer-radio';
                radio.title = 'Click to select all items in layer';
                const allSel = layer.children.length > 0 && layer.children.every(c => c.selected);
                if (allSel) radio.classList.add('selected');
                radio.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const allSelected = layer.children.length > 0 && layer.children.every(c => c.selected);
                    if (allSelected) {
                        layer.children.forEach(c => c.selected = false);
                        radio.classList.remove('selected');
                    } else {
                        if (window.deselectAll) deselectAll();
                        layer.children.forEach(c => c.selected = true);
                        layer.activate();
                        radio.classList.add('selected');
                    }
                    if (window.onSelectionChanged) onSelectionChanged();
                    paper.view.draw();
                });
                li.insertBefore(radio, li.firstChild);
            } else {
                // Update state
                const radio = li.querySelector('.layer-radio');
                const allSel = layer.children.length > 0 && layer.children.every(c => c.selected);
                radio.classList.toggle('selected', allSel);
            }

            // ── Layer-level visibility toggle icon (distinct from existing eye icon) ──
            // The existing eye is wired in app.js; we just make sure state is correct
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 11. ARTBOARD TOOL — persistent selection across tool switches
    // ═══════════════════════════════════════════════════════════════════
    // We track selected artboard on window so it survives tool switches
    window._selectedArtboard = null;

    // Artboard click handling is done in app.js handleArtboardToolMouseDown
    // which sets window._selectedArtboard. We just expose label/highlight helpers.

    function updateArtboardLabel() {
        const lbl = document.getElementById('artboard-sel-name');
        if (!lbl) return;
        if (!window._selectedArtboard) { lbl.textContent = 'None'; return; }
        if (window._selectedArtboard === 'main') { lbl.textContent = 'Main Artboard'; return; }
        const idx = window.multiArtboards ? window.multiArtboards.indexOf(window._selectedArtboard) : -1;
        lbl.textContent = 'Artboard ' + (idx + 2);
    }

    function highlightSelectedArtboard() {
        if (!window.multiArtboards) return;
        window.multiArtboards.forEach(ab => {
            if (ab.rect && ab.rect.isInserted()) {
                ab.rect.strokeColor = (ab === window._selectedArtboard) ? '#f17c22' : '#666';
                ab.rect.strokeWidth = (ab === window._selectedArtboard) ? 2 : 1;
            }
        });
        if (window.paper) paper.view.draw();
    }

    // app.js handleArtboardToolMouseDown sets window._selectedArtboard directly.
    // No override needed here.

    // Delete button
    document.getElementById('btn-artboard-delete')?.addEventListener('click', deleteSelectedArtboard);

    window.addEventListener('keydown', e => {
        if (window.state?.activeToolName !== 'artboard') return;
        if ((e.key === 'Delete' || e.key === 'Backspace') &&
            !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault(); deleteSelectedArtboard();
        }
    });

    function deleteSelectedArtboard() {
        const ab = window._selectedArtboard;
        if (!ab) return;

        function unlockAB() { if (window.artboardLayer) window.artboardLayer.locked = false; }
        function lockAB() {
            if (window.artboardLayer) window.artboardLayer.locked = true;
            const dl = window.drawLayer ||
                (paper.project.layers.find(l => !l.locked && l.name !== 'System Artboard'));
            if (dl) { dl.locked = false; dl.activate(); window.drawLayer = dl; }
        }

        if (ab === 'main') {
            if (!confirm('Delete the main artboard frame? Your artwork stays on canvas.')) return;
            unlockAB();
            try { if (window.artboardShadow?.isInserted()) window.artboardShadow.remove(); } catch(_) {}
            try { if (window.artboardRect?.isInserted())   window.artboardRect.remove();   } catch(_) {}
            try { if (window.gridGroup?.isInserted())      window.gridGroup.remove();       } catch(_) {}
            window.artboardRect   = null;
            window.artboardShadow = null;
            window.gridGroup      = null;
            // Remove isMain alias from multiArtboards
            if (window.multiArtboards) {
                const mainIdx = window.multiArtboards.findIndex(a => a.isMain);
                if (mainIdx !== -1) window.multiArtboards.splice(mainIdx, 1);
            }
            lockAB();
            window._selectedArtboard = null;
            updateArtboardLabel();
            paper.view.draw();
            if (window.saveState) saveState();
            return;
        }

        if (!confirm('Delete this artboard?')) return;
        unlockAB();
        try { ab.group?.remove();  } catch(_) {}
        try { ab.rect?.remove();   } catch(_) {}
        try { ab.shadow?.remove(); } catch(_) {}
        try { ab.grid?.remove();   } catch(_) {}
        lockAB();
        const idx = window.multiArtboards?.indexOf(ab);
        if (idx !== -1) window.multiArtboards.splice(idx, 1);
        window._selectedArtboard = null;
        updateArtboardLabel();
        paper.view.draw();
        if (window.saveState) saveState();
    }

    // Artboard tool button click
    document.getElementById('tool-artboard')?.addEventListener('click', () => {
        window._selectedArtboard = null;
        updateArtboardLabel();
    });

    // ═══════════════════════════════════════════════════════════════════
    // 12. IMPORT / EXPORT ADOBE ILLUSTRATOR
    // ═══════════════════════════════════════════════════════════════════
    document.getElementById('btn-import-ai')?.addEventListener('click', () => {
        document.getElementById('ai-file-input')?.click();
    });
    document.getElementById('ai-file-input')?.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                paper.project.importSVG(evt.target.result, {
                    expandShapes: false,
                    onLoad: item => { if (item) { item.position = paper.view.center; if (window.saveState) saveState(); paper.view.draw(); } },
                    onError: () => alert('Could not import — ensure it is SVG or AI (SVG-compatible).')
                });
            } catch(err) { alert('Import error: ' + err.message); }
        };
        reader.readAsText(file);
        this.value = '';
    });

    document.getElementById('btn-export-ai')?.addEventListener('click', () => {
        if (!window.paper) return;
        const w = window.state?.artboardWidth || 800, h = window.state?.artboardHeight || 600;
        const raw = window.__iguhitWithTextExportFixes
            ? window.__iguhitWithTextExportFixes({ bounds: 'content', embedImages: true })
            : paper.project.exportSVG({ asString: true, bounds: 'content', embedImages: true });
        const body = (raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)||[])[1]||raw;
        const svg = `<?xml version="1.0" encoding="utf-8"?>\n<!-- Adobe Illustrator compatible SVG - iGuhit Vector -->\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:a="http://ns.adobe.com/AdobeSVGViewerExtensions/3.0/" version="1.1" width="${w}px" height="${h}px" viewBox="0 0 ${w} ${h}" xml:space="preserve"><metadata><sfw xmlns="http://ns.adobe.com/SaveForWeb/1.0/"><slices/></sfw></metadata><defs/>${body}</svg>`;
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([svg], {type:'image/svg+xml'})), download: 'iGuhit-Illustrator.svg' });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });

    // ═══════════════════════════════════════════════════════════════════
    // 13. PDF EXPORT — single download, artboard-only
    //     NOTE: btn-export-pdf is wired in app.js to exportAllArtboardsPDF.
    //     We do NOT add another listener here to prevent double download.
    // ═══════════════════════════════════════════════════════════════════
    // (deliberately left empty — app.js owns the one listener)

    // ═══════════════════════════════════════════════════════════════════
    // 14. STEP AND REPEAT — UI is in index.html, just wire the buttons
    // ═══════════════════════════════════════════════════════════════════
    let lastStepAction = null;

    // Wire buttons immediately and after DOM ready
    function wireStepRepeat() {
        const btn1 = document.getElementById('btn-step-repeat');
        const btn2 = document.getElementById('btn-repeat-last');
        if (btn1 && !btn1.dataset.wired) { btn1.dataset.wired='1'; btn1.addEventListener('click', doStepRepeat); }
        if (btn2 && !btn2.dataset.wired) { btn2.dataset.wired='1'; btn2.addEventListener('click', repeatLast); }
    }
    document.addEventListener('DOMContentLoaded', wireStepRepeat);
    whenReady(wireStepRepeat);

    function doStepRepeat() {
        if (!window.paper) return;
        const items = window.getSelectedDrawItems ? window.getSelectedDrawItems() : [];
        if (!items.length) { alert('Select at least one object first.'); return; }

        const count = Math.max(1, parseInt(document.getElementById('step-repeat-count')?.value) || 3);
        const dx    = parseFloat(document.getElementById('step-repeat-dx')?.value) || 0;
        const dy    = parseFloat(document.getElementById('step-repeat-dy')?.value) || 0;

        lastStepAction = { count, dx, dy };

        for (let i = 1; i <= count; i++) {
            items.forEach(item => {
                const clone = item.clone();
                clone.position = clone.position.add(new paper.Point(dx * i, dy * i));
                clone.selected = false;
            });
        }

        paper.view.draw();
        if (window.saveState) saveState();
        if (window.updateLayersUI) updateLayersUI();

        // Enable Repeat Last button
        const btn = document.getElementById('btn-repeat-last');
        if (btn) btn.style.opacity = '1';
    }

    function repeatLast() {
        if (!lastStepAction) return;
        const items = window.getSelectedDrawItems ? window.getSelectedDrawItems() : [];
        if (!items.length) { alert('Select an object to repeat.'); return; }

        const { count, dx, dy } = lastStepAction;
        for (let i = 1; i <= count; i++) {
            items.forEach(item => {
                const clone = item.clone();
                clone.position = clone.position.add(new paper.Point(dx * i, dy * i));
                clone.selected = false;
            });
        }
        paper.view.draw();
        if (window.saveState) saveState();
        if (window.updateLayersUI) updateLayersUI();
    }

    // Ctrl+D shortcut for Step & Repeat
    window.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' &&
            !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            if (lastStepAction) repeatLast(); else doStepRepeat();
        }
    });

    console.log('[iGuhit Enhancements v3] Loaded');
})();
