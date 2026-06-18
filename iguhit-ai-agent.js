// =====================================================
// iGuhit AI Agent — Multi-Provider (Claude / Gemini / ChatGPT)
// =====================================================

// ── State ─────────────────────────────────────────────
var _aiHistory   = [];
var _aiMinimized = false;

// Provider config stored in localStorage
var _aiProvider  = localStorage.getItem('iguhit_ai_provider') || 'claude';   // 'claude' | 'gemini' | 'openai'
var _aiKeys = {
    claude : localStorage.getItem('iguhit_key_claude')  || '',
    gemini : localStorage.getItem('iguhit_key_gemini')  || '',
    openai : localStorage.getItem('iguhit_key_openai')  || ''
};

// Provider definitions
var AI_PROVIDERS = {
    claude: {
        label   : 'Claude (Anthropic)',
        icon    : '✦',
        color   : '#f17c22',
        models  : ['claude-sonnet-4-20250514','claude-opus-4-5','claude-haiku-4-5-20251001'],
        default : 'claude-sonnet-4-20250514',
        placeholder: 'sk-ant-...',
        helpUrl : 'https://console.anthropic.com/keys',
        helpText: 'console.anthropic.com'
    },
    gemini: {
        label   : 'Gemini (Google)',
        icon    : '✸',
        color   : '#4285f4',
        models  : ['gemini-2.0-flash','gemini-1.5-pro','gemini-1.5-flash'],
        default : 'gemini-2.0-flash',
        placeholder: 'AIza...',
        helpUrl : 'https://aistudio.google.com/app/apikey',
        helpText: 'aistudio.google.com'
    },
    openai: {
        label   : 'ChatGPT (OpenAI)',
        icon    : '⬡',
        color   : '#10a37f',
        models  : ['gpt-4o','gpt-4o-mini','gpt-4-turbo','gpt-3.5-turbo'],
        default : 'gpt-4o',
        placeholder: 'sk-...',
        helpUrl : 'https://platform.openai.com/api-keys',
        helpText: 'platform.openai.com'
    }
};

var _aiModel = localStorage.getItem('iguhit_ai_model') || AI_PROVIDERS[_aiProvider].default;

// ── Inject CSS ────────────────────────────────────────
(function(){
    if(document.getElementById('ai-agent-css')) return;
    var s = document.createElement('style');
    s.id  = 'ai-agent-css';
    s.textContent = `
        @keyframes aibounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}
        @keyframes aifadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .ai-msg-in{animation:aifadein .2s ease;}
        .ai-provider-btn{
            flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;
            padding:10px 6px;border-radius:9px;border:2px solid #3a3a3a;
            background:#222;cursor:pointer;transition:all .15s;color:#aaa;font-size:10px;
        }
        .ai-provider-btn:hover{border-color:#555;background:#2a2a2a;color:#ddd;}
        .ai-provider-btn.active{border-color:var(--pc);background:color-mix(in srgb,var(--pc) 12%,#1e1e1e);color:#fff;}
        .ai-provider-icon{font-size:20px;line-height:1;}
        .ai-chip{display:inline-block;background:#333;border:1px solid #4a4a4a;border-radius:12px;
            padding:3px 9px;margin:2px;font-size:10px;color:#bbb;cursor:pointer;transition:all .15s;}
        .ai-chip:hover{background:#f17c22;border-color:#f17c22;color:#000;}
        #ai-agent-header button:hover{color:#fff !important;background:rgba(255,255,255,0.1) !important;}
        .ai-settings-tab{padding:5px 12px;border:none;background:none;color:#777;font-size:11px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;}
        .ai-settings-tab.active{color:#f17c22;border-bottom-color:#f17c22;}
        .ai-model-option{padding:7px 10px;border-radius:6px;font-size:11px;color:#bbb;cursor:pointer;transition:all .15s;}
        .ai-model-option:hover{background:#333;color:#fff;}
        .ai-model-option.active{background:#333;color:#f17c22;font-weight:700;}
        #ai-messages::-webkit-scrollbar{width:4px;}
        #ai-messages::-webkit-scrollbar-track{background:transparent;}
        #ai-messages::-webkit-scrollbar-thumb{background:#3a3a3a;border-radius:2px;}
    `;
    document.head.appendChild(s);
})();

