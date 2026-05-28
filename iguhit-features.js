/**
 * iGuhit Vector — Features Pack v4
 * All panels use getElementById (no closure bugs).
 * Tapered Brush is handled in app.js.
 */
(function () {
    'use strict';

    // Wait until Paper.js + app.js are fully ready
    function whenReady(fn) {
        if (window.paper && window.paper.view && window.state && typeof window.saveState === 'function') {
            fn();
        } else {
            setTimeout(function () { whenReady(fn); }, 150);
        }
    }

    function getSelected() {
        return (window.getSelectedDrawItems ? window.getSelectedDrawItems() : [])
               .filter(function(i){ return i && i.isInserted(); });
    }

    function toast(msg, color) {
        var d = document.createElement('div');
        d.style.cssText = [
            'position:fixed','bottom:56px','left:50%','transform:translateX(-50%)',
            'background:'+(color||'#f17c22'),'color:#fff','padding:8px 22px',
            'border-radius:6px','font-size:12px','font-weight:600',
            'z-index:99999','pointer-events:none','box-shadow:0 2px 14px rgba(0,0,0,.6)',
            'font-family:Inter,sans-serif'
        ].join(';');
        d.textContent = msg;
        document.body.appendChild(d);
        setTimeout(function(){ if(d.parentNode) d.parentNode.removeChild(d); }, 2200);
    }

    // ─── Panel open/close helper ────────────────────────────────
    function showPanel(id) {
        var p = document.getElementById(id);
        if (p) { p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none'; }
    }

    // ═══════════════════════════════════════════════════════════
    // 1. GRADIENT FILL
    // ═══════════════════════════════════════════════════════════
    var _gradType = 'linear';

    function buildGradientPanel() {
        if (document.getElementById('gradient-panel')) return;
        var el = document.createElement('div');
        el.id = 'gradient-panel';
        el.style.cssText = [
            'display:none','position:fixed','top:118px','right:272px','width:265px',
            'background:#2b2b2b','border:1px solid #555','border-radius:8px',
            'box-shadow:0 8px 36px rgba(0,0,0,.75)','z-index:9999','overflow:hidden',
            'font-family:Inter,sans-serif'
        ].join(';');

        el.innerHTML = [
            '<div style="background:#333;padding:9px 13px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #444;">',
                '<span style="color:#fff;font-weight:700;font-size:12px;">Gradient Fill</span>',
                '<button id="gp-close" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;line-height:1;padding:2px 4px;">&times;</button>',
            '</div>',
            '<div style="padding:13px;">',
                // Type buttons
                '<div style="display:flex;gap:6px;margin-bottom:11px;">',
                    '<button id="gp-linear" style="flex:1;padding:7px;border:2px solid #f17c22;border-radius:5px;background:#f17c22;color:#000;font-size:11px;font-weight:700;cursor:pointer;">&#9135; Linear</button>',
                    '<button id="gp-radial" style="flex:1;padding:7px;border:2px solid #444;border-radius:5px;background:#1e1e1e;color:#777;font-size:11px;cursor:pointer;">&#9711; Radial</button>',
                '</div>',
                // Live preview bar
                '<div id="gp-preview" style="height:22px;border-radius:4px;border:1px solid #444;margin-bottom:11px;"></div>',
                // Stop 1
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;">',
                    '<div id="gp-sw1" style="width:24px;height:24px;border-radius:3px;border:1px solid #555;background:#ff6b6b;cursor:pointer;flex-shrink:0;" title="Pick color 1"></div>',
                    '<input type="color" id="gp-c1" value="#ff6b6b" style="display:none;">',
                    '<input type="range" id="gp-p1" min="0" max="100" value="0" style="flex:1;">',
                    '<span id="gp-p1v" style="color:#aaa;font-size:10px;width:28px;text-align:right;">0%</span>',
                '</div>',
                // Stop 2
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:11px;">',
                    '<div id="gp-sw2" style="width:24px;height:24px;border-radius:3px;border:1px solid #555;background:#4ecdc4;cursor:pointer;flex-shrink:0;" title="Pick color 2"></div>',
                    '<input type="color" id="gp-c2" value="#4ecdc4" style="display:none;">',
                    '<input type="range" id="gp-p2" min="0" max="100" value="100" style="flex:1;">',
                    '<span id="gp-p2v" style="color:#aaa;font-size:10px;width:28px;text-align:right;">100%</span>',
                '</div>',
                // Angle row (linear only)
                '<div id="gp-ang-row" style="display:flex;align-items:center;gap:8px;margin-bottom:13px;">',
                    '<span style="color:#aaa;font-size:10px;width:34px;flex-shrink:0;">Angle</span>',
                    '<input type="range" id="gp-ang" min="0" max="360" value="0" style="flex:1;">',
                    '<input type="number" id="gp-angv" value="0" min="0" max="360" style="width:38px;background:#1e1e1e;border:1px solid #444;border-radius:3px;color:#fff;font-size:10px;text-align:center;padding:2px 3px;">',
                    '<span style="color:#aaa;font-size:10px;">°</span>',
                '</div>',
                '<button id="gp-apply" style="width:100%;padding:9px;background:#f17c22;border:none;border-radius:6px;color:#000;font-weight:700;font-size:12px;cursor:pointer;">Apply Gradient to Selection</button>',
            '</div>'
        ].join('');
        document.body.appendChild(el);

        // Wire events
        document.getElementById('gp-close').onclick = function(){ el.style.display='none'; };

        document.getElementById('gp-linear').onclick = function(){
            _gradType = 'linear';
            this.style.background='#f17c22'; this.style.borderColor='#f17c22'; this.style.color='#000'; this.style.fontWeight='700';
            var rb = document.getElementById('gp-radial');
            rb.style.background='#1e1e1e'; rb.style.borderColor='#444'; rb.style.color='#777'; rb.style.fontWeight='400';
            document.getElementById('gp-ang-row').style.display='flex';
            _updateGradPreview();
        };
        document.getElementById('gp-radial').onclick = function(){
            _gradType = 'radial';
            this.style.background='#f17c22'; this.style.borderColor='#f17c22'; this.style.color='#000'; this.style.fontWeight='700';
            var lb = document.getElementById('gp-linear');
            lb.style.background='#1e1e1e'; lb.style.borderColor='#444'; lb.style.color='#777'; lb.style.fontWeight='400';
            document.getElementById('gp-ang-row').style.display='none';
            _updateGradPreview();
        };

        document.getElementById('gp-sw1').onclick = function(){ document.getElementById('gp-c1').click(); };
        document.getElementById('gp-sw2').onclick = function(){ document.getElementById('gp-c2').click(); };

        document.getElementById('gp-c1').oninput = function(){
            document.getElementById('gp-sw1').style.background = this.value;
            _updateGradPreview();
        };
        document.getElementById('gp-c2').oninput = function(){
            document.getElementById('gp-sw2').style.background = this.value;
            _updateGradPreview();
        };
        document.getElementById('gp-p1').oninput = function(){
            document.getElementById('gp-p1v').textContent = this.value + '%';
            _updateGradPreview();
        };
        document.getElementById('gp-p2').oninput = function(){
            document.getElementById('gp-p2v').textContent = this.value + '%';
            _updateGradPreview();
        };
        document.getElementById('gp-ang').oninput = function(){
            document.getElementById('gp-angv').value = this.value;
            _updateGradPreview();
        };
        document.getElementById('gp-angv').oninput = function(){
            document.getElementById('gp-ang').value = this.value;
            _updateGradPreview();
        };

        document.getElementById('gp-apply').onclick = _applyGradient;
        _updateGradPreview();
    }

    function _updateGradPreview() {
        var prev = document.getElementById('gp-preview');
        if (!prev) return;
        var c1  = (document.getElementById('gp-c1')||{}).value || '#ff6b6b';
        var c2  = (document.getElementById('gp-c2')||{}).value || '#4ecdc4';
        var p1  = (document.getElementById('gp-p1')||{}).value || '0';
        var p2  = (document.getElementById('gp-p2')||{}).value || '100';
        var ang = (document.getElementById('gp-ang')||{}).value || '0';
        if (_gradType === 'linear') {
            prev.style.background = 'linear-gradient('+ang+'deg,'+c1+' '+p1+'%,'+c2+' '+p2+'%)';
        } else {
            prev.style.background = 'radial-gradient(circle,'+c1+' '+p1+'%,'+c2+' '+p2+'%)';
        }
    }

    function _applyGradient() {
        var items = getSelected();
        if (!items.length) { toast('Select at least one object first', '#d9534f'); return; }
        var c1  = document.getElementById('gp-c1').value;
        var c2  = document.getElementById('gp-c2').value;
        var p1  = parseFloat(document.getElementById('gp-p1').value) / 100;
        var p2  = parseFloat(document.getElementById('gp-p2').value) / 100;
        var ang = parseFloat(document.getElementById('gp-ang').value) * Math.PI / 180;
        var applied = 0;
        items.forEach(function(item) {
            if (!item.bounds) return;
            var b  = item.bounds;
            var cx = b.x + b.width/2, cy = b.y + b.height/2;
            var d  = Math.sqrt(b.width*b.width + b.height*b.height) / 2;
            try {
                if (_gradType === 'linear') {
                    item.fillColor = {
                        gradient: { stops: [[c1, p1],[c2, p2]] },
                        origin:      new paper.Point(cx - Math.cos(ang)*d, cy - Math.sin(ang)*d),
                        destination: new paper.Point(cx + Math.cos(ang)*d, cy + Math.sin(ang)*d)
                    };
                } else {
                    item.fillColor = {
                        gradient: { stops: [[c1, p1],[c2, p2]], radial: true },
                        origin:      new paper.Point(cx, cy),
                        destination: new paper.Point(b.x + b.width, cy)
                    };
                }
                applied++;
            } catch(e) { console.warn('Gradient error on item:', e); }
        });
        paper.view.draw();
        saveState();
        document.getElementById('gradient-panel').style.display = 'none';
        var msg = applied ? 'Gradient applied to '+applied+' object'+(applied>1?'s':'') : 'No compatible objects selected';
        if (window.showNotification) showNotification(msg, applied ? undefined : '#d9534f');
        else toast(msg, applied ? undefined : '#d9534f');
    }

    // ═══════════════════════════════════════════════════════════
    // 2. PATTERN FILL
    // ═══════════════════════════════════════════════════════════
    var _PAT = {
        'Dots':      function(s,c){ return '<svg xmlns="http://www.w3.org/2000/svg" width="'+s+'" height="'+s+'"><rect width="'+s+'" height="'+s+'" fill="white"/><circle cx="'+(s/2)+'" cy="'+(s/2)+'" r="'+(s*0.2)+'" fill="'+c+'"/></svg>'; },
        'Lines H':   function(s,c){ return '<svg xmlns="http://www.w3.org/2000/svg" width="'+s+'" height="'+s+'"><rect width="'+s+'" height="'+s+'" fill="white"/><line x1="0" y1="'+(s/2)+'" x2="'+s+'" y2="'+(s/2)+'" stroke="'+c+'" stroke-width="1.5"/></svg>'; },
        'Lines V':   function(s,c){ return '<svg xmlns="http://www.w3.org/2000/svg" width="'+s+'" height="'+s+'"><rect width="'+s+'" height="'+s+'" fill="white"/><line x1="'+(s/2)+'" y1="0" x2="'+(s/2)+'" y2="'+s+'" stroke="'+c+'" stroke-width="1.5"/></svg>'; },
        'Grid':      function(s,c){ return '<svg xmlns="http://www.w3.org/2000/svg" width="'+s+'" height="'+s+'"><rect width="'+s+'" height="'+s+'" fill="white"/><line x1="0" y1="'+(s/2)+'" x2="'+s+'" y2="'+(s/2)+'" stroke="'+c+'" stroke-width="1"/><line x1="'+(s/2)+'" y1="0" x2="'+(s/2)+'" y2="'+s+'" stroke="'+c+'" stroke-width="1"/></svg>'; },
        'Diagonal':  function(s,c){ return '<svg xmlns="http://www.w3.org/2000/svg" width="'+(s*2)+'" height="'+(s*2)+'"><rect width="'+(s*2)+'" height="'+(s*2)+'" fill="white"/><line x1="0" y1="'+s+'" x2="'+s+'" y2="0" stroke="'+c+'" stroke-width="1.5"/><line x1="'+s+'" y1="'+(s*2)+'" x2="'+(s*2)+'" y2="'+s+'" stroke="'+c+'" stroke-width="1.5"/></svg>'; },
        'Checker':   function(s,c){ return '<svg xmlns="http://www.w3.org/2000/svg" width="'+s+'" height="'+s+'"><rect width="'+s+'" height="'+s+'" fill="white"/><rect x="0" y="0" width="'+(s/2)+'" height="'+(s/2)+'" fill="'+c+'"/><rect x="'+(s/2)+'" y="'+(s/2)+'" width="'+(s/2)+'" height="'+(s/2)+'" fill="'+c+'"/></svg>'; },
        'Crosshatch':function(s,c){ return '<svg xmlns="http://www.w3.org/2000/svg" width="'+s+'" height="'+s+'"><rect width="'+s+'" height="'+s+'" fill="white"/><line x1="0" y1="'+s+'" x2="'+s+'" y2="0" stroke="'+c+'" stroke-width="1"/><line x1="0" y1="0" x2="'+s+'" y2="'+s+'" stroke="'+c+'" stroke-width="1"/></svg>'; }
    };
    var _selPat = 'Dots';

    function buildPatternPanel() {
        if (document.getElementById('pattern-panel')) return;
        var el = document.createElement('div');
        el.id = 'pattern-panel';
        el.style.cssText = [
            'display:none','position:fixed','top:118px','right:272px','width:265px',
            'background:#2b2b2b','border:1px solid #555','border-radius:8px',
            'box-shadow:0 8px 36px rgba(0,0,0,.75)','z-index:9999','overflow:hidden',
            'font-family:Inter,sans-serif'
        ].join(';');

        var patBtns = Object.keys(_PAT).map(function(k){
            return '<button class="pp-opt" data-key="'+k+'" style="padding:5px 6px;border:2px solid '+(k==='Dots'?'#f17c22':'#444')+';border-radius:4px;background:#1e1e1e;color:'+(k==='Dots'?'#fff':'#888')+';font-size:10px;cursor:pointer;min-width:0;">'+k+'</button>';
        }).join('');

        el.innerHTML = [
            '<div style="background:#333;padding:9px 13px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #444;">',
                '<span style="color:#fff;font-weight:700;font-size:12px;">Pattern Fill</span>',
                '<button id="pp-close" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;line-height:1;padding:2px 4px;">&times;</button>',
            '</div>',
            '<div style="padding:13px;">',
                '<div id="pp-prev" style="height:50px;border-radius:5px;border:1px solid #444;margin-bottom:11px;background:#fff;background-repeat:repeat;"></div>',
                '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:11px;">'+patBtns+'</div>',
                '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;">',
                    '<span style="color:#aaa;font-size:10px;flex-shrink:0;">Color</span>',
                    '<div id="pp-sw" style="width:24px;height:24px;border-radius:3px;border:1px solid #555;background:#000;cursor:pointer;flex-shrink:0;"></div>',
                    '<input type="color" id="pp-color" value="#000000" style="display:none;">',
                    '<span style="color:#aaa;font-size:10px;flex-shrink:0;">Size</span>',
                    '<input type="range" id="pp-size" min="6" max="80" value="16" style="flex:1;">',
                    '<span id="pp-sizev" style="color:#aaa;font-size:10px;width:22px;text-align:right;">16</span>',
                '</div>',
                '<button id="pp-apply" style="width:100%;padding:9px;background:#f17c22;border:none;border-radius:6px;color:#000;font-weight:700;font-size:12px;cursor:pointer;">Apply Pattern to Selection</button>',
            '</div>'
        ].join('');
        document.body.appendChild(el);

        document.getElementById('pp-close').onclick = function(){ el.style.display='none'; };
        document.getElementById('pp-sw').onclick = function(){ document.getElementById('pp-color').click(); };
        document.getElementById('pp-color').oninput = function(){
            document.getElementById('pp-sw').style.background = this.value;
            _updatePatPreview();
        };
        document.getElementById('pp-size').oninput = function(){
            document.getElementById('pp-sizev').textContent = this.value;
            _updatePatPreview();
        };
        document.getElementById('pp-apply').onclick = _applyPattern;

        el.querySelectorAll('.pp-opt').forEach(function(btn){
            btn.onclick = function(){
                _selPat = btn.dataset.key;
                el.querySelectorAll('.pp-opt').forEach(function(b){ b.style.borderColor='#444'; b.style.color='#888'; });
                btn.style.borderColor='#f17c22'; btn.style.color='#fff';
                _updatePatPreview();
            };
        });
        _updatePatPreview();
    }

    function _updatePatPreview() {
        var prev = document.getElementById('pp-prev');
        if (!prev) return;
        var color = (document.getElementById('pp-color')||{}).value || '#000000';
        var size  = parseInt((document.getElementById('pp-size')||{}).value) || 16;
        var fn    = _PAT[_selPat];
        if (!fn) return;
        var svg   = fn(size, color);
        var url   = 'data:image/svg+xml;base64,' + btoa(svg);
        prev.style.backgroundImage  = 'url("'+url+'")';
        prev.style.backgroundSize   = size+'px '+size+'px';
        prev.style.backgroundRepeat = 'repeat';
    }

    function _applyPattern() {
        var items = getSelected();
        if (!items.length) { toast('Select at least one object first', '#d9534f'); return; }
        var color = document.getElementById('pp-color').value;
        var size  = parseInt(document.getElementById('pp-size').value) || 16;
        var fn    = _PAT[_selPat];
        if (!fn) { toast('No pattern selected','#d9534f'); return; }
        var svg    = fn(size, color);
        var dataUrl = 'data:image/svg+xml;base64,' + btoa(svg);
        var applied = 0;

        items.forEach(function(item) {
            if (!item.bounds) return;
            var b    = item.bounds;
            var cols = Math.ceil(b.width  / size) + 2;
            var rows = Math.ceil(b.height / size) + 2;
            var r = new paper.Raster(dataUrl);
            r.on('load', function() {
                var grp = new paper.Group();
                for (var row=0;row<rows;row++) {
                    for (var col=0;col<cols;col++) {
                        var t = r.clone();
                        t.position = new paper.Point(b.x+col*size+size/2, b.y+row*size+size/2);
                        grp.addChild(t);
                    }
                }
                r.remove();
                var mask = item.clone();
                mask.fillColor = new paper.Color(0,0,0,1);
                mask.strokeColor = null;
                var clip = new paper.Group([mask, grp]);
                clip.clipped = true;
                clip.insertAbove(item);
                paper.view.draw();
                saveState();
            });
            applied++;
        });

        document.getElementById('pattern-panel').style.display = 'none';
        toast('Pattern applied to '+applied+' object'+(applied>1?'s':''));
    }

    // ═══════════════════════════════════════════════════════════
    // 3. SYMBOL LIBRARY
    // ═══════════════════════════════════════════════════════════
    var _symbols = [];

    function buildSymbolPanel() {
        if (document.getElementById('symbol-panel')) return;
        var el = document.createElement('div');
        el.id = 'symbol-panel';
        el.style.cssText = [
            'display:none','position:fixed','top:118px','right:272px','width:280px',
            'max-height:72vh','background:#2b2b2b','border:1px solid #555','border-radius:8px',
            'box-shadow:0 8px 36px rgba(0,0,0,.75)','z-index:9999','overflow:hidden',
            'flex-direction:column','font-family:Inter,sans-serif'
        ].join(';');
        el.innerHTML = [
            '<div style="background:#333;padding:9px 13px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #444;flex-shrink:0;">',
                '<span style="color:#fff;font-weight:700;font-size:12px;">Symbol Library</span>',
                '<button id="sp-close" style="background:none;border:none;color:#888;font-size:18px;cursor:pointer;line-height:1;padding:2px 4px;">&times;</button>',
            '</div>',
            '<div style="padding:10px;border-bottom:1px solid #3a3a3a;flex-shrink:0;">',
                '<input type="text" id="sp-name" placeholder="Symbol name..." style="width:100%;box-sizing:border-box;padding:7px 9px;background:#1e1e1e;border:1px solid #444;border-radius:4px;color:#fff;font-size:11px;margin-bottom:8px;">',
                '<button id="sp-save" style="width:100%;padding:8px;background:#f17c22;border:none;border-radius:4px;color:#000;font-weight:700;font-size:11px;cursor:pointer;">+ New Symbol from Selection</button>',
            '</div>',
            '<div id="sp-grid" style="padding:10px;overflow-y:auto;flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:7px;min-height:80px;"></div>'
        ].join('');
        document.body.appendChild(el);

        document.getElementById('sp-close').onclick = function(){ el.style.display='none'; };
        document.getElementById('sp-save').onclick  = _saveSymbol;
        _renderSymbols();
    }

    function _saveSymbol() {
        var items = getSelected();
        if (!items.length) { toast('Select objects to save as symbol','#d9534f'); return; }
        var name = (document.getElementById('sp-name')||{}).value;
        name = (name || '').trim() || ('Symbol '+ (_symbols.length+1));
        var clones = items.map(function(i){ return i.clone({insert:false}); });
        var grp = new paper.Group(clones);
        grp.position = new paper.Point(0,0);
        var json = grp.exportJSON({asString:true});
        grp.remove();
        _symbols.push({name:name, json:json});
        _renderSymbols();
        var ni = document.getElementById('sp-name');
        if (ni) ni.value = '';
        toast('Symbol "'+name+'" saved ✓');
    }

    function _renderSymbols() {
        var grid = document.getElementById('sp-grid');
        if (!grid) return;
        grid.innerHTML = '';
        if (!_symbols.length) {
            grid.innerHTML = '<div style="grid-column:span 3;color:#555;font-size:11px;text-align:center;padding:18px 0;">No symbols yet.<br>Select objects and save.</div>';
            return;
        }
        _symbols.forEach(function(sym, idx) {
            var card = document.createElement('div');
            card.style.cssText = 'background:#1e1e1e;border:1px solid #3a3a3a;border-radius:5px;overflow:hidden;';
            card.innerHTML = [
                '<div style="height:44px;display:flex;align-items:center;justify-content:center;background:#161616;">',
                    '<i class="fa-solid fa-object-group" style="color:#f17c22;font-size:18px;"></i>',
                '</div>',
                '<div style="padding:5px;">',
                    '<div style="font-size:9px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;" title="'+sym.name+'">'+sym.name+'</div>',
                    '<div style="display:flex;gap:3px;">',
                        '<button data-idx="'+idx+'" class="sp-place" style="flex:1;padding:3px 2px;background:#f17c22;border:none;border-radius:3px;color:#000;font-size:9px;font-weight:700;cursor:pointer;">Place</button>',
                        '<button data-idx="'+idx+'" class="sp-del" style="flex:1;padding:3px 2px;background:#3a3a3a;border:none;border-radius:3px;color:#aaa;font-size:9px;cursor:pointer;">Del</button>',
                    '</div>',
                '</div>'
            ].join('');
            grid.appendChild(card);
        });

        grid.querySelectorAll('.sp-place').forEach(function(btn){
            btn.onclick = function(){
                var sym = _symbols[parseInt(btn.dataset.idx)];
                if (!sym) return;
                try {
                    var item = paper.project.activeLayer.importJSON(sym.json);
                    if (item) {
                        item.position = paper.view.center;
                        item.selected = true;
                        paper.view.draw();
                        saveState();
                        if (window.updateLayersUI) updateLayersUI();
                        toast('Symbol placed ✓');
                    }
                } catch(e){ toast('Could not place symbol','#d9534f'); console.error(e); }
                document.getElementById('symbol-panel').style.display = 'none';
            };
        });
        grid.querySelectorAll('.sp-del').forEach(function(btn){
            btn.onclick = function(e){
                e.stopPropagation();
                _symbols.splice(parseInt(btn.dataset.idx),1);
                _renderSymbols();
            };
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 4. SNAP TO GRID
    // ═══════════════════════════════════════════════════════════
    var _snapOn = false, _snapOv = null;

    window.toggleSnapGrid = function() {
        _snapOn = !_snapOn;
        var btn = document.getElementById('btn-snap-grid-adv');
        if (btn){ btn.style.borderColor=_snapOn?'#f17c22':''; btn.style.color=_snapOn?'#f17c22':''; }
        _snapOn ? _drawSnapOv() : _removeSnapOv();
        toast(_snapOn ? 'Snap to Grid ON' : 'Snap to Grid OFF');
    };
    function _gs(){ return Math.max(1, parseInt((document.getElementById('snap-grid-size')||{}).value)||10); }
    function _drawSnapOv(){
        _removeSnapOv();
        if (!window.paper) return;
        var vp=document.getElementById('canvas-viewport'), pc=document.getElementById('paper-canvas');
        if(!vp||!pc) return;
        var W=pc.clientWidth, H=pc.clientHeight;
        var c=document.createElement('canvas');
        c.style.cssText='position:absolute;top:0;left:0;pointer-events:none;z-index:3;';
        c.width=W; c.height=H; c.style.width=W+'px'; c.style.height=H+'px';
        vp.appendChild(c); _snapOv=c;
        var ctx=c.getContext('2d'), gs=_gs(), zoom=paper.view.zoom, vc=paper.view.center;
        var cW=pc.clientWidth, cH=pc.clientHeight;
        var tlX=vc.x-cW/(2*zoom), tlY=vc.y-cH/(2*zoom);
        var gpx=gs*zoom, sx=-(tlX%gs)*zoom, sy=-(tlY%gs)*zoom;
        ctx.strokeStyle='rgba(100,140,255,0.3)'; ctx.lineWidth=0.5;
        for(var x=sx;x<W;x+=gpx){ ctx.beginPath(); ctx.moveTo(Math.round(x)+.5,0); ctx.lineTo(Math.round(x)+.5,H); ctx.stroke(); }
        for(var y=sy;y<H;y+=gpx){ ctx.beginPath(); ctx.moveTo(0,Math.round(y)+.5); ctx.lineTo(W,Math.round(y)+.5); ctx.stroke(); }
    }
    function _removeSnapOv(){ if(_snapOv&&_snapOv.parentNode) _snapOv.parentNode.removeChild(_snapOv); _snapOv=null; }
    window.snapToGrid = function(pt){ if(!_snapOn) return pt; var gs=_gs(); return new paper.Point(Math.round(pt.x/gs)*gs,Math.round(pt.y/gs)*gs); };
    whenReady(function(){
        paper.view.on('updated', function(){ if(_snapOn) _drawSnapOv(); });
        var gi=document.getElementById('snap-grid-size');
        if(gi) gi.addEventListener('change', function(){ if(_snapOn) _drawSnapOv(); });
    });
    window.addEventListener('keydown', function(e){
        if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
        if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='\\'){ e.preventDefault(); window.toggleSnapGrid(); }
    });

    // ═══════════════════════════════════════════════════════════
    // 5. IMAGE EMBED
    // ═══════════════════════════════════════════════════════════
    var _imgInput = null;
    function _setupImageEmbed(){
        if (_imgInput) return;
        _imgInput = document.createElement('input');
        _imgInput.type='file'; _imgInput.accept='image/*'; _imgInput.style.display='none';
        document.body.appendChild(_imgInput);
        _imgInput.addEventListener('change', function(e){
            var file=e.target.files[0]; if(!file) return;
            var reader=new FileReader();
            reader.onload=function(evt){
                var r=new paper.Raster(evt.target.result);
                r.on('load',function(){
                    var mW=window.state?window.state.artboardWidth:800;
                    var mH=window.state?window.state.artboardHeight:600;
                    if(r.width>mW||r.height>mH) r.scale(Math.min(mW/r.width,mH/r.height)*0.8);
                    r.position=paper.view.center;
                    r.selected=true;
                    paper.view.draw(); saveState();
                    if(window.updateLayersUI) updateLayersUI();
                    toast('Image placed ✓');
                });
            };
            reader.readAsDataURL(file);
            e.target.value='';
        });
    }
    window.openImageEmbed = function(){ _setupImageEmbed(); if(_imgInput) _imgInput.click(); };

    // ═══════════════════════════════════════════════════════════
    // 6. EXPORT PNG PER ARTBOARD
    // ═══════════════════════════════════════════════════════════
    window.exportPNGPerArtboard = function(){
        if(!window.paper) return;
        var boards=[];
        if(window.artboardRect&&window.artboardRect.isInserted())
            boards.push({rect:window.artboardRect,name:'Artboard-1'});
        if(window.multiArtboards) window.multiArtboards.forEach(function(ab,i){
            if(ab.isMain) return;
            if(ab.rect&&ab.rect.isInserted()) boards.push({rect:ab.rect,name:'Artboard-'+(i+2)});
        });
        if(!boards.length){ toast('No artboards found','#d9534f'); return; }
        var DPR=3, zoom=paper.view.zoom, dpr=window.devicePixelRatio||1;
        var pc=paper.view.element, cW=pc.clientWidth||800, cH=pc.clientHeight||600;
        if(window.artboardLayer) window.artboardLayer.visible=false;
        paper.view.draw();
        boards.forEach(function(board,i){
            setTimeout(function(){
                var b=board.rect.bounds, vc=paper.view.center;
                var tlX=vc.x-cW/(2*zoom), tlY=vc.y-cH/(2*zoom);
                var sx=(b.x-tlX)*zoom*dpr, sy=(b.y-tlY)*zoom*dpr;
                var sw=b.width*zoom*dpr,   sh=b.height*zoom*dpr;
                var W=Math.round(b.width), H=Math.round(b.height);
                var tc=document.createElement('canvas');
                tc.width=W*DPR; tc.height=H*DPR;
                var ctx=tc.getContext('2d');
                ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
                ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,tc.width,tc.height);
                ctx.drawImage(pc,sx,sy,sw,sh,0,0,tc.width,tc.height);
                var a=document.createElement('a');
                a.href=tc.toDataURL('image/png',1.0); a.download=board.name+'.png';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                if(i===boards.length-1){
                    setTimeout(function(){
                        if(window.artboardLayer) window.artboardLayer.visible=true;
                        paper.view.draw();
                        toast('Exported '+boards.length+' PNG'+(boards.length>1?'s':'')+' ✓');
                    },300);
                }
            },i*250);
        });
    };

    // ═══════════════════════════════════════════════════════════
    // WIRE BUTTONS — runs after Paper.js + app.js are ready
    // ═══════════════════════════════════════════════════════════
    function on(id, fn){
        var el=document.getElementById(id);
        if(el){ el.addEventListener('click', fn); }
        else { console.warn('[iGuhit Features] Button not found: #'+id); }
    }

    whenReady(function(){
        _setupImageEmbed();
        buildGradientPanel();
        buildPatternPanel();
        buildSymbolPanel();

        on('btn-open-gradient', function(){ showPanel('gradient-panel'); });
        on('btn-open-pattern',  function(){ showPanel('pattern-panel'); _updatePatPreview(); });
        on('btn-open-symbols',  function(){
            var p=document.getElementById('symbol-panel');
            if(p){
                p.style.display = (p.style.display==='none'||!p.style.display) ? 'flex' : 'none';
                _renderSymbols();
            }
        });
        on('btn-embed-image',         window.openImageEmbed);
        on('btn-embed-image-menu',    window.openImageEmbed);
        on('btn-snap-grid-adv',       window.toggleSnapGrid);
        on('btn-export-png-artboards',window.exportPNGPerArtboard);

        console.log('[iGuhit Features v4] All features wired.');
    });

})();
