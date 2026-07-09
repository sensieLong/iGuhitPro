// =====================================================================
// iGuhit Type Window — Illustrator-style Character/Paragraph panel
// =====================================================================
// Adds:
//   • A floating, draggable "Type" window with Character + Paragraph tabs
//     (font family, weight, italic, size, leading, tracking, color, align)
//   • Real in-canvas text editing (click to create & type directly, click
//     an existing text object to edit it, double-click with any tool)
//   • A working italic implementation (paper.js has no native italic — it
//     is baked into the fontWeight string, which paper.js concatenates
//     as-is into the canvas font shorthand)
//   • A working letter-spacing/tracking implementation via the canvas 2D
//     `letterSpacing` API (feature-detected; degrades gracefully)
// This file is purely additive — if it fails to load, app.js falls back
// to its original prompt()-based text creation.
// =====================================================================

(function () {
    'use strict';

    function whenReady(fn) {
        if (window.paper && window.getSelectedDrawItems) {
            fn();
        } else {
            setTimeout(function () { whenReady(fn); }, 50);
        }
    }

    // -----------------------------------------------------------------
    // Weight/Italic composition
    // paper.js's TextStyle#getFontStyle() builds the canvas font string as
    // `${fontWeight} ${fontSize}px ${fontFamily}` — there is no italic slot.
    // "italic 600" is valid CSS font-shorthand syntax, so prefixing the
    // weight with "italic " gives real italic rendering with zero risk to
    // paper.js internals.
    // -----------------------------------------------------------------
    function composeFontWeight(weight, italic) {
        var w = String(weight || '400').replace(/^italic\s+/i, '').trim();
        return italic ? ('italic ' + w) : w;
    }
    function decomposeFontWeight(fontWeightStr) {
        var s = String(fontWeightStr || '400').trim();
        var m = /^italic\s+(.+)$/i.exec(s);
        return m ? { weight: m[1], italic: true } : { weight: s, italic: false };
    }
    window.__composeFontWeight = composeFontWeight;
    window.__decomposeFontWeight = decomposeFontWeight;

    function normalizeCustomFontFamily(name) {
        name = (name || '').trim();
        if (!name) return null;
        if (name.indexOf(',') !== -1) return name;
        var needsQuotes = /\s/.test(name) && !/^['"]/.test(name);
        return (needsQuotes ? ("'" + name + "'") : name) + ', sans-serif';
    }

    // -----------------------------------------------------------------
    // Custom font import — lets the person pick a .ttf/.otf/.woff/.woff2
    // file from their own device instead of typing a font name. Loaded via
    // the standard FontFace API, which also makes the font immediately
    // usable by canvas (so it renders correctly on the artboard AND in the
    // rasterized PDF export) without any extra plumbing.
    // -----------------------------------------------------------------
    var customFonts = []; // { familyName, cssValue, fileName }

    function addCustomFontOption(cssValue, label) {
        [document.getElementById('tp-font-family'), document.getElementById('ctrl-font-family')].forEach(function (sel) {
            if (!sel) return;
            var exists = Array.prototype.some.call(sel.options, function (o) { return o.value === cssValue; });
            if (exists) return;
            var opt = document.createElement('option');
            opt.value = cssValue;
            opt.textContent = label;
            var customOpt = Array.prototype.find.call(sel.options, function (o) { return o.value === '__custom__'; });
            if (customOpt) sel.insertBefore(opt, customOpt);
            else sel.appendChild(opt);
        });
    }

    function loadCustomFontFile(file) {
        var hint = document.getElementById('tp-font-file-hint');
        if (hint) hint.textContent = 'Loading ' + file.name + '…';

        var reader = new FileReader();
        reader.onerror = function () {
            alert('Could not read that file.');
            refreshTypePanel();
        };
        reader.onload = function (ev) {
            var buffer = ev.target.result;
            var baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim() || 'Custom Font';
            var familyName = baseName, n = 1;
            while (customFonts.some(function (f) { return f.familyName === familyName; })) {
                familyName = baseName + ' ' + (++n);
            }
            try {
                var fontFace = new FontFace(familyName, buffer);
                fontFace.load().then(function (loaded) {
                    document.fonts.add(loaded);
                    var cssValue = "'" + familyName + "', sans-serif";
                    customFonts.push({ familyName: familyName, cssValue: cssValue, fileName: file.name });
                    addCustomFontOption(cssValue, familyName);

                    var ff = document.getElementById('tp-font-family');
                    if (ff) ff.value = cssValue;
                    var customRow = document.getElementById('tp-font-custom-row');
                    if (customRow) customRow.style.display = 'none';
                    if (hint) hint.textContent = 'Loaded: ' + file.name;

                    applyStyle({ fontFamily: cssValue });
                    if (window.paper) paper.view.draw();
                }).catch(function (err) {
                    console.warn('iGuhit: font load failed', err);
                    alert('Could not load that font file. Please try a .ttf, .otf, .woff, or .woff2 file.');
                    refreshTypePanel();
                });
            } catch (err) {
                console.warn('iGuhit: FontFace unavailable or invalid file', err);
                alert('Could not load that font file.');
                refreshTypePanel();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    // -----------------------------------------------------------------
    // Webfont loading helper — makes newly-picked Google Fonts show up on
    // the canvas as soon as they finish downloading instead of waiting for
    // a later unrelated redraw.
    // -----------------------------------------------------------------
    function ensureFontLoaded(cssFamily, weight, size) {
        if (!document.fonts || !document.fonts.load) return;
        try {
            var first = String(cssFamily).split(',')[0].replace(/['"]/g, '').trim();
            var w = String(weight || '400').replace(/^italic\s+/i, '');
            var numericWeight = /^\d+$/.test(w) ? w : '400';
            document.fonts.load(numericWeight + ' ' + Math.round(size || 16) + 'px "' + first + '"')
                .then(function () { if (window.paper && paper.view) paper.view.draw(); })
                .catch(function () {});
        } catch (e) {}
    }
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
            if (window.paper && paper.view) paper.view.draw();
        }).catch(function () {});
    }

    // -----------------------------------------------------------------
    // Tracking (letter-spacing) render patch.
    // paper.js has no letter-spacing concept at all, but modern browsers'
    // Canvas 2D context supports a native `letterSpacing` property that
    // affects any subsequent fillText/strokeText call on that context.
    // We wrap PointText's draw routine to set it immediately before paper.js
    // draws the glyphs, based on a custom `item.data.tracking` value
    // (in 1/1000 em, matching Illustrator's units), then reset it after.
    // Feature-detected against the prototype (not an instance) to avoid the
    // classic false-positive of "setting a property creates a plain own
    // property even when unsupported".
    // -----------------------------------------------------------------
    var LETTER_SPACING_SUPPORTED = (typeof CanvasRenderingContext2D !== 'undefined') &&
        ('letterSpacing' in CanvasRenderingContext2D.prototype);

    function installTrackingPatch() {
        try {
            if (!window.paper || !paper.PointText || paper.PointText.__iguhitTrackingPatched) return;
            var proto = paper.PointText.prototype;
            var origDraw = proto._draw;
            if (typeof origDraw !== 'function') return;

            proto._draw = function (ctx) {
                var applied = false;
                var tracking = (this.data && this.data.tracking) || 0;
                if (tracking && LETTER_SPACING_SUPPORTED) {
                    try {
                        var px = (tracking / 1000) * (this.fontSize || 12);
                        ctx.letterSpacing = px + 'px';
                        applied = true;
                    } catch (e) {}
                }
                origDraw.apply(this, arguments);
                if (applied) {
                    try { ctx.letterSpacing = '0px'; } catch (e) {}
                }
            };
            paper.PointText.__iguhitTrackingPatched = true;
        } catch (e) {
            console.warn('iGuhit: tracking patch unavailable, letter-spacing control will be inert.', e);
        }
    }

    // -----------------------------------------------------------------
    // Find a PointText under a project-space point (used by the Type tool
    // to edit-in-place, and by the double-click handler).
    // -----------------------------------------------------------------
    function findTextAt(point) {
        try {
            var result = paper.project.hitTest(point, { fill: true, stroke: true, tolerance: 6 / paper.view.zoom });
            if (result && result.item) {
                var candidate = result.item;
                while (candidate && !(candidate instanceof paper.PointText) && candidate.parent) {
                    candidate = candidate.parent;
                }
                if (candidate instanceof paper.PointText) {
                    // Individual letters of a "Type on Circle" text aren't
                    // independently editable — they're regenerated by the
                    // path layout, so editing one directly would be lost.
                    if (candidate.parent && candidate.parent.data && candidate.parent.data.isTypeOnPathText) return null;
                    return candidate;
                }
            }
        } catch (e) {}
        try {
            var all = paper.project.getItems({ class: paper.PointText });
            for (var i = all.length - 1; i >= 0; i--) {
                if (all[i].parent && all[i].parent.data && all[i].parent.data.isTypeOnPathText) continue;
                if (all[i].bounds && all[i].bounds.contains(point)) return all[i];
            }
        } catch (e) {}
        return null;
    }
    window.__iguhitFindTextAt = findTextAt;

    // -----------------------------------------------------------------
    // Type on a Circle — wraps a text item's characters around a path,
    // Illustrator-style. Each character stays a normal, undistorted
    // PointText; only its position/rotation is derived from the path, so
    // reshaping the path (e.g. circle -> oval) re-flows the letters without
    // stretching them.
    // -----------------------------------------------------------------
    var __typeOnPathMeasureCtx = null;
    function getTypeOnPathMeasureCtx() {
        if (!__typeOnPathMeasureCtx) __typeOnPathMeasureCtx = document.createElement('canvas').getContext('2d');
        return __typeOnPathMeasureCtx;
    }

    function layoutTextOnPath(textGroup, pathItem) {
        if (!textGroup || !pathItem || !pathItem.isInserted || !pathItem.isInserted()) return;
        var cfg = textGroup.data && textGroup.data.typeOnPath;
        if (!cfg) return;

        // Always rebuild from a clean slate — if the group itself was
        // dragged/rotated/scaled directly, its own matrix would otherwise
        // double up with the absolute positions computed below.
        textGroup.removeChildren();
        try { textGroup.matrix = new paper.Matrix(); } catch (e) {}

        var totalLength = pathItem.length || 0;
        if (!totalLength) return;

        var content = cfg.content || '';
        var fontSize = cfg.fontSize || 24;
        var fontFamily = cfg.fontFamily || 'Inter, sans-serif';
        var fontWeight = cfg.fontWeight || '600';
        var tracking = cfg.tracking || 0;
        var color = cfg.fillColorHex || '#000000';

        var decomposed = decomposeFontWeight(fontWeight);
        var ctx = getTypeOnPathMeasureCtx();
        ctx.font = (decomposed.italic ? 'italic ' : '') + decomposed.weight + ' ' + fontSize + 'px ' + fontFamily;
        var letterSpacingPx = tracking ? (tracking / 1000) * fontSize : 0;

        // Half the cap-height, so the visual MIDDLE of each letter sits on
        // the path line instead of its baseline (which would otherwise
        // leave the whole letter floating above/below the line).
        var sampleMetrics = ctx.measureText(content || 'Mg');
        var verticalShift = (sampleMetrics.actualBoundingBoxAscent || fontSize * 0.7) / 2;

        var chars = content.split('');
        var widths = chars.map(function (ch) { return ctx.measureText(ch === ' ' ? ' ' : ch).width + letterSpacingPx; });
        var totalTextLength = widths.reduce(function (a, b) { return a + b; }, 0);

        var flip = !!cfg.flip;
        // Normal mode centers a forward-walked block on the path. Inverted
        // mode centers the SAME block on the opposite side of the path
        // (shift by half the circumference) and walks it backwards — the
        // path's direction naturally reverses left/right between the two
        // opposite sides of a closed loop, so walking backwards keeps the
        // text reading left-to-right instead of coming out mirrored. Each
        // glyph is also rotated 180° so it isn't upside down once flipped
        // to the inside/bottom of the path.
        var blockStart = (totalLength - totalTextLength) / 2 + (flip ? totalLength / 2 : 0);
        var direction = flip ? -1 : 1;
        var offset = flip ? (blockStart + totalTextLength) : blockStart;

        chars.forEach(function (ch, i) {
            var charWidth = widths[i];
            if (ch !== ' ') {
                var midOffset = offset + direction * (charWidth / 2);
                var wrapped = ((midOffset % totalLength) + totalLength) % totalLength;
                var point, tangent;
                try {
                    point = pathItem.getPointAt(wrapped);
                    tangent = pathItem.getTangentAt(wrapped);
                } catch (e) {}
                if (point && tangent) {
                    try {
                        var angle = tangent.angle + (flip ? 180 : 0);
                        // Shift the anchor toward the glyph's own "up"
                        // direction (rotated the same way) so the path line
                        // runs through the letter's visual middle.
                        var centerOffset = new paper.Point(0, -verticalShift).rotate(angle);
                        var charText = new paper.PointText({
                            point: [0, 0],
                            content: ch,
                            fontSize: fontSize,
                            fontFamily: fontFamily,
                            fontWeight: fontWeight,
                            justification: 'center',
                            fillColor: color
                        });
                        charText.rotate(angle, new paper.Point(0, 0));
                        charText.translate(point.subtract(centerOffset));
                        textGroup.addChild(charText);
                    } catch (e) {}
                }
            }
            offset += direction * charWidth;
        });

        // Remember where this landed so a future manual drag of the text
        // group (as opposed to the path) can be detected and applied to the
        // linked path instead of drifting apart from it.
        try {
            var c = textGroup.bounds ? textGroup.bounds.center : null;
            if (c) textGroup.data.lastKnownCenter = { x: c.x, y: c.y };
        } catch (e) {}
    }

    function findTypeOnPathTextFor(pathItem) {
        try {
            var linkId = pathItem.data && pathItem.data.typeOnPathId;
            if (linkId == null) return null;
            var matches = paper.project.getItems({ match: function (i) {
                return i.data && i.data.isTypeOnPathText && i.data.sourcePathId === linkId;
            } });
            return (matches && matches.length) ? matches[0] : null;
        } catch (e) { return null; }
    }

    function findTypeOnPathSourceFor(textGroup) {
        try {
            var linkId = textGroup.data && textGroup.data.sourcePathId;
            if (linkId == null) return null;
            var matches = paper.project.getItems({ match: function (i) {
                return i.data && i.data.typeOnPathId === linkId;
            } });
            return (matches && matches.length) ? matches[0] : null;
        } catch (e) { return null; }
    }

    // Keeps a "Type on Circle" path and its text glued together, and
    // re-flows the letters whenever the path is reshaped — called right
    // before every saveState() so both are captured correctly in the very
    // same undo step, not one step behind.
    function relayoutSelectedTypeOnPathCircles() {
        try {
            var items = window.getSelectedDrawItems ? window.getSelectedDrawItems() : [];
            items.forEach(function (it) {
                if (!it) return;
                if (it.data && it.data.isTypeOnPathSource) {
                    // The circle was moved or reshaped directly — re-derive
                    // the text from its current shape.
                    var textGroup = findTypeOnPathTextFor(it);
                    if (textGroup) layoutTextOnPath(textGroup, it);
                } else if (it.data && it.data.isTypeOnPathText) {
                    // The text was dragged directly — move the linked
                    // circle by the same delta so they stay together, then
                    // re-derive exact glyph positions fresh from it (rather
                    // than trusting wherever the drag imprecisely left them).
                    var pathItem = findTypeOnPathSourceFor(it);
                    if (pathItem) {
                        var last = it.data.lastKnownCenter;
                        var current = it.bounds ? it.bounds.center : null;
                        if (last && current) {
                            var dx = current.x - last.x;
                            var dy = current.y - last.y;
                            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                                pathItem.position = pathItem.position.add(new paper.Point(dx, dy));
                            }
                        }
                        layoutTextOnPath(it, pathItem);
                    }
                }
            });
        } catch (e) {}
    }

    // Called directly from app.js's drag handlers on every frame (not just
    // at drag-end) so Type on Circle text visibly follows along live while
    // the person is still dragging or resizing, rather than only snapping
    // into place after they let go.
    window.__iguhitRelayoutTypeOnPathFor = function (item, delta) {
        try {
            if (!item || !item.data) return;
            if (item.data.isTypeOnPathSource) {
                var textGroup = findTypeOnPathTextFor(item);
                if (textGroup) layoutTextOnPath(textGroup, item);
            } else if (item.data.isTypeOnPathText) {
                var pathItem = findTypeOnPathSourceFor(item);
                if (pathItem) {
                    if (delta) pathItem.position = pathItem.position.add(delta);
                    layoutTextOnPath(item, pathItem);
                }
            }
        } catch (e) {}
    };

    window.__iguhitApplyTypeOnCircle = function (flip) {
        var items = (window.getSelectedDrawItems ? window.getSelectedDrawItems() : [])
            .filter(function (i) { return i instanceof paper.PointText; });
        var sourceItem = (editSession && editSession.item) ? editSession.item : items[0];

        if (!sourceItem) {
            alert('Select or create a text item first, then click "Type on Circle".');
            return;
        }
        if (editSession && editSession.item === sourceItem) commitTypeEditing();
        if (!sourceItem.isInserted || !sourceItem.isInserted()) return;

        var content = sourceItem.content || '';
        if (!content.trim()) {
            alert('That text is empty.');
            return;
        }

        var fontSize = sourceItem.fontSize || 24;
        var fontFamily = sourceItem.fontFamily || 'Inter, sans-serif';
        var fontWeight = sourceItem.fontWeight || '600';
        var tracking = (sourceItem.data && sourceItem.data.tracking) || 0;
        var colorHex = sourceItem.fillColor ? sourceItem.fillColor.toCSS(true) : '#000000';
        var center = sourceItem.point.clone();

        // Pick a radius comfortable enough to fit the text around the ring.
        var decomposed = decomposeFontWeight(fontWeight);
        var ctx = getTypeOnPathMeasureCtx();
        ctx.font = (decomposed.italic ? 'italic ' : '') + decomposed.weight + ' ' + fontSize + 'px ' + fontFamily;
        var totalW = 0;
        content.split('').forEach(function (ch) {
            totalW += ctx.measureText(ch).width + (tracking ? (tracking / 1000) * fontSize : 0);
        });
        var circumference = Math.max(totalW * 1.5, fontSize * 6);
        var radius = circumference / (2 * Math.PI);

        var circle = new paper.Path.Circle({ center: center, radius: radius });
        circle.fillColor = null;
        circle.strokeColor = '#a0a0a0';
        circle.strokeWidth = 1;
        circle.data = circle.data || {};
        circle.data.isTypeOnPathSource = true;
        // paper.js's own .id changes whenever this app clones/replaces an
        // item mid-transform (see handleSelectMouseDrag's live-scale path),
        // so the path<->text link needs its own stable id that survives
        // cloning (Item#clone() copies .data, including this).
        var linkId = 'totp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        circle.data.typeOnPathId = linkId;

        var textGroup = new paper.Group();
        textGroup.data = {
            isTypeOnPathText: true,
            sourcePathId: linkId,
            typeOnPath: {
                content: content,
                fontFamily: fontFamily,
                fontWeight: fontWeight,
                fontSize: fontSize,
                tracking: tracking,
                fillColorHex: colorHex,
                flip: !!flip
            }
        };

        sourceItem.remove();
        layoutTextOnPath(textGroup, circle);

        if (window.deselectAll) deselectAll();
        circle.selected = true;
        if (window.onSelectionChanged) onSelectionChanged();
        if (window.paper) paper.view.draw();
        if (window.saveState) saveState();
    };

    // Toggle Inverted on/off for an already-created Type on Circle, without
    // needing to delete and redo it — handy since flip is otherwise a
    // one-shot choice made at creation time.
    window.__iguhitToggleTypeOnCircleFlip = function () {
        var selected = (window.getSelectedDrawItems ? window.getSelectedDrawItems() : []);
        var pathItem = selected.find(function (i) { return i && i.data && i.data.isTypeOnPathSource; });
        if (!pathItem) return false;
        var textGroup = findTypeOnPathTextFor(pathItem);
        if (!textGroup || !textGroup.data || !textGroup.data.typeOnPath) return false;
        textGroup.data.typeOnPath.flip = !textGroup.data.typeOnPath.flip;
        layoutTextOnPath(textGroup, pathItem);
        if (window.paper) paper.view.draw();
        if (window.saveState) saveState();
        return true;
    };

    // -----------------------------------------------------------------
    // Central style-apply function — the single source of truth used by
    // BOTH the quick control-bar (ctrl-font-*) and the full Type window,
    // so the two surfaces can never drift out of sync.
    // -----------------------------------------------------------------
    var editSession = null; // { item, overlay, isNew, originalContent, prevOpacity }

    window.__iguhitApplyTypeStyle = function (props) {
        if (!window.paper) return;
        var items = (window.getSelectedDrawItems ? window.getSelectedDrawItems() : [])
            .filter(function (i) { return i instanceof paper.PointText; });
        if (!items.length) return;

        items.forEach(function (item) {
            item.data = item.data || {};

            if (props.fontFamily !== undefined && props.fontFamily) {
                item.fontFamily = props.fontFamily;
                ensureFontLoaded(props.fontFamily, item.fontWeight, item.fontSize);
            }
            if (props.fontWeight !== undefined || props.italic !== undefined) {
                var cur = decomposeFontWeight(item.fontWeight);
                var w = props.fontWeight !== undefined ? props.fontWeight : cur.weight;
                var it = props.italic !== undefined ? props.italic : cur.italic;
                item.fontWeight = composeFontWeight(w, it);
            }
            if (props.fontSize !== undefined && props.fontSize > 0) {
                var wasAuto = item.data.leadingAuto !== false;
                var xform = getItemTransform(item);
                var scaleY = xform.scaleY || 1;
                var newLocalSize = props.fontSize / scaleY;
                item.fontSize = newLocalSize;
                if (wasAuto) item.leading = newLocalSize * 1.2;
            }
            if (props.leadingAuto !== undefined) {
                item.data.leadingAuto = props.leadingAuto;
                if (props.leadingAuto) item.leading = item.fontSize * 1.2;
            }
            if (props.leading !== undefined && props.leading !== null && !isNaN(props.leading)) {
                item.data.leadingAuto = false;
                var xformL = getItemTransform(item);
                item.leading = props.leading / (xformL.scaleY || 1);
            }
            if (props.tracking !== undefined && !isNaN(props.tracking)) {
                item.data.tracking = props.tracking;
            }
            if (props.justification !== undefined) {
                item.justification = props.justification;
            }
            if (props.fillColorHex !== undefined) {
                item.fillColor = props.fillColorHex;
            }
            if (props.verticalScalePercent !== undefined && !isNaN(props.verticalScalePercent)) {
                var xformV = getItemTransform(item);
                var newScaleY = Math.max(0.1, props.verticalScalePercent / 100);
                setItemLinearTransform(item, xformV.scaleX, newScaleY, xformV.rotation);
            }
        });

        paper.view.draw();
        if (window.saveState) saveState(); // saveState() also calls onSelectionChanged()

        if (editSession && items.indexOf(editSession.item) !== -1) {
            refreshOverlay();
        }
    };

    // Defaults used when creating a brand-new text item (nothing selected
    // yet), pulled from whichever panel fields the person has already set.
    window.__iguhitGetTypeDefaults = function () {
        var alignBtn = ['left', 'center', 'right'].find(function (j) {
            var el = document.getElementById('tp-align-' + j);
            return el && el.classList.contains('active');
        });
        return {
            fontFamily: currentPanelFontFamily() || (document.getElementById('ctrl-font-family') || {}).value || 'Inter, sans-serif',
            fontWeight: (document.getElementById('tp-font-weight') || {}).value || (document.getElementById('ctrl-font-weight') || {}).value || '600',
            italic: !!(document.getElementById('tp-btn-italic') && document.getElementById('tp-btn-italic').classList.contains('active')),
            fontSize: parseFloat((document.getElementById('tp-font-size') || {}).value) || parseFloat((document.getElementById('ctrl-font-size') || {}).value) || 24,
            leadingAuto: document.getElementById('tp-leading-auto') ? document.getElementById('tp-leading-auto').checked : true,
            leading: parseFloat((document.getElementById('tp-leading') || {}).value) || null,
            tracking: parseFloat((document.getElementById('tp-tracking-val') || {}).value) || 0,
            justification: alignBtn || 'left',
            fillColorHex: (document.getElementById('tp-font-color') || {}).value || (document.getElementById('fill-color') || {}).value || '#000000'
        };
    };

    function currentPanelFontFamily() {
        var ff = document.getElementById('tp-font-family');
        if (!ff) return undefined;
        if (ff.value === '__custom__') return undefined; // waiting on a font-file import
        return ff.value;
    }

    // -----------------------------------------------------------------
    // Panel refresh — mirrors the currently-edited/selected text item's
    // properties into the Type window (or, if nothing text-related is
    // selected, mirrors the settings the NEXT new text item would use).
    // -----------------------------------------------------------------
    function getEditingOrSelectedTextItem() {
        if (editSession && editSession.item && editSession.item.isInserted && editSession.item.isInserted()) {
            return editSession.item;
        }
        var items = (window.getSelectedDrawItems ? window.getSelectedDrawItems() : [])
            .filter(function (i) { return i instanceof paper.PointText; });
        return items.length ? items[0] : null;
    }

    function refreshTypePanel(passedItem) {
        var win = document.getElementById('type-window');
        if (!win) return; // markup not present

        var item = (passedItem instanceof paper.PointText) ? passedItem : getEditingOrSelectedTextItem();

        var ff = document.getElementById('tp-font-family');
        var customRow = document.getElementById('tp-font-custom-row');
        var customHint = document.getElementById('tp-font-file-hint');
        var fw = document.getElementById('tp-font-weight');
        var fs = document.getElementById('tp-font-size');
        var boldBtn = document.getElementById('tp-btn-bold');
        var italicBtn = document.getElementById('tp-btn-italic');
        var leading = document.getElementById('tp-leading');
        var leadingAuto = document.getElementById('tp-leading-auto');
        var vscale = document.getElementById('tp-vscale');
        var trackRange = document.getElementById('tp-tracking');
        var trackVal = document.getElementById('tp-tracking-val');
        var colorInput = document.getElementById('tp-font-color');
        var aligns = { left: document.getElementById('tp-align-left'), center: document.getElementById('tp-align-center'), right: document.getElementById('tp-align-right') };

        var fontFamily, weight, italic, fontSize, leadingVal, leadingAutoVal, tracking, justification, colorHex, vscalePercent;

        if (item) {
            fontFamily = item.fontFamily || 'Inter, sans-serif';
            var decomposed = decomposeFontWeight(item.fontWeight);
            weight = decomposed.weight;
            italic = decomposed.italic;
            var xform = getItemTransform(item);
            fontSize = Math.round((item.fontSize || 24) * (xform.scaleY || 1));
            item.data = item.data || {};
            leadingAutoVal = item.data.leadingAuto !== false;
            leadingVal = Math.round((item.leading || ((item.fontSize || 24) * 1.2)) * (xform.scaleY || 1));
            tracking = item.data.tracking || 0;
            justification = item.justification || 'left';
            colorHex = item.fillColor ? item.fillColor.toCSS(true) : ((document.getElementById('fill-color') || {}).value || '#000000');
            vscalePercent = Math.round((xform.scaleY || 1) * 100);
        } else {
            fontFamily = (document.getElementById('ctrl-font-family') || {}).value || 'Inter, sans-serif';
            weight = (document.getElementById('ctrl-font-weight') || {}).value || '600';
            italic = (document.getElementById('ctrl-font-style') || {}).value === 'italic';
            fontSize = parseFloat((document.getElementById('ctrl-font-size') || {}).value) || 24;
            leadingAutoVal = true;
            leadingVal = Math.round(fontSize * 1.2);
            tracking = 0;
            justification = 'left';
            colorHex = (document.getElementById('fill-color') || {}).value || '#000000';
            vscalePercent = 100;
        }

        if (ff) {
            var match = Array.prototype.find.call(ff.options, function (o) { return o.value === fontFamily; });
            if (match) {
                ff.value = fontFamily;
                if (customRow) customRow.style.display = 'none';
            } else {
                ff.value = '__custom__';
                if (customRow) customRow.style.display = '';
                if (customHint) customHint.textContent = 'Currently: ' + fontFamily;
            }
        }
        if (fw) {
            var wMatch = Array.prototype.find.call(fw.options, function (o) { return o.value === weight; });
            fw.value = wMatch ? weight : '600';
        }
        if (boldBtn) boldBtn.classList.toggle('active', (parseInt(weight, 10) || 400) >= 700);
        if (italicBtn) italicBtn.classList.toggle('active', !!italic);
        if (fs) fs.value = fontSize;
        if (leading) { leading.value = leadingVal; leading.disabled = !!leadingAutoVal; }
        if (leadingAuto) leadingAuto.checked = !!leadingAutoVal;
        if (vscale) vscale.value = vscalePercent;
        if (trackRange) trackRange.value = tracking;
        if (trackVal) trackVal.value = tracking;
        if (colorInput) colorInput.value = colorHex;
        Object.keys(aligns).forEach(function (key) {
            if (aligns[key]) aligns[key].classList.toggle('active', justification === key);
        });
    }
    window.__iguhitRefreshTypePanel = refreshTypePanel;

    function applyStyle(props) {
        if (window.__iguhitApplyTypeStyle) window.__iguhitApplyTypeStyle(props);
    }

    // -----------------------------------------------------------------
    // Extra rotation/scale applied via the selection tool's transform
    // handles. PointText keeps these in a separate matrix rather than
    // baking them into fontSize/geometry the way Path items do, so both
    // the live editor overlay and the panel need to read this explicitly
    // or a transformed text item will appear "reset" to its small,
    // unrotated base size the next time it's edited.
    // -----------------------------------------------------------------
    function getItemTransform(item) {
        var scaleX = 1, scaleY = 1, rotation = 0;
        try {
            if (item.matrix && typeof item.matrix.decompose === 'function') {
                var dec = item.matrix.decompose();
                if (dec) {
                    scaleX = (dec.scaling && typeof dec.scaling.x === 'number') ? dec.scaling.x : 1;
                    scaleY = (dec.scaling && typeof dec.scaling.y === 'number') ? dec.scaling.y : 1;
                    rotation = dec.rotation || 0;
                }
            }
        } catch (e) {}
        return { scaleX: scaleX, scaleY: scaleY, rotation: rotation };
    }

    // Rebuilds an item's matrix with a specific scaleX/scaleY/rotation while
    // keeping its on-canvas anchor point exactly where it was — used by the
    // Vertical Scale ("text height") control so it only changes height, not
    // position or the existing rotation.
    function setItemLinearTransform(item, scaleX, scaleY, rotationDeg) {
        try {
            var anchor = item.point.clone();
            var rad = (rotationDeg * Math.PI) / 180;
            var cosR = Math.cos(rad), sinR = Math.sin(rad);
            var a = scaleX * cosR, b = scaleX * sinR, c = -scaleY * sinR, d = scaleY * cosR;
            item.matrix = new paper.Matrix(a, b, c, d, item.matrix.tx, item.matrix.ty);
            item.point = anchor;
        } catch (e) {}
    }

    // -----------------------------------------------------------------
    // In-canvas live text editing
    // -----------------------------------------------------------------
    function refreshOverlay() {
        if (!editSession) return;
        styleOverlay();
        autosizeOverlay();
        positionOverlay();
    }

    function positionOverlay() {
        if (!editSession) return;
        var item = editSession.item, overlay = editSession.overlay;
        var canvasEl = document.getElementById('paper-canvas');
        var viewportEl = document.getElementById('canvas-viewport');
        if (!canvasEl || !viewportEl) return;
        var canvasRect = canvasEl.getBoundingClientRect();
        var viewportRect = viewportEl.getBoundingClientRect();
        var viewPt = paper.view.projectToView(item.point);
        var targetX = (canvasRect.left - viewportRect.left) + viewPt.x;
        var targetY = (canvasRect.top - viewportRect.top) + viewPt.y;

        var j = item.justification || 'left';
        var anchorXPercent = j === 'center' ? 50 : (j === 'right' ? 100 : 0);
        var zoom = paper.view.zoom || 1;
        var ascentPx = (item.fontSize || 24) * 0.8 * zoom;
        var boxWidth = overlay.offsetWidth || 1;
        var boxHeight = overlay.offsetHeight || ascentPx || 1;
        var anchorYPercent = Math.max(0, Math.min(100, (ascentPx / boxHeight) * 100));

        // Place the overlay at its natural (untransformed) position, then
        // rotate/scale around the anchor point, then translate that same
        // anchor point onto the real on-canvas position — computed directly
        // in pixels so it's correct regardless of rotation/scale.
        var anchorLocalX = (anchorXPercent / 100) * boxWidth;
        var anchorLocalY = (anchorYPercent / 100) * boxHeight;
        var translateX = targetX - anchorLocalX;
        var translateY = targetY - anchorLocalY;

        var t = getItemTransform(item);

        overlay.style.left = '0px';
        overlay.style.top = '0px';
        overlay.style.transformOrigin = anchorXPercent + '% ' + anchorYPercent + '%';
        overlay.style.transform =
            'translate(' + translateX + 'px, ' + translateY + 'px) ' +
            'rotate(' + t.rotation + 'deg) ' +
            'scale(' + t.scaleX + ', ' + t.scaleY + ')';
        overlay.style.textAlign = j;
    }

    function styleOverlay() {
        if (!editSession) return;
        var item = editSession.item, overlay = editSession.overlay;
        var zoom = paper.view.zoom || 1;
        var decomposed = decomposeFontWeight(item.fontWeight);
        overlay.style.fontFamily = item.fontFamily || 'sans-serif';
        overlay.style.fontWeight = decomposed.weight;
        overlay.style.fontStyle = decomposed.italic ? 'italic' : 'normal';
        overlay.style.fontSize = ((item.fontSize || 24) * zoom) + 'px';
        var leadingPx = item.leading || ((item.fontSize || 24) * 1.2);
        overlay.style.lineHeight = (leadingPx * zoom) + 'px';
        overlay.style.color = item.fillColor ? item.fillColor.toCSS(true) : '#000000';
        var tracking = (item.data && item.data.tracking) || 0;
        overlay.style.letterSpacing = ((tracking / 1000) * (item.fontSize || 24) * zoom) + 'px';
    }

    function autosizeOverlay() {
        if (!editSession) return;
        var overlay = editSession.overlay;
        overlay.style.width = '20px';
        overlay.style.height = '20px';
        overlay.style.width = Math.max(24, overlay.scrollWidth + 12) + 'px';
        overlay.style.height = Math.max(20, overlay.scrollHeight + 4) + 'px';
    }

    // Keeps the overlay glued to the canvas across pan/zoom regardless of
    // which UI path triggered the view change (buttons, wheel, keyboard…).
    // Cheap no-op once editing ends since the loop simply stops rescheduling.
    function overlayFollowLoop() {
        if (!editSession) return;
        refreshOverlay();
        requestAnimationFrame(overlayFollowLoop);
    }

    function startTypeEditing(item, opts) {
        opts = opts || {};
        if (editSession) {
            if (editSession.item === item) return; // already editing this one
            commitTypeEditing();
        }
        var viewportEl = document.getElementById('canvas-viewport');
        if (!viewportEl || !window.paper) return;

        var textarea = document.createElement('textarea');
        textarea.className = 'iguhit-text-edit-overlay';
        textarea.value = item.content || '';
        textarea.spellcheck = false;
        textarea.setAttribute('wrap', 'off');
        viewportEl.appendChild(textarea);

        editSession = {
            item: item,
            overlay: textarea,
            isNew: !!opts.isNew,
            originalContent: item.content || '',
            prevOpacity: item.opacity
        };

        item.opacity = 0;

        refreshOverlay();
        openTypeWindow();
        refreshTypePanel(item);
        requestAnimationFrame(overlayFollowLoop);

        textarea.focus();
        if (!opts.isNew) textarea.select();

        textarea.addEventListener('input', function () {
            item.content = textarea.value;
            autosizeOverlay();
            positionOverlay();
            if (window.paper) paper.view.draw();
        });

        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                cancelTypeEditing();
            }
            e.stopPropagation();
        });
    }
    window.__startTypeEditing = startTypeEditing;

    function endTypeEditing(discard) {
        if (!editSession) return;
        var item = editSession.item, overlay = editSession.overlay,
            isNew = editSession.isNew, originalContent = editSession.originalContent,
            prevOpacity = editSession.prevOpacity;

        overlay.remove();
        editSession = null;

        if (!item || (item.isInserted && !item.isInserted())) return;

        item.opacity = (prevOpacity !== undefined && prevOpacity !== null) ? prevOpacity : 1;

        if (discard) {
            if (isNew) item.remove();
            else item.content = originalContent;
            if (window.paper) paper.view.draw();
            if (window.onSelectionChanged) onSelectionChanged();
            return;
        }

        var finalContent = item.content;
        if (!finalContent || !finalContent.trim()) {
            item.remove();
            if (window.paper) paper.view.draw();
            if (window.saveState) saveState();
            else if (window.onSelectionChanged) onSelectionChanged();
            return;
        }

        if (window.paper) paper.view.draw();
        if (window.saveState) saveState();
    }
    function commitTypeEditing() { endTypeEditing(false); }
    function cancelTypeEditing() { endTypeEditing(true); }

    // -----------------------------------------------------------------
    // Editing the CONTENT of an existing Type on Circle. The letters
    // themselves are regenerated from `cfg.content` on every keystroke, so
    // there's nothing per-character to edit directly — this just edits the
    // underlying string and re-runs the path layout live.
    // -----------------------------------------------------------------
    var pathTextEditSession = null; // { textGroup, pathItem, overlay, originalContent }

    function startTypeOnPathEditing(textGroup, pathItem) {
        if (!textGroup || !pathItem) return;
        var cfg = textGroup.data && textGroup.data.typeOnPath;
        if (!cfg) return;
        if (editSession) commitTypeEditing();
        if (pathTextEditSession) endPathTextEditing(false);

        var viewportEl = document.getElementById('canvas-viewport');
        var canvasEl = document.getElementById('paper-canvas');
        if (!viewportEl || !canvasEl || !window.paper) return;

        var textarea = document.createElement('textarea');
        textarea.className = 'iguhit-text-edit-overlay';
        textarea.value = cfg.content || '';
        textarea.spellcheck = false;
        textarea.setAttribute('wrap', 'off');
        viewportEl.appendChild(textarea);

        pathTextEditSession = { textGroup: textGroup, pathItem: pathItem, overlay: textarea, originalContent: cfg.content || '' };

        var canvasRect = canvasEl.getBoundingClientRect();
        var viewportRect = viewportEl.getBoundingClientRect();
        var centerPoint = pathItem.position;
        var viewPt = paper.view.projectToView(centerPoint);
        var zoom = paper.view.zoom || 1;
        var decomposed = decomposeFontWeight(cfg.fontWeight);

        textarea.style.fontFamily = cfg.fontFamily || 'sans-serif';
        textarea.style.fontWeight = decomposed.weight;
        textarea.style.fontStyle = decomposed.italic ? 'italic' : 'normal';
        textarea.style.fontSize = ((cfg.fontSize || 24) * zoom) + 'px';
        textarea.style.color = cfg.fillColorHex || '#000000';
        textarea.style.textAlign = 'center';
        textarea.style.left = ((canvasRect.left - viewportRect.left) + viewPt.x) + 'px';
        textarea.style.top = ((canvasRect.top - viewportRect.top) + viewPt.y) + 'px';
        textarea.style.transform = 'translate(-50%, -50%)';
        textarea.style.width = '20px';
        textarea.style.height = '20px';
        textarea.style.width = Math.max(60, textarea.scrollWidth + 12) + 'px';
        textarea.style.height = Math.max(24, textarea.scrollHeight + 4) + 'px';

        textarea.focus();
        textarea.select();

        textarea.addEventListener('input', function () {
            cfg.content = textarea.value;
            layoutTextOnPath(textGroup, pathItem);
            if (window.paper) paper.view.draw();
        });
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                endPathTextEditing(true);
            }
            e.stopPropagation();
        });
    }

    function endPathTextEditing(discard) {
        if (!pathTextEditSession) return;
        var textGroup = pathTextEditSession.textGroup, pathItem = pathTextEditSession.pathItem,
            overlay = pathTextEditSession.overlay, originalContent = pathTextEditSession.originalContent;
        overlay.remove();
        pathTextEditSession = null;

        if (!textGroup || (textGroup.isInserted && !textGroup.isInserted())) return;
        var cfg = textGroup.data && textGroup.data.typeOnPath;
        if (!cfg) return;

        if (discard) {
            cfg.content = originalContent;
            layoutTextOnPath(textGroup, pathItem);
            if (window.paper) paper.view.draw();
            if (window.onSelectionChanged) onSelectionChanged();
            return;
        }

        layoutTextOnPath(textGroup, pathItem);
        if (window.paper) paper.view.draw();
        if (window.saveState) saveState();
    }
    window.__iguhitStartTypeOnPathEditing = startTypeOnPathEditing;

    // Commit any open edit the moment the person interacts with anything
    // outside the live overlay or the Type window itself (canvas clicks,
    // toolbar/menu clicks, switching tools — all funnel through here since
    // this listener runs in the capture phase, before any of those
    // handlers fire).
    document.addEventListener('mousedown', function (e) {
        var panel = document.getElementById('type-window');
        var controlBar = document.getElementById('control-bar');
        if (editSession) {
            var overlay = editSession.overlay;
            if ((overlay && overlay.contains(e.target)) || (panel && panel.contains(e.target)) || (controlBar && controlBar.contains(e.target))) {
                // stay open
            } else {
                commitTypeEditing();
            }
        }
        if (pathTextEditSession) {
            var overlay2 = pathTextEditSession.overlay;
            if ((overlay2 && overlay2.contains(e.target)) || (panel && panel.contains(e.target)) || (controlBar && controlBar.contains(e.target))) {
                // stay open
            } else {
                endPathTextEditing(false);
            }
        }
    }, true);

    // -----------------------------------------------------------------
    // Type window: open/close/drag/tabs
    // -----------------------------------------------------------------
    function openTypeWindow() {
        var win = document.getElementById('type-window');
        if (win) win.style.display = 'block';
        refreshTypePanel();
    }
    function closeTypeWindow() {
        var win = document.getElementById('type-window');
        if (win) win.style.display = 'none';
    }
    window.__iguhitOpenTypeWindow = openTypeWindow;
    window.__iguhitCloseTypeWindow = closeTypeWindow;

    // -----------------------------------------------------------------
    // Bootstrap once paper.js + app.js are ready
    // -----------------------------------------------------------------
    whenReady(function () {
        installTrackingPatch();

        // Re-flow any selected "Type on Circle" path right before every
        // saveState() call, so reshaping the path is captured correctly in
        // the very same undo step instead of one step behind.
        if (window.saveState && !window.saveState.__iguhitWrapped) {
            var __origSaveState = window.saveState;
            var wrappedSaveState = function () {
                relayoutSelectedTypeOnPathCircles();
                return __origSaveState.apply(this, arguments);
            };
            wrappedSaveState.__iguhitWrapped = true;
            window.saveState = wrappedSaveState;
        }

        document.getElementById('tp-btn-type-on-circle')?.addEventListener('click', function () {
            if (window.__iguhitApplyTypeOnCircle) window.__iguhitApplyTypeOnCircle(false);
        });

        document.getElementById('tp-btn-type-on-circle-inverted')?.addEventListener('click', function () {
            // If an existing Type-on-Circle path is what's selected, just
            // flip it in place rather than requiring delete-and-redo.
            if (window.__iguhitToggleTypeOnCircleFlip && window.__iguhitToggleTypeOnCircleFlip()) return;
            if (window.__iguhitApplyTypeOnCircle) window.__iguhitApplyTypeOnCircle(true);
        });

        document.getElementById('tp-btn-edit-circle-text')?.addEventListener('click', function () {
            var selected = window.getSelectedDrawItems ? window.getSelectedDrawItems() : [];
            var pathItem = selected.find(function (i) { return i && i.data && i.data.isTypeOnPathSource; });
            var textGroup = pathItem ? findTypeOnPathTextFor(pathItem) : null;
            if (!textGroup) {
                textGroup = selected.find(function (i) { return i && i.data && i.data.isTypeOnPathText; });
                if (textGroup) pathItem = findTypeOnPathSourceFor(textGroup);
            }
            if (pathItem && textGroup) {
                startTypeOnPathEditing(textGroup, pathItem);
            } else {
                alert('Select a "Type on Circle" text first (click its ring or letters), then try again.');
            }
        });

        // Drag the panel by its header, reusing app.js's existing helper
        var win = document.getElementById('type-window');
        var handle = document.getElementById('type-window-handle');
        if (win && handle && window.makeElementDraggable) {
            makeElementDraggable(win, handle);
        }

        // Tabs
        document.querySelectorAll('.type-tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.type-tab-btn').forEach(function (b) { b.classList.remove('active'); });
                document.querySelectorAll('.type-tab-panel').forEach(function (p) { p.classList.remove('active'); });
                this.classList.add('active');
                var tab = this.getAttribute('data-tp-tab');
                var panel = document.getElementById('tp-panel-' + tab);
                if (panel) panel.classList.add('active');
            });
        });

        document.getElementById('btn-close-type-window')?.addEventListener('click', closeTypeWindow);
        document.getElementById('btn-open-type-window')?.addEventListener('click', openTypeWindow);

        document.getElementById('tool-type')?.addEventListener('click', function () {
            openTypeWindow();
        });

        document.getElementById('toggle-type-window')?.addEventListener('click', function (e) {
            var win = document.getElementById('type-window');
            var isHidden = !win || win.style.display === 'none' || !win.style.display;
            if (isHidden) {
                openTypeWindow();
                this.innerHTML = '<i class="fa-solid fa-check"></i> Type Panel';
            } else {
                closeTypeWindow();
                this.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp; Type Panel';
            }
        });

        // --- Character tab field wiring ---
        var ffSelect = document.getElementById('tp-font-family');
        var customRow = document.getElementById('tp-font-custom-row');

        ffSelect?.addEventListener('change', function () {
            var showCustom = this.value === '__custom__';
            if (customRow) customRow.style.display = showCustom ? '' : 'none';
            if (showCustom) {
                document.getElementById('tp-font-file-input')?.click();
                return;
            }
            applyStyle({ fontFamily: this.value });
        });

        document.getElementById('tp-font-file-btn')?.addEventListener('click', function () {
            document.getElementById('tp-font-file-input')?.click();
        });

        document.getElementById('tp-font-file-input')?.addEventListener('change', function (e) {
            var file = e.target.files && e.target.files[0];
            this.value = ''; // allow re-selecting the same file later
            if (!file) { refreshTypePanel(); return; } // user cancelled — revert the dropdown
            loadCustomFontFile(file);
        });

        document.getElementById('tp-font-weight')?.addEventListener('change', function () {
            var boldBtn = document.getElementById('tp-btn-bold');
            if (boldBtn) boldBtn.classList.toggle('active', (parseInt(this.value, 10) || 400) >= 700);
            applyStyle({ fontWeight: this.value });
        });

        document.getElementById('tp-btn-bold')?.addEventListener('click', function () {
            var nowActive = !this.classList.contains('active');
            this.classList.toggle('active', nowActive);
            var weightSelect = document.getElementById('tp-font-weight');
            if (weightSelect) weightSelect.value = nowActive ? '700' : '400';
            applyStyle({ fontWeight: nowActive ? '700' : '400' });
        });

        document.getElementById('tp-btn-italic')?.addEventListener('click', function () {
            var nowActive = !this.classList.contains('active');
            this.classList.toggle('active', nowActive);
            applyStyle({ italic: nowActive });
        });

        document.getElementById('tp-font-size')?.addEventListener('change', function () {
            var v = parseFloat(this.value) || 24;
            applyStyle({ fontSize: v });
        });

        document.getElementById('tp-leading')?.addEventListener('change', function () {
            var v = parseFloat(this.value);
            if (!isNaN(v)) applyStyle({ leading: v });
        });
        document.getElementById('tp-leading-auto')?.addEventListener('change', function () {
            var leadingInput = document.getElementById('tp-leading');
            if (leadingInput) leadingInput.disabled = this.checked;
            applyStyle({ leadingAuto: this.checked });
        });

        document.getElementById('tp-vscale')?.addEventListener('change', function () {
            var v = parseFloat(this.value);
            if (!isNaN(v) && v > 0) applyStyle({ verticalScalePercent: v });
        });

        var trackRange = document.getElementById('tp-tracking');
        var trackVal = document.getElementById('tp-tracking-val');
        function handleTrackingInput(v) {
            v = parseFloat(v) || 0;
            if (trackRange) trackRange.value = v;
            if (trackVal) trackVal.value = v;
            applyStyle({ tracking: v });
        }
        trackRange?.addEventListener('input', function () { handleTrackingInput(this.value); });
        trackVal?.addEventListener('change', function () { handleTrackingInput(this.value); });

        document.getElementById('tp-font-color')?.addEventListener('input', function () {
            var fillInput = document.getElementById('fill-color');
            if (fillInput) {
                fillInput.value = this.value;
                fillInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // --- Paragraph tab: alignment ---
        ['tp-align-left', 'tp-align-center', 'tp-align-right'].forEach(function (id) {
            document.getElementById(id)?.addEventListener('click', function () {
                var j = id.replace('tp-align-', '');
                ['tp-align-left', 'tp-align-center', 'tp-align-right'].forEach(function (i2) {
                    var el = document.getElementById(i2);
                    if (el) el.classList.toggle('active', i2 === id);
                });
                applyStyle({ justification: j });
            });
        });

        // Double-click any existing text (with ANY tool) to edit it in place
        var canvasEl = document.getElementById('paper-canvas');
        canvasEl?.addEventListener('dblclick', function (e) {
            if (!window.paper) return;
            var rect = canvasEl.getBoundingClientRect();
            var offsetX = e.clientX - rect.left;
            var offsetY = e.clientY - rect.top;
            var projPoint;
            try {
                projPoint = paper.view.viewToProject(new paper.Point(offsetX, offsetY));
            } catch (err) { return; }

            // Type on Circle: double-clicking the path or any of its
            // letters opens the content editor instead of normal text edit.
            try {
                var hitResult = paper.project.hitTest(projPoint, { fill: true, stroke: true, tolerance: 6 / paper.view.zoom });
                var hitItem = hitResult && hitResult.item;
                if (hitItem) {
                    if (hitItem.data && hitItem.data.isTypeOnPathSource) {
                        e.preventDefault();
                        if (window.deselectAll) deselectAll();
                        hitItem.selected = true;
                        if (window.onSelectionChanged) onSelectionChanged();
                        startTypeOnPathEditing(findTypeOnPathTextFor(hitItem), hitItem);
                        return;
                    }
                    if (hitItem.parent && hitItem.parent.data && hitItem.parent.data.isTypeOnPathText) {
                        e.preventDefault();
                        var srcPath = findTypeOnPathSourceFor(hitItem.parent);
                        if (srcPath) {
                            if (window.deselectAll) deselectAll();
                            srcPath.selected = true;
                            if (window.onSelectionChanged) onSelectionChanged();
                            startTypeOnPathEditing(hitItem.parent, srcPath);
                            return;
                        }
                    }
                }
            } catch (err) {}

            var hit = findTextAt(projPoint);
            if (hit) {
                e.preventDefault();
                if (window.deselectAll) deselectAll();
                hit.selected = true;
                if (window.onSelectionChanged) onSelectionChanged();
                startTypeEditing(hit, { isNew: false });
            }
        });

    });
})();