// ── Helpers ───────────────────────────────────────────
function aiEscHtml(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function aiProviderColor(){ return AI_PROVIDERS[_aiProvider].color; }

// ── Message append ────────────────────────────────────
function aiAppend(role, html){
    var msgs = document.getElementById('ai-messages');
    if(!msgs) return;
    var d = document.createElement('div');
    d.className = 'ai-msg-in';
    if(role==='user'){
        d.style.cssText='display:flex;justify-content:flex-end;margin-bottom:4px;';
        d.innerHTML='<div style="background:linear-gradient(135deg,'+aiProviderColor()+','+aiDarken(aiProviderColor())+');color:#fff;border-radius:10px 10px 2px 10px;padding:9px 13px;font-size:12px;max-width:88%;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,0.3);">'+html+'</div>';
    } else if(role==='log-ok'){
        d.style.cssText='border-left:2px solid #2ecc71;padding:3px 8px;margin:1px 0;font-size:10px;color:#7dd8a0;font-family:monospace;background:#0d1f10;border-radius:0 3px 3px 0;';
        d.textContent='▶ '+html;
    } else if(role==='log-err'){
        d.style.cssText='border-left:2px solid #e74c3c;padding:3px 8px;margin:1px 0;font-size:10px;color:#e07070;font-family:monospace;background:#1f0d0d;border-radius:0 3px 3px 0;';
        d.textContent='✕ '+html;
    } else {
        d.innerHTML='<div style="background:#2b2b2b;border:1px solid #383838;border-radius:10px 10px 10px 2px;padding:9px 13px;font-size:12px;color:#e0e0e0;line-height:1.6;max-width:95%;margin-bottom:4px;">'+html+'</div>';
    }
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
}

function aiDarken(hex){
    // simple darkening for gradient
    try{
        var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
        return '#'+[Math.max(0,r-30),Math.max(0,g-30),Math.max(0,b-30)].map(function(v){return v.toString(16).padStart(2,'0');}).join('');
    }catch(e){return hex;}
}

// ── Thinking indicator ────────────────────────────────
function aiShowThinking(){
    var msgs=document.getElementById('ai-messages');
    if(!msgs) return;
    var d=document.createElement('div');
    d.id='ai-thinking';
    d.style.cssText='color:#888;font-style:italic;font-size:11px;padding:6px 4px;display:flex;align-items:center;gap:6px;';
    var c=aiProviderColor();
    d.innerHTML='Thinking <span style="display:inline-flex;gap:3px;">'
        +'<span style="width:5px;height:5px;background:'+c+';border-radius:50%;display:inline-block;animation:aibounce 1.2s infinite;"></span>'
        +'<span style="width:5px;height:5px;background:'+c+';border-radius:50%;display:inline-block;animation:aibounce 1.2s .2s infinite;"></span>'
        +'<span style="width:5px;height:5px;background:'+c+';border-radius:50%;display:inline-block;animation:aibounce 1.2s .4s infinite;"></span></span>';
    msgs.appendChild(d);
    msgs.scrollTop=msgs.scrollHeight;
}
function aiHideThinking(){ var e=document.getElementById('ai-thinking'); if(e)e.remove(); }

// ── Update panel header accent color ─────────────────
function aiUpdateHeaderColor(){
    var prov = AI_PROVIDERS[_aiProvider];
    var icon = document.getElementById('ai-header-icon');
    var lbl  = document.getElementById('ai-provider-label');
    if(icon){ icon.style.background='linear-gradient(135deg,'+prov.color+','+aiDarken(prov.color)+')'; icon.textContent=prov.icon; }
    if(lbl)  lbl.textContent = prov.label;
}

// ── Settings panel ────────────────────────────────────
function aiShowSettings(){
    var msgs = document.getElementById('ai-messages');
    if(!msgs) return;
    msgs.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'padding:14px;display:flex;flex-direction:column;gap:14px;';

    // --- Tab bar
    wrap.innerHTML = `
        <div style="display:flex;border-bottom:1px solid #333;margin-bottom:2px;">
            <button class="ai-settings-tab active" id="ai-tab-provider" onclick="aiSettingsTab('provider')">Provider</button>
            <button class="ai-settings-tab" id="ai-tab-model"    onclick="aiSettingsTab('model')">Model</button>
            <button class="ai-settings-tab" id="ai-tab-keys"     onclick="aiSettingsTab('keys')">API Keys</button>
        </div>
        <div id="ai-settings-content"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button onclick="aiResetChat()" style="background:#333;border:none;border-radius:7px;color:#ddd;font-size:11px;padding:7px 14px;cursor:pointer;">← Back to Chat</button>
            <button onclick="aiSaveSettings()" style="background:linear-gradient(135deg,#f17c22,#d9660e);border:none;border-radius:7px;color:#fff;font-size:11px;font-weight:700;padding:7px 16px;cursor:pointer;">Save</button>
        </div>
    `;
    msgs.appendChild(wrap);
    aiSettingsTab('provider');
}

window.aiSettingsTab = function(tab){
    ['provider','model','keys'].forEach(function(t){
        var el = document.getElementById('ai-tab-'+t);
        if(el){ el.classList.toggle('active', t===tab); }
    });
    var content = document.getElementById('ai-settings-content');
    if(!content) return;

    if(tab==='provider'){
        var html = '<div style="display:flex;gap:8px;margin-bottom:4px;">';
        Object.keys(AI_PROVIDERS).forEach(function(pid){
            var p = AI_PROVIDERS[pid];
            var isActive = pid===_aiProvider;
            html += '<button class="ai-provider-btn'+(isActive?' active':'')+'" style="--pc:'+p.color+'" onclick="aiSelectProvider(\''+pid+'\')" id="ai-pbtn-'+pid+'">'
                +'<span class="ai-provider-icon" style="color:'+p.color+'">'+p.icon+'</span>'
                +'<span>'+p.label+'</span>'
                +'</button>';
        });
        html += '</div>';
        html += '<div style="color:#666;font-size:10px;line-height:1.5;margin-top:4px;">Select which AI provider powers the agent. You need a valid API key for the selected provider.</div>';
        content.innerHTML = html;

    } else if(tab==='model'){
        var prov = AI_PROVIDERS[_aiProvider];
        var html = '<div style="color:#aaa;font-size:11px;margin-bottom:8px;">Models for <strong style="color:'+prov.color+'">'+prov.label+'</strong>:</div><div style="display:flex;flex-direction:column;gap:2px;">';
        prov.models.forEach(function(m){
            var isActive = m===_aiModel;
            html += '<div class="ai-model-option'+(isActive?' active':'')+'" onclick="aiSelectModel(\''+m+'\')" id="ai-mopt-'+m.replace(/[^a-z0-9]/gi,'-')+'">'+m+(isActive?' ✓':' ')+'</div>';
        });
        html += '</div>';
        content.innerHTML = html;

    } else if(tab==='keys'){
        var html = '<div style="display:flex;flex-direction:column;gap:10px;">';
        Object.keys(AI_PROVIDERS).forEach(function(pid){
            var p = AI_PROVIDERS[pid];
            var saved = _aiKeys[pid] ? '•'.repeat(Math.min(16,_aiKeys[pid].length)) : '';
            html += '<div style="display:flex;flex-direction:column;gap:4px;">'
                +'<label style="font-size:10px;color:'+p.color+';font-weight:700;">'+p.icon+' '+p.label+'</label>'
                +'<div style="display:flex;gap:6px;align-items:center;">'
                +'<input id="ai-keyinp-'+pid+'" type="password" placeholder="'+p.placeholder+'" value="'+aiEscHtml(_aiKeys[pid])+'" '
                +'style="flex:1;background:#222;border:1px solid #3a3a3a;border-radius:6px;color:#e0e0e0;font-size:11px;padding:6px 9px;outline:none;font-family:monospace;" />'
                +'<button onclick="aiClearKey(\''+pid+'\')" style="background:#2a2a2a;border:1px solid #3a3a3a;border-radius:6px;color:#888;font-size:11px;padding:5px 8px;cursor:pointer;" title="Clear">✕</button>'
                +'</div>'
                +'<a href="'+p.helpUrl+'" target="_blank" style="font-size:9px;color:#555;text-decoration:none;">Get key at '+p.helpText+' →</a>'
                +'</div>';
        });
        html += '</div>';
        content.innerHTML = html;

        // wire Enter key on inputs
        Object.keys(AI_PROVIDERS).forEach(function(pid){
            var inp = document.getElementById('ai-keyinp-'+pid);
            if(inp){ inp.addEventListener('keydown',function(e){e.stopPropagation();}); }
        });
    }
};

window.aiSelectProvider = function(pid){
    _aiProvider = pid;
    // Switch model to provider default if current model not in new provider
    if(AI_PROVIDERS[pid].models.indexOf(_aiModel)===-1){
        _aiModel = AI_PROVIDERS[pid].default;
    }
    // Update button styles
    Object.keys(AI_PROVIDERS).forEach(function(p){
        var btn = document.getElementById('ai-pbtn-'+p);
        if(btn){ btn.classList.toggle('active', p===pid); }
    });
};

window.aiSelectModel = function(m){
    _aiModel = m;
    // Update option styles
    AI_PROVIDERS[_aiProvider].models.forEach(function(mo){
        var el = document.getElementById('ai-mopt-'+mo.replace(/[^a-z0-9]/gi,'-'));
        if(el){ el.classList.toggle('active', mo===m); el.textContent=mo+(mo===m?' ✓':''); }
    });
};

window.aiClearKey = function(pid){
    var inp = document.getElementById('ai-keyinp-'+pid);
    if(inp) inp.value='';
    _aiKeys[pid]='';
    localStorage.removeItem('iguhit_key_'+pid);
};

window.aiSaveSettings = function(){
    // Save provider & model
    localStorage.setItem('iguhit_ai_provider', _aiProvider);
    localStorage.setItem('iguhit_ai_model',    _aiModel);

    // Save any keys entered
    Object.keys(AI_PROVIDERS).forEach(function(pid){
        var inp = document.getElementById('ai-keyinp-'+pid);
        if(inp){
            var val = inp.value.trim();
            if(val){ _aiKeys[pid]=val; localStorage.setItem('iguhit_key_'+pid,val); }
        }
    });

    aiUpdateHeaderColor();

    // Validate active provider has a key
    if(!_aiKeys[_aiProvider]){
        var prov = AI_PROVIDERS[_aiProvider];
        aiResetChat();
        aiAppend('assistant',
            '<span style="color:#f1c40f;">⚠ No API key for <strong>'+prov.label+'</strong>.</span><br>'
            +'<span style="font-size:11px;color:#888;">Go to <strong>Settings → API Keys</strong> and enter your key.<br>'
            +'<a href="'+prov.helpUrl+'" target="_blank" style="color:'+prov.color+';">Get one at '+prov.helpText+' →</a></span>'
        );
        return;
    }
    aiResetChat();
};

// ── Canvas context snapshot ───────────────────────────
function aiGetContext(){
    var items=[];
    try{
        paper.project.layers.forEach(function(layer){
            if(layer.name==='System Artboard') return;
            layer.children.forEach(function(c){
                var inf={type:c.className,name:c.name||''};
                if(c.bounds){inf.x=Math.round(c.bounds.x-200);inf.y=Math.round(c.bounds.y-150);inf.w=Math.round(c.bounds.width);inf.h=Math.round(c.bounds.height);}
                if(c.fillColor&&c.fillColor.toCSS) inf.fill=c.fillColor.toCSS(true);
                if(c.strokeColor&&c.strokeColor.toCSS) inf.stroke=c.strokeColor.toCSS(true);
                if(c.selected) inf.selected=true;
                if(c instanceof paper.PointText) inf.text=c.content;
                items.push(inf);
            });
        });
    }catch(e){}
    var sel=(window.getSelectedDrawItems?window.getSelectedDrawItems():[]).length;
    return {
        artboardW:window.state?state.artboardWidth:2550,
        artboardH:window.state?state.artboardHeight:3300,
        unit:window.state?state.artboardUnit:'in',
        ppi:window.state?state.artboardResolution:300,
        tool:window.state?state.activeToolName:'select',
        fill:window.state?(state.fillColorNone?'none':state.fillColor):'#fff',
        stroke:window.state?(state.strokeColorNone?'none':state.strokeColor):'#000',
        strokeW:window.state?state.strokeWidth:2,
        selectedCount:sel,
        totalItems:items.length,
        items:items.slice(0,10)
    };
}

// ── System prompt ─────────────────────────────────────
function aiSystemPrompt(){
    return 'You are an AI agent embedded inside iGuhit Vector, a professional browser-based vector graphics editor built on Paper.js.\n\nYou have FULL CONTROL of the canvas via JavaScript functions.\n\nALWAYS respond with a JSON object — pure JSON only, no markdown fences, no extra text:\n{"reply":"friendly message to show the user","actions":[{"fn":"functionName","args":[...],"description":"what this step does"}]}\n\nFor informational questions with no canvas action: {"reply":"your answer","actions":[]}\n\n## AVAILABLE FUNCTIONS\n\n### Drawing (coordinates: 0,0 = artboard top-left)\n- drawRect(x,y,width,height,fillColor,strokeColor,strokeWidth)\n- drawEllipse(cx,cy,width,height,fillColor,strokeColor,strokeWidth)\n- drawCircle(cx,cy,radius,fillColor,strokeColor,strokeWidth)\n- drawLine(x1,y1,x2,y2,strokeColor,strokeWidth)\n- drawText(text,x,y,fontSize,fillColor,fontFamily)\n- drawStar(cx,cy,points,outerRadius,innerRadius,fillColor,strokeColor)\n- drawPolygon(cx,cy,sides,radius,fillColor,strokeColor,strokeWidth)\n- drawPath(pointsArray,closed,fillColor,strokeColor,strokeWidth)\n- drawPencilShape(pointsArray,fillColor,strokeColor,strokeWidth)\n\n### Selection\n- selectAll(), deselectAll(), selectByIndex(i), selectByName(str)\n\n### Transform\n- moveSelected(dx,dy), scaleSelected(sx,sy), rotateSelected(deg)\n- flipSelectedH(), flipSelectedV()\n\n### Styling\n- setFillColor(hex), setStrokeColor(hex), setStrokeWidth(n), setOpacity(0-100)\n- applyLinearGradient(c1,c2,angle), applyRadialGradient(c1,c2)\n\n### Arrange\n- groupSelected(), ungroupSelected(), bringToFront(), sendToBack()\n- deleteSelected(), duplicateSelected()\n- alignLeft(), alignRight(), alignTop(), alignBottom(), alignCenterX(), alignCenterY()\n\n### Canvas\n- clearCanvas(), fitToScreen(), setZoom(pct), createCropmarks(bleedInches)\n- newArtboard(), saveState(), undo(), redo()\n\n### Pathfinder\n- pathfinderUnite(), pathfinderSubtract(), pathfinderIntersect(), pathfinderExclude()\n\n## COORDINATES\n- Artboard 2550x3300px (8.5x11in @300ppi). Center=(1275,1650). Stay within 0-2550 x 0-3300.\n\n## COMPLEX ILLUSTRATIONS\nBuild up with many calls. For a monkey: head circle (tan), ears, muzzle ellipse (lighter), eyes (dark circles), eye highlights (white dots), nose, smile path, eyebrows. Always end with saveState().\n\nReturn ONLY valid JSON. Nothing else.';
}

// ── Rate-limit countdown shown in chat ───────────────
function aiShowRateCountdown(seconds, attempt, maxAttempts){
    var el = document.getElementById('ai-rate-countdown');
    if(!el){
        var msgs = document.getElementById('ai-messages');
        el = document.createElement('div');
        el.id = 'ai-rate-countdown';
        el.style.cssText = 'background:#2a1f00;border:1px solid #7a5000;border-radius:8px;padding:8px 12px;font-size:11px;color:#f1c40f;display:flex;align-items:center;gap:8px;margin:4px 0;';
        msgs.appendChild(el);
        msgs.scrollTop = msgs.scrollHeight;
    }
    el.innerHTML = '<span style="font-size:16px;">⏳</span>'
        + '<span>Rate limit hit (attempt '+attempt+'/'+maxAttempts+'). '
        + 'Retrying in <strong>'+seconds+'s</strong>…'
        + '<br><span style="color:#888;font-size:10px;">Gemini free tier allows ~2 requests/min. Consider upgrading at <a href="https://aistudio.google.com" target="_blank" style="color:#f1c40f;">aistudio.google.com</a>.</span></span>';
}
function aiClearRateCountdown(){
    var el = document.getElementById('ai-rate-countdown');
    if(el) el.remove();
}

// ── Sleep helper ──────────────────────────────────────
function aiSleep(ms){ return new Promise(function(r){setTimeout(r,ms);}); }

// ── Single raw fetch for one provider/model ───────────
async function aiOneFetch(provider, model, key, messages, systemPrompt){
    if(provider === 'claude'){
        var resp = await fetch('https://api.anthropic.com/v1/messages',{
            method:'POST',
            headers:{
                'Content-Type':'application/json',
                'x-api-key': key,
                'anthropic-version':'2023-06-01',
                'anthropic-dangerous-direct-browser-access':'true'
            },
            body: JSON.stringify({model:model, max_tokens:4096, system:systemPrompt, messages:messages})
        });
        if(!resp.ok){
            var t=await resp.text();
            if(resp.status===401||resp.status===403) throw new Error('AUTH_ERROR:'+t);
            if(resp.status===429) throw new Error('RATE_LIMIT:'+resp.status);
            throw new Error('Claude API '+resp.status+': '+t);
        }
        var data=await resp.json();
        return (data.content||[]).map(function(b){return b.text||'';}).join('');

    } else if(provider === 'gemini'){
        var geminiMsgs = messages.map(function(m){
            return {role: m.role==='assistant'?'model':'user', parts:[{text:m.content}]};
        });
        var url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(key);
        var resp = await fetch(url,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                system_instruction:{parts:[{text:systemPrompt}]},
                contents: geminiMsgs,
                generationConfig:{maxOutputTokens:4096}
            })
        });
        if(!resp.ok){
            var t=await resp.text();
            if(resp.status===400||resp.status===403) throw new Error('AUTH_ERROR:'+t);
            if(resp.status===429) throw new Error('RATE_LIMIT:'+resp.status);
            throw new Error('Gemini API '+resp.status+': '+t);
        }
        var data=await resp.json();
        // Check for blocked/empty response
        var cands = data.candidates||[];
        if(!cands.length) throw new Error('Gemini returned no candidates. Prompt may have been blocked.');
        return (cands[0].content&&cands[0].content.parts||[]).map(function(p){return p.text||'';}).join('');

    } else if(provider === 'openai'){
        var oaiMsgs = [{role:'system', content:systemPrompt}].concat(messages);
        var resp = await fetch('https://api.openai.com/v1/chat/completions',{
            method:'POST',
            headers:{
                'Content-Type':'application/json',
                'Authorization':'Bearer '+key
            },
            body: JSON.stringify({model:model, max_tokens:4096, messages:oaiMsgs})
        });
        if(!resp.ok){
            var t=await resp.text();
            if(resp.status===401) throw new Error('AUTH_ERROR:'+t);
            if(resp.status===429) throw new Error('RATE_LIMIT:'+resp.status);
            throw new Error('OpenAI API '+resp.status+': '+t);
        }
        var data=await resp.json();
        return ((data.choices||[])[0]||{}).message?.content||'';
    }
    throw new Error('Unknown provider: '+provider);
}

// ── API call with retry + backoff + model fallback ────
async function aiCallAPI(messages, systemPrompt){
    var key      = _aiKeys[_aiProvider];
    var provider = _aiProvider;

    // Fallback model chains per provider (lighter models as fallback)
    var fallbackChains = {
        claude : ['claude-sonnet-4-20250514','claude-haiku-4-5-20251001'],
        gemini : ['gemini-2.0-flash','gemini-1.5-flash','gemini-1.0-pro'],
        openai : ['gpt-4o','gpt-4o-mini','gpt-3.5-turbo']
    };

    // Build model attempt list: current model first, then fallbacks (deduped)
    var chain = [_aiModel];
    (fallbackChains[provider]||[]).forEach(function(m){
        if(chain.indexOf(m)===-1) chain.push(m);
    });

    var MAX_RETRIES   = 3;      // retries per model
    var BASE_DELAY_MS = 15000;  // 15 s base wait on first 429
    var lastErr       = null;

    for(var mi=0; mi<chain.length; mi++){
        var model = chain[mi];
        if(mi > 0){
            aiHideThinking();
            aiAppend('log-ok','Rate limit on '+chain[mi-1]+', trying fallback: '+model);
            aiShowThinking();
        }

        for(var attempt=1; attempt<=MAX_RETRIES; attempt++){
            try{
                aiClearRateCountdown();
                var result = await aiOneFetch(provider, model, key, messages, systemPrompt);
                aiClearRateCountdown();
                // Update displayed model if we fell back
                if(model !== _aiModel){
                    aiAppend('log-ok','Used fallback model: '+model);
                }
                return result;

            } catch(err){
                lastErr = err;
                if(err.message.startsWith('AUTH_ERROR')){
                    aiClearRateCountdown();
                    throw err; // no point retrying bad key
                }
                if(err.message.startsWith('RATE_LIMIT')){
                    if(attempt < MAX_RETRIES){
                        // Exponential backoff: 15s, 30s, 60s
                        var waitSec = Math.round((BASE_DELAY_MS * Math.pow(2, attempt-1)) / 1000);
                        // Countdown timer
                        for(var s=waitSec; s>0; s--){
                            aiShowRateCountdown(s, attempt, MAX_RETRIES);
                            await aiSleep(1000);
                        }
                        aiClearRateCountdown();
                        continue; // retry same model
                    }
                    // Exhausted retries on this model — try next in chain
                    aiClearRateCountdown();
                    break;
                }
                // Non-rate-limit error — don't retry
                aiClearRateCountdown();
                throw err;
            }
        }
    }

    // All models exhausted
    aiClearRateCountdown();
    throw new Error(
        'RATE_LIMIT_FINAL: All models hit their quota. '
        + 'Please wait a minute and try again, or switch to a different provider in Settings. '
        + 'Gemini free tier allows ~2 requests/min. '
        + 'Upgrade at aistudio.google.com for higher limits.'
    );
}

// ── Canvas API ────────────────────────────────────────
var AAPI = {
    _oc:function(x,y){return{x:x+200,y:y+150};},
    _sty:function(path,fill,stroke,sw){
        if(fill===null||fill==='none'||fill===''){path.fillColor=null;}
        else{path.fillColor=fill||(window.state?state.fillColor:'#cccccc');}
        if(stroke===null||stroke==='none'||stroke===''){path.strokeColor=null;}
        else if(stroke){path.strokeColor=stroke;path.strokeWidth=sw||2;}
        else{path.strokeColor=window.state&&!state.strokeColorNone?state.strokeColor:null;if(path.strokeColor)path.strokeWidth=sw||2;}
        path.opacity=window.state?state.opacity/100:1;
    },
    _layer:function(){if(window.drawLayer)window.drawLayer.activate();},

    drawRect:function(x,y,w,h,fill,stroke,sw){
        this._layer();var p=this._oc(x,y);
        var path=new paper.Path.Rectangle({point:[p.x,p.y],size:[w||100,h||100]});
        this._sty(path,fill,stroke,sw);path.selected=true;
        return 'Rect '+w+'x'+h+' @('+x+','+y+')';
    },
    drawEllipse:function(cx,cy,w,h,fill,stroke,sw){
        this._layer();var p=this._oc(cx-(w||100)/2,cy-(h||100)/2);
        var path=new paper.Path.Ellipse(new paper.Rectangle(new paper.Point(p.x,p.y),new paper.Size(w||100,h||100)));
        this._sty(path,fill,stroke,sw);path.selected=true;
        return 'Ellipse '+w+'x'+h;
    },
    drawCircle:function(cx,cy,r,fill,stroke,sw){return this.drawEllipse(cx,cy,r*2,r*2,fill,stroke,sw);},
    drawLine:function(x1,y1,x2,y2,stroke,sw){
        this._layer();var a=this._oc(x1,y1),b=this._oc(x2,y2);
        var path=new paper.Path.Line({from:[a.x,a.y],to:[b.x,b.y],strokeColor:stroke||'#000',strokeWidth:sw||2});
        path.selected=true;return 'Line';
    },
    drawText:function(text,x,y,size,fill,font){
        this._layer();var p=this._oc(x,y);
        var pt=new paper.PointText({point:[p.x,p.y],content:text||'Text',fontSize:size||24,fillColor:fill||'#000',fontFamily:font||'Inter,sans-serif'});
        pt.selected=true;return 'Text "'+text+'"';
    },
    drawStar:function(cx,cy,pts,outerR,innerR,fill,stroke){
        this._layer();var p=this._oc(cx,cy);
        var path=new paper.Path.Star({center:[p.x,p.y],points:pts||5,radius1:innerR||30,radius2:outerR||60});
        this._sty(path,fill||'#f1c40f',stroke||'#e67e22',2);path.selected=true;return 'Star';
    },
    drawPolygon:function(cx,cy,sides,r,fill,stroke,sw){
        this._layer();var p=this._oc(cx,cy);
        var path=new paper.Path.RegularPolygon({center:[p.x,p.y],sides:sides||6,radius:r||60});
        this._sty(path,fill,stroke,sw);path.selected=true;return 'Polygon '+sides+'s';
    },
    drawPath:function(pts,closed,fill,stroke,sw){
        this._layer();if(!pts||pts.length<2) return 'Need >=2 pts';
        var path=new paper.Path();
        pts.forEach(function(pt){path.add(new paper.Point(pt.x+200,pt.y+150));});
        if(closed)path.closed=true;
        AAPI._sty(path,fill,stroke,sw);path.selected=true;return 'Path '+pts.length+'pts';
    },
    drawPencilShape:function(pts,fill,stroke,sw){
        this._layer();if(!pts||pts.length<2)return 'Need >=2 pts';
        var path=new paper.Path();
        pts.forEach(function(pt){path.add(new paper.Point(pt.x+200,pt.y+150));});
        path.closed=true;path.simplify(2);path.smooth({type:'continuous'});
        AAPI._sty(path,fill,stroke,sw);path.selected=true;return 'Pencil '+pts.length+'pts';
    },
    selectAll:function(){if(window.drawLayer)window.drawLayer.children.forEach(function(c){c.selected=true;});if(window.onSelectionChanged)window.onSelectionChanged();return 'All selected';},
    deselectAll:function(){if(window.deselectAll)window.deselectAll();else paper.project.selectedItems.forEach(function(i){i.selected=false;});return 'Deselected';},
    selectByIndex:function(i){if(window.deselectAll)window.deselectAll();if(window.drawLayer&&window.drawLayer.children[i]){window.drawLayer.children[i].selected=true;if(window.onSelectionChanged)window.onSelectionChanged();}return 'Sel '+i;},
    selectByName:function(name){var f=0;if(window.drawLayer)window.drawLayer.children.forEach(function(c){if(c.name&&c.name.toLowerCase().indexOf(name.toLowerCase())>=0){c.selected=true;f++;}});if(window.onSelectionChanged)window.onSelectionChanged();return 'Sel '+f;},
    moveSelected:function(dx,dy){var i=window.getSelectedDrawItems?window.getSelectedDrawItems():[];i.forEach(function(x){x.position=x.position.add(new paper.Point(dx,dy));});return 'Moved '+i.length;},
    scaleSelected:function(sx,sy){var i=window.getTopLevelSelectedDrawItems?window.getTopLevelSelectedDrawItems():[];i.forEach(function(x){x.scale(sx,sy||sx);});return 'Scaled';},
    rotateSelected:function(deg){var i=window.getTopLevelSelectedDrawItems?window.getTopLevelSelectedDrawItems():[];i.forEach(function(x){x.rotate(deg);});return 'Rotated '+deg;},
    flipSelectedH:function(){var i=window.getTopLevelSelectedDrawItems?window.getTopLevelSelectedDrawItems():[];i.forEach(function(x){x.scale(-1,1);});return 'FlipH';},
    flipSelectedV:function(){var i=window.getTopLevelSelectedDrawItems?window.getTopLevelSelectedDrawItems():[];i.forEach(function(x){x.scale(1,-1);});return 'FlipV';},
    setFillColor:function(hex){if(window.state){state.fillColor=hex;state.fillColorNone=(!hex||hex==='none');}var el=document.getElementById('fill-color');if(el&&hex&&hex!=='none')el.value=hex;if(window.applyStylesToSelection)window.applyStylesToSelection();return 'Fill→'+hex;},
    setStrokeColor:function(hex){if(window.state){state.strokeColor=hex;state.strokeColorNone=(!hex||hex==='none');}var el=document.getElementById('stroke-color');if(el&&hex&&hex!=='none')el.value=hex;if(window.applyStylesToSelection)window.applyStylesToSelection();return 'Stroke→'+hex;},
    setStrokeWidth:function(w){if(window.state)state.strokeWidth=w;var el=document.getElementById('stroke-width');if(el)el.value=w;if(window.applyStylesToSelection)window.applyStylesToSelection();return 'SW→'+w;},
    setOpacity:function(pct){if(window.state)state.opacity=Math.max(0,Math.min(100,pct));var i=window.getSelectedDrawItems?window.getSelectedDrawItems():[];i.forEach(function(x){x.opacity=pct/100;});return 'Opacity→'+pct;},
    applyLinearGradient:function(c1,c2,ang){var items=window.getSelectedDrawItems?window.getSelectedDrawItems():[];var a=(ang||0)*Math.PI/180;items.forEach(function(item){if(!item.bounds)return;var b=item.bounds,cx=b.center.x,cy=b.center.y,hw=b.width/2,hh=b.height/2;try{item.fillColor={gradient:{stops:[new paper.Color(c1||'#f00'),new paper.Color(c2||'#00f')]},origin:new paper.Point(cx-hw*Math.cos(a),cy-hh*Math.sin(a)),destination:new paper.Point(cx+hw*Math.cos(a),cy+hh*Math.sin(a))};}catch(e){}});return 'LinGrad';},
    applyRadialGradient:function(c1,c2){var items=window.getSelectedDrawItems?window.getSelectedDrawItems():[];items.forEach(function(item){if(!item.bounds)return;try{item.fillColor={gradient:{stops:[new paper.Color(c1||'#f00'),new paper.Color(c2||'#00f')],radial:true},origin:item.bounds.center,destination:item.bounds.rightCenter};}catch(e){}});return 'RadGrad';},
    groupSelected:function(){if(window.groupSelectedItems)window.groupSelectedItems();return 'Grouped';},
    ungroupSelected:function(){if(window.ungroupSelectedItems)window.ungroupSelectedItems();return 'Ungrouped';},
    bringToFront:function(){if(window.bringSelectedToFront)window.bringSelectedToFront();return 'Front';},
    sendToBack:function(){if(window.sendSelectedToBack)window.sendSelectedToBack();return 'Back';},
    deleteSelected:function(){if(window.deleteSelectedItems)window.deleteSelectedItems();return 'Deleted';},
    duplicateSelected:function(){var i=window.getTopLevelSelectedDrawItems?window.getTopLevelSelectedDrawItems():[];i.forEach(function(x){var c=x.clone();c.position=c.position.add(new paper.Point(20,20));c.selected=true;x.selected=false;});return 'Duped '+i.length;},
    alignLeft:function(){if(window.alignSelection)window.alignSelection('left');return 'L';},
    alignRight:function(){if(window.alignSelection)window.alignSelection('right');return 'R';},
    alignTop:function(){if(window.alignSelection)window.alignSelection('top');return 'T';},
    alignBottom:function(){if(window.alignSelection)window.alignSelection('bottom');return 'B';},
    alignCenterX:function(){if(window.alignSelection)window.alignSelection('centerX');return 'CX';},
    alignCenterY:function(){if(window.alignSelection)window.alignSelection('centerY');return 'CY';},
    clearCanvas:function(){if(window.drawLayer)window.drawLayer.removeChildren();if(window.saveState)window.saveState();if(window.updateLayersUI)window.updateLayersUI();return 'Cleared';},
    fitToScreen:function(){if(window.fitArtboardToScreen)window.fitArtboardToScreen();return 'Fit';},
    setZoom:function(pct){if(window.setZoomLevel)window.setZoomLevel(pct/100);return 'Zoom'+pct;},
    createCropmarks:function(bleed){
        var b=bleed||0;var items=window.getSelectedDrawItems?window.getSelectedDrawItems():[];
        if(!items.length)return 'No selection';
        var bounds=items[0].bounds,PPI=(window.state&&state.artboardResolution)||300;
        var bp=b*PPI,half=bp/2;
        var L=bounds.left+half,R=bounds.right-half,T=bounds.top+half,Bm=bounds.bottom-half;
        var gap=8.5,len=14,sw=0.72;
        function mkL(fx,fy,tx,ty){return new paper.Path.Line({from:[fx,fy],to:[tx,ty],strokeColor:new paper.Color(0,0,0),strokeWidth:sw,fillColor:null});}
        if(window.drawLayer)window.drawLayer.activate();
        var grp=new paper.Group([mkL(L-gap-len,T,L-gap,T),mkL(L,T-gap-len,L,T-gap),mkL(R+gap,T,R+gap+len,T),mkL(R,T-gap-len,R,T-gap),mkL(L-gap-len,Bm,L-gap,Bm),mkL(L,Bm+gap,L,Bm+gap+len),mkL(R+gap,Bm,R+gap+len,Bm),mkL(R,Bm+gap,R,Bm+gap+len)]);
        grp.name=b>0?'Crop Marks+Bleed('+b+'in)':'Crop Marks';grp.data={isCropMarkGroup:true};grp.selected=true;
        return 'Cropmarks bleed='+b;
    },
    newArtboard:function(){if(window.createNewArtboard)window.createNewArtboard();return 'NewAB';},
    saveState:function(){if(window.saveState)window.saveState();return 'Saved';},
    undo:function(){if(window.undo)window.undo();return 'Undo';},
    redo:function(){if(window.redo)window.redo();return 'Redo';},
    pathfinderUnite:function(){if(window.pathfinder)window.pathfinder.unite();return 'Unite';},
    pathfinderSubtract:function(){if(window.pathfinder)window.pathfinder.subtract();return 'Sub';},
    pathfinderIntersect:function(){if(window.pathfinder)window.pathfinder.intersect();return 'Int';},
    pathfinderExclude:function(){if(window.pathfinder)window.pathfinder.exclude();return 'Excl';}
};

// ── Run action list ───────────────────────────────────
function aiRunActions(actions){
    if(!actions||!actions.length) return;
    for(var i=0;i<actions.length;i++){
        var a=actions[i];
        try{
            if(!AAPI[a.fn]){aiAppend('log-err','Unknown: '+a.fn);continue;}
            var res=AAPI[a.fn].apply(AAPI,a.args||[]);
            aiAppend('log-ok',(a.description||a.fn)+' → '+res);
        }catch(err){
            aiAppend('log-err',a.fn+': '+err.message);
            console.error('AI Agent:',a.fn,err);
        }
    }
    try{if(window.updateLayersUI)window.updateLayersUI();if(window.onSelectionChanged)window.onSelectionChanged();paper.view.draw();}catch(e){}
}

// ── Main send (global) ────────────────────────────────
async function sendAIMessage(){
    var prov = AI_PROVIDERS[_aiProvider];
    var key  = _aiKeys[_aiProvider];

    if(!key){
        aiShowSettings();
        aiAppend('assistant',
            '<span style="color:'+prov.color+';">🔑 No API key for <strong>'+prov.label+'</strong>.</span><br>'
            +'<span style="font-size:11px;color:#888;">Enter your key in the <strong>API Keys</strong> tab above, then click <strong>Save</strong>.<br>'
            +'<a href="'+prov.helpUrl+'" target="_blank" style="color:'+prov.color+';">Get one at '+prov.helpText+' →</a></span>'
        );
        return;
    }

    var input = document.getElementById('ai-input');
    var btn   = document.getElementById('ai-send-btn');
    var text  = (input?input.value:'').trim();
    if(!text) return;

    input.value='';
    if(btn) btn.disabled=true;

    aiAppend('user', aiEscHtml(text));
    aiShowThinking();

    var ctx=aiGetContext();
    var ctxStr='\n\n[Canvas] '+ctx.artboardW+'x'+ctx.artboardH+'px | tool:'+ctx.tool+' | fill:'+ctx.fill+' stroke:'+ctx.stroke+'('+ctx.strokeW+'px) | items:'+ctx.totalItems+' ('+ctx.selectedCount+' sel) | '+JSON.stringify(ctx.items);
    _aiHistory.push({role:'user', content:text+ctxStr});
    if(_aiHistory.length>14) _aiHistory=_aiHistory.slice(-14);

    try{
        var raw = await aiCallAPI(_aiHistory, aiSystemPrompt());
        aiHideThinking();

        var parsed=null;
        try{
            var clean=raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'').trim();
            parsed=JSON.parse(clean);
        }catch(pe){
            var m=raw.match(/\{[\s\S]*\}/);
            if(m){try{parsed=JSON.parse(m[0]);}catch(e2){}}
        }
        if(!parsed) parsed={reply:raw,actions:[]};

        _aiHistory.push({role:'assistant', content:raw});
        if(parsed.actions&&parsed.actions.length) aiRunActions(parsed.actions);

        var replyHtml=(parsed.reply||'Done.')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\*\*(.*?)\*\*/g,'<strong style="color:'+prov.color+'">$1</strong>')
            .replace(/`([^`]+)`/g,'<code style="background:#1a1a1a;border:1px solid #3a3a3a;border-radius:3px;padding:1px 5px;font-family:monospace;font-size:11px;color:#a8d8a8;">$1</code>')
            .replace(/\n/g,'<br>');
        aiAppend('assistant', replyHtml);

    }catch(err){
        aiHideThinking();
        aiClearRateCountdown();
        var msg=err.message||String(err);
        if(msg.startsWith('AUTH_ERROR')){
            _aiKeys[_aiProvider]='';
            localStorage.removeItem('iguhit_key_'+_aiProvider);
            aiShowSettings();
            aiAppend('assistant','<span style="color:#e07070;">⚠ Invalid API key for <strong>'+prov.label+'</strong>.</span><br><span style="font-size:11px;color:#888;">Please re-enter it in the API Keys tab.</span>');
        } else if(msg.startsWith('RATE_LIMIT_FINAL')){
            var cleanMsg = msg.replace('RATE_LIMIT_FINAL: ','');
            aiAppend('assistant',
                '<span style="color:#f1c40f;font-size:13px;">⚠ Rate Limit Reached</span><br><br>'
                +'<span style="color:#ccc;font-size:11px;line-height:1.7;">'
                +aiEscHtml(cleanMsg)+'</span><br><br>'
                +'<span style="font-size:11px;color:#888;">💡 <strong>Tips:</strong><br>'
                +'• Wait ~1 minute and try again<br>'
                +'• Use a simpler/shorter prompt<br>'
                +'• Switch to <strong>Claude</strong> or <strong>ChatGPT</strong> in ⚙ Settings<br>'
                +'• <a href="https://aistudio.google.com/plan" target="_blank" style="color:#4285f4;">Upgrade Gemini plan →</a>'
                +'</span>'
            );
        } else {
            aiAppend('assistant','<span style="color:#e07070;">⚠ Error:</span> '+aiEscHtml(msg));
        }
        console.error('AI Agent error:',err);
    }

    if(btn) btn.disabled=false;
    if(input) input.focus();
}

// ── Reset chat to welcome screen ──────────────────────
function aiResetChat(){
    _aiHistory=[];
    var msgs=document.getElementById('ai-messages');
    if(!msgs) return;
    var prov=AI_PROVIDERS[_aiProvider];
    msgs.innerHTML=
        '<div class="ai-msg-in" style="background:#2b2b2b;border:1px solid #383838;border-radius:10px 10px 10px 2px;padding:10px 13px;font-size:12px;color:#e0e0e0;line-height:1.6;max-width:95%;">'
        +'<strong style="color:'+prov.color+';">'+prov.icon+' Hello!</strong> I\'m your iGuhit AI Agent powered by <strong>'+prov.label+'</strong>.<br>'
        +'Model: <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px;font-size:10px;color:#a8d8a8;">'+_aiModel+'</code><br><br>'
        +'Try asking me:<br>'
        +'<span class="ai-chip" onclick="document.getElementById(\'ai-input\').value=this.dataset.p;sendAIMessage();" data-p="Draw a monkey face in the center of the artboard">🐵 Draw a monkey</span>'
        +'<span class="ai-chip" onclick="document.getElementById(\'ai-input\').value=this.dataset.p;sendAIMessage();" data-p="Create cropmarks for the selected object with 0.125 inch bleed">✂ Cropmarks</span>'
        +'<span class="ai-chip" onclick="document.getElementById(\'ai-input\').value=this.dataset.p;sendAIMessage();" data-p="Draw a red circle, a blue rectangle, and a yellow star side by side in the center">⭕ Draw shapes</span>'
        +'<span class="ai-chip" onclick="document.getElementById(\'ai-input\').value=this.dataset.p;sendAIMessage();" data-p="Select all items and group them together">📦 Group all</span>'
        +'<span class="ai-chip" onclick="document.getElementById(\'ai-input\').value=this.dataset.p;sendAIMessage();" data-p="Draw 5 concentric circles with different colors in the center">🎨 Concentric circles</span>'
        +'</div>';
}

// ── DOMContentLoaded — wire all controls ──────────────
document.addEventListener('DOMContentLoaded', function(){

    // Update header to saved provider
    aiUpdateHeaderColor();

    // Show settings if no key, else welcome
    if(!_aiKeys[_aiProvider]){
        setTimeout(aiShowSettings, 200);
    }

    // Ctrl+Enter
    var inp=document.getElementById('ai-input');
    if(inp){
        inp.addEventListener('keydown',function(e){e.stopPropagation();if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();sendAIMessage();}});
        inp.addEventListener('keyup',function(e){e.stopPropagation();});
        inp.addEventListener('keypress',function(e){e.stopPropagation();});
    }

    // Settings button (gear icon in header)
    var settingsBtn=document.getElementById('ai-settings-btn');
    if(settingsBtn) settingsBtn.onclick=aiShowSettings;

    // Minimize
    var minBtn=document.getElementById('ai-min-btn');
    if(minBtn){
        minBtn.onclick=function(){
            var body=document.getElementById('ai-agent-body');
            if(!body)return;
            _aiMinimized=!_aiMinimized;
            body.style.display=_aiMinimized?'none':'flex';
            minBtn.textContent=_aiMinimized?'+':'−';
        };
    }

    // Close → FAB
    var closeBtn=document.getElementById('ai-close-btn');
    if(closeBtn){
        closeBtn.onclick=function(){
            var panel=document.getElementById('ai-agent-panel');
            if(panel) panel.style.display='none';
            var fab=document.getElementById('ai-fab');
            if(!fab){
                fab=document.createElement('button');
                fab.id='ai-fab';fab.innerHTML='✦';
                fab.style.cssText='position:fixed;bottom:70px;right:20px;width:46px;height:46px;background:linear-gradient(135deg,#f17c22,#d9660e);border:none;border-radius:12px;color:#fff;font-size:20px;cursor:pointer;z-index:99999;box-shadow:0 4px 16px rgba(241,124,34,0.5);display:flex;align-items:center;justify-content:center;';
                document.body.appendChild(fab);
            }
            fab.style.display='flex';
            fab.onclick=function(){if(panel)panel.style.display='flex';fab.style.display='none';};
        };
    }

    // Clear chat
    var clearBtn=document.getElementById('ai-clear-btn');
    if(clearBtn) clearBtn.onclick=function(){_aiHistory=[];aiResetChat();};

    // Draggable
    var panel=document.getElementById('ai-agent-panel');
    var header=document.getElementById('ai-agent-header');
    if(panel&&header){
        var ox=0,oy=0,mx=0,my=0;
        header.addEventListener('mousedown',function(e){
            if(e.target.tagName==='BUTTON')return;
            e.preventDefault();mx=e.clientX;my=e.clientY;
            document.onmouseup=function(){document.onmouseup=null;document.onmousemove=null;};
            document.onmousemove=function(ev){
                ox=mx-ev.clientX;oy=my-ev.clientY;mx=ev.clientX;my=ev.clientY;
                panel.style.top=Math.max(0,panel.offsetTop-oy)+'px';
                panel.style.left=Math.max(0,panel.offsetLeft-ox)+'px';
                panel.style.bottom='auto';panel.style.right='auto';
            };
        });
    }
});

// ── Re-expose app.js globals ──────────────────────────
window.addEventListener('load',function(){
    setTimeout(function(){
        var fns=['updateLayersUI','deselectAll','onSelectionChanged','applyStylesToSelection',
                 'getSelectedDrawItems','getTopLevelSelectedDrawItems','fitArtboardToScreen',
                 'deleteSelectedItems','groupSelectedItems','ungroupSelectedItems',
                 'bringSelectedToFront','sendSelectedToBack','alignSelection','setZoomLevel',
                 'saveState','undo','redo'];
        fns.forEach(function(fn){
            if(typeof window[fn]==='undefined'){try{if(typeof eval(fn)==='function')window[fn]=eval(fn);}catch(e){}}
        });
        aiUpdateHeaderColor();
        if(_aiKeys[_aiProvider]) aiResetChat();
        console.log('iGuhit AI Agent ready ✦ provider:'+_aiProvider+' model:'+_aiModel);
    },800);
});
