// app.js - iGuhit Vector Application Logic using Paper.js

// Self-contained Visual Error Catcher for easier debugging
window.addEventListener('error', function(e) {
    console.error("Uncaught error: ", e.error);
    const errDiv = document.getElementById('debug-error-banner');
    if (errDiv) errDiv.remove();
    
    const div = document.createElement('div');
    div.id = 'debug-error-banner';
    div.style.position = 'fixed';
    div.style.bottom = '30px';
    div.style.left = '10px';
    div.style.backgroundColor = '#d9534f';
    div.style.color = '#fff';
    div.style.padding = '8px 12px';
    div.style.zIndex = '99999';
    div.style.fontSize = '11px';
    div.style.fontFamily = 'monospace';
    div.style.borderRadius = '3px';
    div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
    div.innerHTML = `<span style="font-weight:bold;">JS Error:</span> ${e.message} (${e.filename.split('/').pop()}:${e.lineno}) <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;margin-left:10px;cursor:pointer;font-weight:bold;">&times;</button>`;
    document.body.appendChild(div);
});

// Global Application State
const state = {
    activeToolName: 'select',
    fillColor: '#ffffff',
    fillColorNone: false,
    strokeColor: '#000000',
    strokeColorNone: false,
    strokeWidth: 2,
    opacity: 100, // percentage 0-100
    
    // Artboard dimensions — 8.5 × 11 inches at 300 ppi (US Letter, print quality)
    artboardWidth: 2550,   // 8.5 × 300
    artboardHeight: 3300,  // 11  × 300
    artboardUnit: 'in',
    artboardResolution: 300,
    
    // Zoom & Pan
    zoomLevel: 1,
    minZoom: 0.05,
    maxZoom: 32,
    
    // Color selector active target ('fill' or 'stroke')
    activeColorTarget: 'fill',
    
    // Undo / Redo History Stacks (contains JSON state strings)
    undoStack: [],
    redoStack: [],
    maxHistory: 30,
    
    // Previous tool state (for spacebar drag return)
    prevToolBeforeSpace: null,
    
    // Virtual modifier keys toggles
    virtualCtrl: false,
    virtualAlt: false,
    virtualShift: false,
    
    // Artboard styling
    artboardBgColor: '#ffffff',

    // Type Tool font state (fontSize in POINTS — user-facing unit)
    fontFamily : 'Inter, sans-serif',
    fontSize   : 24,     // in points (pt), NOT paper pixels
    fontWeight : '400',
    fontStyle  : 'normal'
};

// Paper.js objects references
let artboardLayer; // Background Layer (locked)
let drawLayer;     // Active Layer for user drawings
let artboardRect;  // White visual artboard
let artboardShadow;// Visual drop shadow
let gridGroup;     // Guidelines group

// Current active paper.js Tool
let currentPaperTool = null;
window.currentPaperTool = null; // exposed for feature packs

// References to drawing items
let activePath = null;       // Pen or Pencil active path
let dragTarget = null;       // Selection drag target
let dragTargetSegment = null;// Direct selection segment target
let dragTargetHandle = null; // Direct selection handle target
let marqueeStartPoint = null;
let altClones = [];
let altClonesCreated = false;
let isDraggingPenHandle = false;
let shapeClickOrigin = null;
let shapeClickType = 'rect';
let lastSelectedModalUnit = 'px';

// Predefined Swatches Palette
const SWATCHES = [
    { name: 'None', hex: null },
    { name: 'Black', hex: '#000000' },
    { name: 'Dark Gray 3', hex: '#1a1a1a' },
    { name: 'Dark Gray 2', hex: '#333333' },
    { name: 'Dark Gray 1', hex: '#4d4d4d' },
    { name: 'Medium Gray', hex: '#808080' },
    { name: 'Light Gray 1', hex: '#b3b3b3' },
    { name: 'Light Gray 2', hex: '#d9d9d9' },
    { name: 'White', hex: '#ffffff' },
    
    { name: 'Red', hex: '#e74c3c' },
    { name: 'Coral', hex: '#ff6f61' },
    { name: 'Orange', hex: '#e67e22' },
    { name: 'Yellow', hex: '#f1c40f' },
    { name: 'Green', hex: '#2ecc71' },
    { name: 'Mint', hex: '#1abc9c' },
    { name: 'Teal', hex: '#16a085' },
    { name: 'Sky Blue', hex: '#3498db' },
    { name: 'Navy Blue', hex: '#2980b9' },
    { name: 'Indigo', hex: '#3f51b5' },
    { name: 'Purple', hex: '#9b59b6' },
    { name: 'Lavender', hex: '#a593e0' },
    { name: 'Magenta', hex: '#9b59b6' },
    { name: 'Pink', hex: '#ff8b94' },
    { name: 'Salmon', hex: '#ffaaa5' }
];

window.addEventListener('load', () => {
    initApp();
});

// Initialize the entire application
function initApp() {
    setupPaperJS();
    setupSwatches();
    setupLayers();
    setupTools();
    setupUIEventListeners();
    setupKeyboardShortcuts();
    
    // Initial Undo State Save
    saveState();
    
    // Fit artboard on load
    setTimeout(fitArtboardToScreen, 100);
}

// -------------------------------------------------------------
// PAPER.JS SETUP
// -------------------------------------------------------------
function setupPaperJS() {
    const canvas = document.getElementById('paper-canvas');
    paper.setup(canvas);
    
    // Create custom layers
    artboardLayer = new paper.Layer();
    artboardLayer.name = 'System Artboard';
    artboardLayer.data = {
        artboardUnit: state.artboardUnit,
        artboardResolution: state.artboardResolution
    };
    
    drawLayer = new paper.Layer();
    drawLayer.name = 'Layer 1';
    drawLayer.activate();
    
    // Draw visual Artboard in the artboardLayer
    artboardLayer.activate();
    
    // Artboard Shadow (slightly offset dark rectangle)
    artboardShadow = new paper.Path.Rectangle({
        point: [204, 154],
        size: [state.artboardWidth, state.artboardHeight],
        fillColor: '#121212',
        opacity: 0.4
    });
    artboardShadow.name = 'artboardShadow';
    
    // White Artboard
    artboardRect = new paper.Path.Rectangle({
        point: [200, 150],
        size: [state.artboardWidth, state.artboardHeight],
        fillColor: '#ffffff',
        strokeColor: '#555555',
        strokeWidth: 1
    });
    artboardRect.name = 'artboardRect';
    
    // Draw Grid Lines on the Artboard (subtle gray lines)
    gridGroup = new paper.Group();
    gridGroup.name = 'gridGroup';
    
    const gridSpacing = 50;
    
    // Vertical gridlines
    for (let x = 200 + gridSpacing; x < 200 + state.artboardWidth; x += gridSpacing) {
        let line = new paper.Path.Line({
            from: [x, 150],
            to: [x, 150 + state.artboardHeight],
            strokeColor: '#f0f0f0',
            strokeWidth: 1
        });
        gridGroup.addChild(line);
    }
    // Horizontal gridlines
    for (let y = 150 + gridSpacing; y < 150 + state.artboardHeight; y += gridSpacing) {
        let line = new paper.Path.Line({
            from: [200, y],
            to: [200 + state.artboardWidth, y],
            strokeColor: '#f0f0f0',
            strokeWidth: 1
        });
        gridGroup.addChild(line);
    }
    
    artboardLayer.addChild(artboardShadow);
    artboardLayer.addChild(artboardRect);
    artboardLayer.addChild(gridGroup);
    
    // Prevent Selection/Interaction on the artboardLayer
    artboardLayer.locked = true;

    // Expose globals for enhancements.js
    window.artboardLayer  = artboardLayer;
    window.artboardRect   = artboardRect;
    window.artboardShadow = artboardShadow;
    window.gridGroup      = gridGroup;
    
    // Back to Drawing Layer
    drawLayer.activate();
    
    // Event listener for mouse coordinates in Status Bar
    paper.view.onMouseMove = (event) => {
        const artboardX = Math.round(event.point.x - 200);
        const artboardY = Math.round(event.point.y - 150);
        document.getElementById('mouse-coords').innerText = `X: ${artboardX} px, Y: ${artboardY} px`;
        
        // Handle cursor styles for Selection Tool resize handles
        if (state.activeToolName === 'select' && getSelectedDrawItems().length > 0) {
            const bounds = getSelectionBounds();
            const handles = getSelectionHandles(bounds);
            const tolerance = 8 / paper.view.zoom;
            let activeHandle = null;
            
            for (const [name, point] of Object.entries(handles)) {
                if (event.point.subtract(point).length < tolerance) {
                    activeHandle = name;
                    break;
                }
            }
            
            const canvas = document.getElementById('paper-canvas');
            if (activeHandle) {
                if (activeHandle === 'top-left' || activeHandle === 'bottom-right') {
                    canvas.style.cursor = 'nwse-resize';
                } else if (activeHandle === 'top-right' || activeHandle === 'bottom-left') {
                    canvas.style.cursor = 'nesw-resize';
                } else if (activeHandle === 'top-center' || activeHandle === 'bottom-center') {
                    canvas.style.cursor = 'ns-resize';
                } else if (activeHandle === 'left-center' || activeHandle === 'right-center') {
                    canvas.style.cursor = 'ew-resize';
                }
            } else {
                canvas.style.cursor = 'default';
            }
        } else {
            const canvas = document.getElementById('paper-canvas');
            if (canvas && canvas.style.cursor !== 'default' && canvas.style.cursor !== '') {
                canvas.style.cursor = 'default';
            }
        }
    };
}

// -------------------------------------------------------------
// SWATCHES GENERATOR
// -------------------------------------------------------------
function setupSwatches() {
    const grid = document.getElementById('swatches-grid');
    grid.innerHTML = '';
    
    SWATCHES.forEach(swatch => {
        const item = document.createElement('div');
        item.className = 'swatch-item';
        item.title = swatch.name;
        
        if (swatch.hex === null) {
            item.classList.add('swatch-none');
        } else {
            item.style.backgroundColor = swatch.hex;
        }
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.swatch-item').forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            
            if (state.activeColorTarget === 'fill') {
                if (swatch.hex === null) {
                    state.fillColorNone = true;
                    document.getElementById('toolbar-fill-indicator').classList.add('none');
                    document.getElementById('btn-fill-none').classList.add('active');
                } else {
                    state.fillColorNone = false;
                    state.fillColor = swatch.hex;
                    document.getElementById('fill-color').value = swatch.hex;
                    document.getElementById('toolbar-fill-indicator').style.backgroundColor = swatch.hex;
                    document.getElementById('toolbar-fill-indicator').classList.remove('none');
                    document.getElementById('btn-fill-none').classList.remove('active');
                }
            } else {
                if (swatch.hex === null) {
                    state.strokeColorNone = true;
                    document.getElementById('toolbar-stroke-indicator').classList.add('none');
                    document.getElementById('btn-stroke-none').classList.add('active');
                } else {
                    state.strokeColorNone = false;
                    state.strokeColor = swatch.hex;
                    document.getElementById('stroke-color').value = swatch.hex;
                    document.getElementById('toolbar-stroke-indicator').style.borderColor = swatch.hex;
                    document.getElementById('toolbar-stroke-indicator').classList.remove('none');
                    document.getElementById('btn-stroke-none').classList.remove('active');
                }
            }
            applyStylesToSelection();
        });
        
        grid.appendChild(item);
    });
}

// -------------------------------------------------------------
// LAYERS MANAGER
// -------------------------------------------------------------
function setupLayers() {
    updateLayersUI();
}

function getItemNameAndIcon(item) {
    let name = item.name;
    let icon = '<i class="fa-solid fa-shapes"></i>';
    
    if (item instanceof paper.PointText) {
        icon = '<i class="fa-solid fa-font"></i>';
        if (!name) {
            name = item.content.length > 15 ? `Text: "${item.content.substring(0, 12)}..."` : `Text: "${item.content}"`;
        }
    } else if (item instanceof paper.Group) {
        icon = '<i class="fa-solid fa-object-group"></i>';
        if (!name) name = "Group";
    } else if (item instanceof paper.CompoundPath) {
        icon = '<i class="fa-solid fa-circle-nodes"></i>';
        if (!name) name = "Compound Path";
    } else if (item instanceof paper.Path) {
        if (item.className === 'Rectangle') {
            icon = '<i class="fa-regular fa-square"></i>';
            if (!name) name = "Rectangle";
        } else if (item.className === 'Ellipse') {
            icon = '<i class="fa-regular fa-circle"></i>';
            if (!name) name = "Ellipse";
        } else {
            icon = '<i class="fa-solid fa-pen-nib"></i>';
            if (!name) name = item.closed ? "Path" : "Line";
        }
    }
    
    if (!name) {
        name = "Item";
    }
    return { name, icon };
}

function updateLayersUI() {
    const list = document.getElementById('layers-list');
    list.innerHTML = '';
    
    // List all user drawing layers
    const drawingLayers = paper.project.layers.filter(l => l.name !== 'System Artboard');
    
    // Display in reverse order (top layer first in UI list)
    [...drawingLayers].reverse().forEach(layer => {
        const item = document.createElement('li');
        item.className = 'layer-item';
        if (layer === paper.project.activeLayer) {
            item.classList.add('active');
        }
        
        // Expand/Collapse Chevron Button
        const expandBtn = document.createElement('button');
        expandBtn.className = 'layer-expand-btn';
        if (layer.data.expanded === undefined) {
            layer.data.expanded = true; // Default expanded
        }
        if (layer.data.expanded) {
            expandBtn.classList.add('expanded');
        }
        expandBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        
        // Hide chevron icon if layer has no children
        if (layer.children.length === 0) {
            expandBtn.style.visibility = 'hidden';
        }
        
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layer.data.expanded = !layer.data.expanded;
            updateLayersUI();
        });
        
        // Visibility Toggle Button (Eye)
        const visBtn = document.createElement('button');
        visBtn.className = 'layer-visibility';
        if (!layer.visible) visBtn.classList.add('hidden');
        visBtn.innerHTML = layer.visible ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
        visBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layer.visible = !layer.visible;
            visBtn.innerHTML = layer.visible ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
            if (!layer.visible) visBtn.classList.add('hidden');
            else visBtn.classList.remove('hidden');
            paper.view.draw();
        });
        
        // Lock Toggle Button (Padlock)
        const lockBtn = document.createElement('button');
        lockBtn.className = 'layer-lock';
        if (layer.locked) lockBtn.classList.add('locked');
        lockBtn.innerHTML = layer.locked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
        lockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layer.locked = !layer.locked;
            lockBtn.innerHTML = layer.locked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
            if (layer.locked) lockBtn.classList.add('locked');
            else lockBtn.classList.remove('locked');
        });
        
        // Layer Color Preview Indicator
        const colorIndicator = document.createElement('div');
        colorIndicator.className = 'layer-preview-color';
        if (!layer.data.color) {
            const colors = ['#4a90e2', '#e24a4a', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];
            layer.data.color = colors[paper.project.layers.indexOf(layer) % colors.length];
        }
        colorIndicator.style.backgroundColor = layer.data.color;
        
        // Radio button — select-all / deselect-all for this layer
        const radioBtn = document.createElement('div');
        radioBtn.className = 'layer-radio';
        radioBtn.title = 'Click to select all items in layer (click again to deselect)';
        const allSel = layer.children.length > 0 && layer.children.every(c => c.selected);
        if (allSel) radioBtn.classList.add('selected');
        radioBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const alreadyAll = layer.children.length > 0 && layer.children.every(c => c.selected);
            if (alreadyAll) {
                layer.children.forEach(c => c.selected = false);
                radioBtn.classList.remove('selected');
            } else {
                deselectAll();
                layer.children.forEach(c => c.selected = true);
                layer.activate();
                radioBtn.classList.add('selected');
            }
            onSelectionChanged();
            paper.view.draw();
        });

        // Layer Name Input — single click focuses, double click edits
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'layer-title-input';
        titleInput.value = layer.name || 'Unnamed Layer';
        titleInput.readOnly = true;
        titleInput.title = 'Double-click to rename';

        titleInput.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            titleInput.readOnly = false;
            titleInput.focus();
            titleInput.select();
        });
        titleInput.addEventListener('blur', () => {
            titleInput.readOnly = true;
            if (titleInput.value.trim()) layer.name = titleInput.value.trim();
        });
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { titleInput.blur(); }
            if (e.key === 'Escape') { titleInput.value = layer.name; titleInput.blur(); }
            e.stopPropagation(); // prevent canvas shortcuts while typing
        });
        titleInput.addEventListener('click', (e) => {
            if (!titleInput.readOnly) e.stopPropagation();
        });
        
        // Target selection circle at right
        const targetBtn = document.createElement('div');
        targetBtn.className = 'layer-target';
        targetBtn.title = 'Select Layer Contents';
        
        const allSelected = layer.children.length > 0 && layer.children.every(child => child.selected);
        if (allSelected) {
            targetBtn.style.backgroundColor = layer.data.color;
            targetBtn.style.borderColor = layer.data.color;
        } else {
            targetBtn.style.backgroundColor = 'transparent';
            targetBtn.style.borderColor = '';
        }
        
        targetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deselectAll();
            layer.children.forEach(child => child.selected = true);
            layer.activate();
            onSelectionChanged();
            paper.view.draw();
        });
        
        item.appendChild(expandBtn);
        item.appendChild(radioBtn);
        item.appendChild(visBtn);
        item.appendChild(lockBtn);
        item.appendChild(colorIndicator);
        item.appendChild(titleInput);
        item.appendChild(targetBtn);
        
        // Click to activate layer
        item.addEventListener('click', () => {
            deselectAll();
            layer.activate();
            onSelectionChanged();
            paper.view.draw();
        });
        
        list.appendChild(item);
        
        // Render sub-items (children of this layer) if expanded
        if (layer.data.expanded) {
            [...layer.children].reverse().forEach(child => {
                const childItem = document.createElement('li');
                childItem.className = 'layer-child-item';
                if (child.selected) {
                    childItem.classList.add('active');
                }
                
                // Visibility toggle for child item
                const childVisBtn = document.createElement('button');
                childVisBtn.className = 'layer-visibility';
                if (!child.visible) childVisBtn.classList.add('hidden');
                childVisBtn.innerHTML = child.visible ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
                childVisBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    child.visible = !child.visible;
                    childVisBtn.innerHTML = child.visible ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
                    if (!child.visible) childVisBtn.classList.add('hidden');
                    else childVisBtn.classList.remove('hidden');
                    paper.view.draw();
                });
                
                // Icon and Name
                const info = getItemNameAndIcon(child);
                const childIcon = document.createElement('span');
                childIcon.innerHTML = info.icon;
                childIcon.style.color = layer.data.color;
                
                const childTitle = document.createElement('span');
                childTitle.className = 'child-title';
                childTitle.innerText = info.name;
                
                // Target selection circle for child item
                const childTargetBtn = document.createElement('div');
                childTargetBtn.className = 'child-target';
                childTargetBtn.title = 'Select Item';
                if (child.selected) {
                    childTargetBtn.style.backgroundColor = layer.data.color;
                    childTargetBtn.style.borderColor = layer.data.color;
                }
                
                childTargetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deselectAll();
                    child.selected = true;
                    layer.activate();
                    onSelectionChanged();
                    paper.view.draw();
                });
                
                childItem.appendChild(childVisBtn);
                childItem.appendChild(childIcon);
                childItem.appendChild(childTitle);
                childItem.appendChild(childTargetBtn);
                
                // Click on child row to select
                childItem.addEventListener('click', () => {
                    deselectAll();
                    child.selected = true;
                    layer.activate();
                    onSelectionChanged();
                    paper.view.draw();
                });
                
                list.appendChild(childItem);
            });
        }
    });
}


function applyVirtualModifiers(event) {
    if (!event) return;
    
    // Save physical modifier states from the native browser event if available
    const native = event.event;
    const physicalAlt = native ? !!native.altKey : !!(event.modifiers && (event.modifiers.alt || event.modifiers.option));
    const physicalCtrl = native ? !!(native.ctrlKey || native.metaKey) : !!(event.modifiers && (event.modifiers.control || event.modifiers.command));
    const physicalShift = native ? !!native.shiftKey : !!(event.modifiers && event.modifiers.shift);
    
    // Combine physical keys with virtual buttons
    const finalAlt = physicalAlt || !!state.virtualAlt;
    const finalCtrl = physicalCtrl || !!state.virtualCtrl;
    const finalShift = physicalShift || !!state.virtualShift;
    
    if (event.modifiers) {
        // Alt / Option
        try {
            Object.defineProperty(event.modifiers, 'alt', { value: finalAlt, writable: true, configurable: true });
            Object.defineProperty(event.modifiers, 'option', { value: finalAlt, writable: true, configurable: true });
        } catch(e) {
            event.modifiers.alt = finalAlt;
            event.modifiers.option = finalAlt;
        }
        
        // Control / Command
        try {
            Object.defineProperty(event.modifiers, 'control', { value: finalCtrl, writable: true, configurable: true });
            Object.defineProperty(event.modifiers, 'command', { value: finalCtrl, writable: true, configurable: true });
        } catch(e) {
            event.modifiers.control = finalCtrl;
            event.modifiers.command = finalCtrl;
        }
        
        // Shift
        try {
            Object.defineProperty(event.modifiers, 'shift', { value: finalShift, writable: true, configurable: true });
        } catch(e) {
            event.modifiers.shift = finalShift;
        }
    }
}

// -------------------------------------------------------------
// PAPER.JS INTERACTIVE TOOLS CREATION
// -------------------------------------------------------------
function setupTools() {
    currentPaperTool = new paper.Tool();
    window.currentPaperTool = currentPaperTool;
    
    // Core mouse events delegation
    currentPaperTool.onMouseDown = (event) => {
        applyVirtualModifiers(event);
        const tool = state.activeToolName;
        
        // Only block actual drawing tools when the active layer is locked.
        // Selection, direct-select, artboard, hand, zoom always work.
        const drawingTools = ['pen','pencil','rect','ellipse','line','type','eraser','rotate','shape-builder','blob-brush'];
        if (drawingTools.includes(tool)) {
            if (paper.project.activeLayer.locked) {
                // Try to auto-recover: activate the first unlocked draw layer
                const unlocked = paper.project.layers.find(l => !l.locked && l.name !== 'System Artboard');
                if (unlocked) {
                    unlocked.activate();
                } else {
                    alert("The active layer is locked! Please unlock it or select another layer to draw.");
                    return;
                }
            }
        }
        
        if (tool === 'select') {
            handleSelectMouseDown(event);
        } else if (tool === 'direct-select') {
            handleDirectSelectMouseDown(event);
        } else if (tool === 'artboard') {
            handleArtboardToolMouseDown(event);
        } else if (tool === 'pen') {
            handlePenMouseDown(event);
        } else if (tool === 'type') {
            handleTypeMouseDown(event);
        } else if (tool === 'line') {
            handleLineMouseDown(event);
        } else if (tool === 'rect') {
            handleRectMouseDown(event);
        } else if (tool === 'ellipse') {
            handleEllipseMouseDown(event);
        } else if (tool === 'pencil') {
            handlePencilMouseDown(event);
        } else if (tool === 'eraser') {
            handleEraserMouseDown(event);
        } else if (tool === 'hand') {
            handleHandMouseDown(event);
        } else if (tool === 'zoom') {
            handleZoomMouseDown(event);
        } else if (tool === 'rotate') {
            handleRotateMouseDown(event);
        } else if (tool === 'shape-builder') {
            handleShapeBuilderMouseDown(event);
        } else if (tool === 'tapered') {
            handleTaperedMouseDown(event);
        } else if (tool === 'gradient') {
            handleGradientToolMouseDown(event);
        }
    };
    
    currentPaperTool.onMouseDrag = (event) => {
        applyVirtualModifiers(event);
        const tool = state.activeToolName;
        
        if (tool === 'select') {
            handleSelectMouseDrag(event);
        } else if (tool === 'direct-select') {
            handleDirectSelectMouseDrag(event);
        } else if (tool === 'artboard') {
            handleArtboardToolMouseDrag(event);
        } else if (tool === 'pen') {
            handlePenMouseDrag(event);
        } else if (tool === 'line') {
            handleLineMouseDrag(event);
        } else if (tool === 'rect') {
            handleRectMouseDrag(event);
        } else if (tool === 'ellipse') {
            handleEllipseMouseDrag(event);
        } else if (tool === 'pencil') {
            handlePencilMouseDrag(event);
        } else if (tool === 'eraser') {
            handleEraserMouseDrag(event);
        } else if (tool === 'hand') {
            handleHandMouseDrag(event);
        } else if (tool === 'zoom') {
            handleZoomMouseDrag(event);
        } else if (tool === 'rotate') {
            handleRotateMouseDrag(event);
        } else if (tool === 'shape-builder') {
            handleShapeBuilderMouseDrag(event);
        } else if (tool === 'tapered') {
            handleTaperedMouseDrag(event);
        } else if (tool === 'gradient') {
            handleGradientToolMouseDrag(event);
        }
    };
    
    currentPaperTool.onMouseUp = (event) => {
        applyVirtualModifiers(event);
        const tool = state.activeToolName;
        
        if (tool === 'select') {
            handleSelectMouseUp(event);
        } else if (tool === 'direct-select') {
            handleDirectSelectMouseUp(event);
        } else if (tool === 'artboard') {
            handleArtboardToolMouseUp(event);
        } else if (tool === 'pen') {
            handlePenMouseUp(event);
        } else if (tool === 'line') {
            handleLineMouseUp(event);
        } else if (tool === 'rect') {
            handleRectMouseUp(event);
        } else if (tool === 'ellipse') {
            handleEllipseMouseUp(event);
        } else if (tool === 'pencil') {
            handlePencilMouseUp(event);
        } else if (tool === 'eraser') {
            handleEraserMouseUp(event);
        } else if (tool === 'hand') {
            handleHandMouseUp(event);
        } else if (tool === 'zoom') {
            handleZoomMouseUp(event);
        } else if (tool === 'rotate') {
            handleRotateMouseUp(event);
        } else if (tool === 'shape-builder') {
            handleShapeBuilderMouseUp(event);
        } else if (tool === 'tapered') {
            handleTaperedMouseUp(event);
        } else if (tool === 'gradient') {
            handleGradientToolMouseUp(event);
        }
    };
}

// -------------------------------------------------------------
// TOOL HANDLERS IMPLEMENTATION
// -------------------------------------------------------------

// --- Selection Tool Scale/Resize helpers & variables ---
let isScaling = false;
let scaleHandle = null;
let scaleAnchor = null;
let scaleStartBounds = null;
let scaleOrigVector = null;

function getSelectionBounds() {
    const selection = getSelectedDrawItems();
    if (selection.length === 0) return null;
    let bounds = null;
    selection.forEach(item => {
        if (!bounds) {
            bounds = item.bounds.clone();
        } else {
            bounds = bounds.unite(item.bounds);
        }
    });
    return bounds;
}

function getSelectionHandles(bounds) {
    if (!bounds) return {};
    return {
        'top-left': bounds.topLeft,
        'top-center': bounds.topCenter,
        'top-right': bounds.topRight,
        'left-center': bounds.leftCenter,
        'right-center': bounds.rightCenter,
        'bottom-left': bounds.bottomLeft,
        'bottom-center': bounds.bottomCenter,
        'bottom-right': bounds.bottomRight
    };
}

function getOppositePoint(bounds, handleName) {
    switch (handleName) {
        case 'top-left': return bounds.bottomRight;
        case 'top-center': return bounds.bottomCenter;
        case 'top-right': return bounds.bottomLeft;
        case 'left-center': return bounds.rightCenter;
        case 'right-center': return bounds.leftCenter;
        case 'bottom-left': return bounds.topRight;
        case 'bottom-center': return bounds.topCenter;
        case 'bottom-right': return bounds.topLeft;
        default: return null;
    }
}

function resetVirtualAlt() {
    state.virtualAlt = false;
    const altBtn = document.getElementById('btn-virtual-alt');
    if (altBtn) {
        altBtn.classList.remove('active');
    }
}

function handleSelectMouseDown(event) {
    dragTarget = null;
    marqueeStartPoint = null;
    altClonesCreated = false;
    altClones = [];
    isScaling = false;
    
    // Check if clicked on a resize handle first
    if (getSelectedDrawItems().length > 0) {
        const bounds = getSelectionBounds();
        const handles = getSelectionHandles(bounds);
        const tolerance = 8 / paper.view.zoom;
        let clickedHandle = null;
        for (const [name, point] of Object.entries(handles)) {
            if (event.point.subtract(point).length < tolerance) {
                clickedHandle = name;
                break;
            }
        }
        
        if (clickedHandle) {
            isScaling = true;
            scaleHandle = clickedHandle;
            scaleAnchor = getOppositePoint(bounds, clickedHandle);
            scaleStartBounds = bounds.clone();
            scaleOrigVector = event.point.subtract(scaleAnchor);
            
            // Backup selected items for scaling
            const selection = getTopLevelSelectedDrawItems();
            selection.forEach(item => {
                item.data.originalClone = item.clone({ insert: false });
                item.data.dragIndex = item.parent.children.indexOf(item);
            });
            
            return; // Bypass normal selection hit-test/marquee
        }
    }
    
    // Hit test with tolerance of 6 pixels to find selected shape
    const hitResult = paper.project.hitTest(event.point, {
        fill: true,
        stroke: true,
        segments: true,
        tolerance: 6,
        match: (hit) => hit.item.layer.name !== 'System Artboard' && !hit.item.layer.locked
    });
    
    if (hitResult) {
        const item = hitResult.item;
        
        // Find topmost group/compound path if grouped
        let parentItem = item;
        while (parentItem.parent && 
               parentItem.parent instanceof paper.Group && 
               parentItem.parent.className !== 'Layer' && 
               parentItem.parent.layer.name !== 'System Artboard') {
            parentItem = parentItem.parent;
        }
        
        if (event.modifiers.shift) {
            // Toggle selection
            parentItem.selected = !parentItem.selected;
        } else {
            // If not selected, select it and deselect others
            if (!parentItem.selected) {
                deselectAll();
                parentItem.selected = true;
            }
        }
        
        if (parentItem.selected) {
            dragTarget = parentItem;
            parentItem.layer.activate();
            
            // Save starting positions of all selected items for Alt duplication
            const selectedItems = getSelectedDrawItems();
            selectedItems.forEach(item => {
                item.data.dragStartPos = item.position.clone();
            });
        }
        
        onSelectionChanged();
    } else {
        // Clicked in empty space -> Start Selection Marquee
        resetVirtualAlt();
        if (!event.modifiers.shift) {
            deselectAll();
        }
        marqueeStartPoint = event.point;
        selectionMarquee = new paper.Path.Rectangle({
            point: event.point,
            size: [0, 0],
            strokeColor: '#eb701b',
            strokeWidth: 1,
            dashArray: [4, 4]
        });
        onSelectionChanged();
    }
}

function handleSelectMouseDrag(event) {
    if (isScaling) {
        const isShift = event.modifiers.shift || state.virtualShift;
        const currVector = event.point.subtract(scaleAnchor);
        const origVector = scaleOrigVector;

        let scaleX = 1;
        let scaleY = 1;

        if (scaleHandle === 'left-center' || scaleHandle === 'right-center') {
            scaleX = origVector.x !== 0 ? currVector.x / origVector.x : 1;
        } else if (scaleHandle === 'top-center' || scaleHandle === 'bottom-center') {
            scaleY = origVector.y !== 0 ? currVector.y / origVector.y : 1;
        } else {
            // Corner handles
            scaleX = origVector.x !== 0 ? currVector.x / origVector.x : 1;
            scaleY = origVector.y !== 0 ? currVector.y / origVector.y : 1;
            
            if (isShift) {
                const absScale = Math.max(Math.abs(scaleX), Math.abs(scaleY));
                scaleX = absScale * Math.sign(scaleX || 1);
                scaleY = absScale * Math.sign(scaleY || 1);
            }
        }

        // Safe clamp to prevent collapse to zero/errors
        if (Math.abs(scaleX) < 0.001) scaleX = 0.001 * Math.sign(scaleX || 1);
        if (Math.abs(scaleY) < 0.001) scaleY = 0.001 * Math.sign(scaleY || 1);

        const selection = getTopLevelSelectedDrawItems();
        selection.forEach((item, i) => {
            if (!item.data.originalClone) return;
            const parent = item.parent;
            const originalClone = item.data.originalClone;
            const dragIndex = item.data.dragIndex;
            
            item.remove();
            
            const newScaledItem = originalClone.clone();
            newScaledItem.scale(scaleX, scaleY, scaleAnchor);
            
            parent.insertChild(dragIndex, newScaledItem);
            newScaledItem.data.originalClone = originalClone;
            newScaledItem.data.dragIndex = dragIndex;
            newScaledItem.selected = true;
            
            selection[i] = newScaledItem;
            if (dragTarget === item) {
                dragTarget = newScaledItem;
            }
        });
        
        updateSelectionVisualState();
        paper.view.draw();
        
    } else if (dragTarget) {
        // Check for Alt/Option key to duplicate items
        if (event.modifiers.option) {
            document.getElementById('paper-canvas').style.cursor = 'copy';
            if (!altClonesCreated) {
                const selectedItems = getTopLevelSelectedDrawItems();
                altClones = selectedItems.map(item => {
                    const clone = item.clone();
                    clone.selected = false;
                    if (item.data.dragStartPos) {
                        clone.position = item.data.dragStartPos.clone();
                    }
                    clone.insertBelow(item);
                    return clone;
                });
                altClonesCreated = true;
                updateLayersUI();
            }
        } else {
            document.getElementById('paper-canvas').style.cursor = 'default';
            if (altClonesCreated) {
                // If Alt key was released, remove the clones
                altClones.forEach(clone => clone.remove());
                altClones = [];
                altClonesCreated = false;
                updateLayersUI();
            }
        }
        
        const selectedItems = getTopLevelSelectedDrawItems();
        selectedItems.forEach(item => {
            item.position = item.position.add(event.delta);
        });
        updateSelectionVisualState();
    } else if (selectionMarquee) {
        selectionMarquee.remove();
        const rect = new paper.Rectangle(marqueeStartPoint, event.point);
        selectionMarquee = new paper.Path.Rectangle({
            rectangle: rect,
            strokeColor: '#eb701b',
            strokeWidth: 1,
            dashArray: [4, 4]
        });
    }
}

function handleSelectMouseUp(event) {
    if (isScaling) {
        isScaling = false;
        scaleHandle = null;
        scaleAnchor = null;
        scaleStartBounds = null;
        scaleOrigVector = null;
        
        // Clear original clones references to free memory
        const selection = getSelectedDrawItems();
        selection.forEach(item => {
            if (item.data) {
                delete item.data.originalClone;
                delete item.data.dragIndex;
            }
        });
        
        saveState();
        onSelectionChanged();
        paper.view.draw();
    } else if (dragTarget) {
        document.getElementById('paper-canvas').style.cursor = 'default';
        
        if (!event.modifiers.option && altClonesCreated) {
            altClones.forEach(clone => clone.remove());
            altClones = [];
            altClonesCreated = false;
        }
        
        saveState();
        onSelectionChanged();
        dragTarget = null;
        altClonesCreated = false;
        altClones = [];
    } else if (selectionMarquee) {
        const bounds = selectionMarquee.bounds;
        
        if (bounds.width > 2 || bounds.height > 2) {
            const drawItems = paper.project.activeLayer.children;
            drawItems.forEach(item => {
                if (bounds.intersects(item.bounds) || bounds.contains(item.bounds)) {
                    item.selected = true;
                }
            });
        }
        
        selectionMarquee.remove();
        selectionMarquee = null;
        marqueeStartPoint = null;
        onSelectionChanged();
    }
}

// --- DIRECT SELECTION TOOL (A) ---
function handleDirectSelectMouseDown(event) {
    dragTargetSegment = null;
    dragTargetHandle = null;
    dragTarget = null;
    
    const hitResult = paper.project.hitTest(event.point, {
        segments: true,
        handles: true,
        stroke: true,
        fill: true,
        tolerance: 6,
        match: (hit) => hit.item.layer.name !== 'System Artboard' && !hit.item.layer.locked
    });
    
    if (hitResult) {
        const item = hitResult.item;
        item.selected = true;
        item.layer.activate();
        
        if (hitResult.type === 'segment') {
            dragTargetSegment = hitResult.segment;
        } else if (hitResult.type === 'handle-in') {
            dragTargetHandle = hitResult.segment.handleIn;
        } else if (hitResult.type === 'handle-out') {
            dragTargetHandle = hitResult.segment.handleOut;
        } else {
            dragTarget = item;
        }
        
        onSelectionChanged();
    } else {
        if (!event.modifiers.shift) {
            deselectAll();
        } else {
            onSelectionChanged();
        }
    }
}

function handleDirectSelectMouseDrag(event) {
    if (dragTargetSegment) {
        dragTargetSegment.point = dragTargetSegment.point.add(event.delta);
    } else if (dragTargetHandle) {
        dragTargetHandle.x += event.delta.x;
        dragTargetHandle.y += event.delta.y;
    } else if (dragTarget) {
        dragTarget.position = dragTarget.position.add(event.delta);
    }
}

function handleDirectSelectMouseUp(event) {
    if (dragTargetSegment || dragTargetHandle || dragTarget) {
        saveState();
        dragTargetSegment = null;
        dragTargetHandle = null;
        dragTarget = null;
    }
}

// --- ARTBOARD TOOL (Shift+A) ---
let _artboardToolSelectedAb = null;
let _artboardDragStart      = null; // paper point where drag began
let _artboardDragOrigin     = null; // original TL of artboard being dragged

function handleArtboardToolMouseDown(event) {
    window._selectedArtboard = null;
    _artboardToolSelectedAb  = null;
    _artboardDragStart       = event.point;

    // Check secondary artboards first (non-isMain entries)
    if (window.multiArtboards && window.multiArtboards.length > 0) {
        for (const ab of window.multiArtboards) {
            if (ab.isMain) continue;
            const rect = ab.rect;
            if (rect && rect.isInserted() && rect.bounds.contains(event.point)) {
                window._selectedArtboard = ab;
                _artboardToolSelectedAb  = ab;
                _artboardDragOrigin      = rect.bounds.topLeft.clone();
                // Highlight selected
                artboardLayer.locked = false;
                ab.rect.strokeColor = '#f17c22';
                ab.rect.strokeWidth = 2;
                artboardLayer.locked = true;
                break;
            }
        }
        // Unhighlight others
        artboardLayer.locked = false;
        window.multiArtboards.forEach(ab => {
            if (ab !== window._selectedArtboard && !ab.isMain && ab.rect && ab.rect.isInserted()) {
                ab.rect.strokeColor = '#555555';
                ab.rect.strokeWidth = 1;
            }
        });
        artboardLayer.locked = true;
    }

    // Check main artboard (always selectable regardless of layer lock)
    if (!window._selectedArtboard) {
        // Try window.artboardRect first, then search artboardLayer for a rect named 'artboardRect'
        let mainRectToCheck = window.artboardRect;
        if (!mainRectToCheck || !mainRectToCheck.isInserted()) {
            // Search artboard layer for the main rect
            if (window.artboardLayer) {
                window.artboardLayer.children.forEach(child => {
                    if (child.name === 'artboardRect') mainRectToCheck = child;
                });
            }
        }
        if (mainRectToCheck && mainRectToCheck.isInserted()) {
            const abBounds = mainRectToCheck.bounds;
            // Expand hit area by 10px to make edge-clicking easier
            const expanded = abBounds.expand(10 / paper.view.zoom);
            if (expanded.contains(event.point)) {
                window._selectedArtboard = 'main';
                _artboardToolSelectedAb  = 'main';
                _artboardDragOrigin      = abBounds.topLeft.clone();
                // Highlight main artboard border
                artboardLayer.locked = false;
                mainRectToCheck.strokeColor = '#f17c22';
                mainRectToCheck.strokeWidth = 2;
                artboardLayer.locked = true;
                window.artboardRect = mainRectToCheck; // ensure reference is current
            }
        }
    }

    // Update label
    const lbl = document.getElementById('artboard-sel-name');
    if (lbl) {
        if (window._selectedArtboard === 'main') lbl.textContent = 'Main Artboard';
        else if (window._selectedArtboard) {
            const secondaries = window.multiArtboards ? window.multiArtboards.filter(a => !a.isMain) : [];
            const idx = secondaries.indexOf(window._selectedArtboard);
            lbl.textContent = 'Artboard ' + (idx + 2);
        } else {
            lbl.textContent = 'None';
            // Reset main artboard highlight
            if (window.artboardRect && window.artboardRect.isInserted()) {
                artboardLayer.locked = false;
                window.artboardRect.strokeColor = '#555555';
                window.artboardRect.strokeWidth = 1;
                artboardLayer.locked = true;
            }
        }
    }

    _syncArtboardInputsToSelected();

    // Collect all draw-layer items currently inside the selected artboard
    // so they can be moved together when dragging
    window._artboardDragItems = [];
    const sel = window._selectedArtboard;
    const selBounds = sel === 'main'
        ? (window.artboardRect ? window.artboardRect.bounds : null)
        : (window._selectedArtboard && window._selectedArtboard.rect ? window._selectedArtboard.rect.bounds : null);
    if (selBounds) {
        paper.project.layers.forEach(layer => {
            if (layer === artboardLayer) return;
            if (layer.name === 'System Artboard') return;
            layer.children.forEach(child => {
                try {
                    if (child.isInserted() && child.visible && child.bounds &&
                        selBounds.contains(child.bounds)) {
                        window._artboardDragItems.push(child);
                    }
                } catch(_) {}
            });
        });
    }

    paper.view.draw();
}

function handleArtboardToolMouseDrag(event) {
    const sel = window._selectedArtboard;
    if (!sel || !_artboardDragStart || !_artboardDragOrigin) return;

    const delta = event.point.subtract(_artboardDragStart);
    const newX  = _artboardDragOrigin.x + delta.x;
    const newY  = _artboardDragOrigin.y + delta.y;

    artboardLayer.locked = false;
    artboardLayer.activate();

    let dx = 0, dy = 0;

    if (sel === 'main') {
        const oldTL = window.artboardRect.bounds.topLeft;
        dx = newX - oldTL.x;
        dy = newY - oldTL.y;
        if (window.artboardShadow) window.artboardShadow.translate(dx, dy);
        if (window.artboardRect)   window.artboardRect.translate(dx, dy);
        if (window.gridGroup)      window.gridGroup.translate(dx, dy);
    } else if (sel.rect && sel.rect.isInserted()) {
        const oldTL = sel.rect.bounds.topLeft;
        dx = newX - oldTL.x;
        dy = newY - oldTL.y;
        if (sel.shadow && sel.shadow.isInserted()) sel.shadow.translate(dx, dy);
        sel.rect.translate(dx, dy);
        if (sel.grid && sel.grid.isInserted()) sel.grid.translate(dx, dy);
        sel.bounds = sel.rect.bounds;
    }

    artboardLayer.locked = true;

    // Move all draw-layer items that were inside this artboard at drag start
    if ((dx !== 0 || dy !== 0) && window._artboardDragItems) {
        window._artboardDragItems.forEach(item => {
            try {
                if (item.isInserted()) item.translate(dx, dy);
            } catch(_) {}
        });
    }

    const dl = window.drawLayer ||
        paper.project.layers.find(l => !l.locked && l.name !== 'System Artboard');
    if (dl) { dl.locked = false; dl.activate(); window.drawLayer = dl; }

    paper.view.draw();
}

function handleArtboardToolMouseUp(event) {
    if (window._selectedArtboard && _artboardDragStart) {
        _syncArtboardInputsToSelected();
        if (window.saveState) saveState();
    }
    _artboardDragStart  = null;
    _artboardDragOrigin = null;
}

// Sync W/H control-bar inputs to whichever artboard is currently selected
function _syncArtboardInputsToSelected() {
    const sel = window._selectedArtboard;
    if (!sel) return;

    let w, h;
    if (sel === 'main') {
        w = state.artboardWidth;
        h = state.artboardHeight;
    } else if (sel.rect && sel.rect.isInserted()) {
        w = sel.rect.bounds.width;
        h = sel.rect.bounds.height;
    } else { return; }

    const unit = state.artboardUnit || 'px';
    const ppi  = state.artboardResolution || 96;
    function toDisplay(px) {
        switch (unit) {
            case 'in': return +(px / ppi).toFixed(3);
            case 'cm': return +(px / (ppi / 2.54)).toFixed(2);
            case 'mm': return +(px / (ppi / 25.4)).toFixed(1);
            default:   return Math.round(px);
        }
    }
    const wIn = document.getElementById('artboard-w-input');
    const hIn = document.getElementById('artboard-h-input');
    if (wIn) wIn.value = toDisplay(w);
    if (hIn) hIn.value = toDisplay(h);
}

// --- PEN TOOL (P) ---
function handlePenMouseDown(event) {
    if (!activePath) {
        deselectAll();
        activePath = new paper.Path();
        setupShapeStyles(activePath);
        activePath.fullySelected = true;
        
        activePath.add(new paper.Segment(event.point));
        isDraggingPenHandle = true;
    } else {
        // Hit test to close path
        const hitResult = paper.project.hitTest(event.point, {
            segments: true,
            tolerance: 8
        });
        
        if (hitResult && hitResult.item === activePath && hitResult.segment === activePath.segments[0]) {
            activePath.closed = true;
            activePath.fullySelected = false;
            activePath.selected = true;
            finishActivePath();
        } else {
            activePath.add(new paper.Segment(event.point));
            activePath.fullySelected = true;
            isDraggingPenHandle = true;
        }
    }
}

function handlePenMouseDrag(event) {
    if (activePath && isDraggingPenHandle) {
        const lastSegment = activePath.lastSegment;
        const delta = event.point.subtract(lastSegment.point);
        lastSegment.handleOut = delta;
        lastSegment.handleIn = delta.multiply(-1);
    }
}

function handlePenMouseUp(event) {
    isDraggingPenHandle = false;
}

function finishActivePath() {
    if (activePath) {
        activePath.fullySelected = false;
        activePath.selected = true;
        saveState();
        activePath = null;
    }
}

// --- TYPE TOOL (T) ---
// fontSize in state/panel is in POINTS (user-facing).
// Paper.js renders fontSize in paper-pixels.
// Conversion: paperPx = pt * (PPI / 72)
function ptToPaperPx(pt) {
    const ppi = (state && state.artboardResolution) || 300;
    return pt * (ppi / 72);
}
function paperPxToPt(px) {
    const ppi = (state && state.artboardResolution) || 300;
    return px * (72 / ppi);
}

function handleTypeMouseDown(event) {
    deselectAll();

    // Always read fresh from the panel elements first, then fall back to state
    const fontFamilyEl = document.getElementById('ctrl-font-family');
    const fontSizeEl   = document.getElementById('ctrl-font-size');
    const fontWeightEl = document.getElementById('ctrl-font-weight');
    const fontStyleEl  = document.getElementById('ctrl-font-style');

    // Read pt value from panel (what the user sees)
    const fontFamily  = (fontFamilyEl && fontFamilyEl.value) ? fontFamilyEl.value : state.fontFamily;
    const fontSizePt  = fontSizeEl    ? (parseFloat(fontSizeEl.value)  || state.fontSize)  : state.fontSize;
    const fontWeight  = (fontWeightEl && fontWeightEl.value) ? fontWeightEl.value : state.fontWeight;
    const fontStyleVal= (fontStyleEl  && fontStyleEl.value)  ? fontStyleEl.value  : state.fontStyle;

    // Convert pt → paper-pixels for Paper.js
    const fontSizePx = ptToPaperPx(fontSizePt);

    // Update state with latest panel values
    state.fontFamily = fontFamily;
    state.fontSize   = fontSizePt;
    state.fontWeight = fontWeight;
    state.fontStyle  = fontStyleVal;

    const textVal = prompt("Enter text:", "iGuhit Vector");
    if (textVal) {
        if (window.drawLayer) window.drawLayer.activate();

        const textItem = new paper.PointText({
            point     : event.point,
            content   : textVal,
            fontSize  : fontSizePx,      // paper-pixels (correct scale)
            fontFamily: fontFamily,
            fontWeight: fontWeight,
            fontStyle : fontStyleVal,
            // Text color: use fill color from state, default black
            fillColor : state.fillColorNone ? '#000000' : (state.fillColor || '#000000')
        });

        // Don't call setupShapeStyles — it would clobber text fillColor with shape fill
        // and doesn't apply font settings anyway.
        textItem.opacity = state.opacity / 100;
        textItem.selected = true;

        saveState();
        onSelectionChanged();

        // Sync font panel to show the values of the new text item
        if (window.__syncTypeFontControls) window.__syncTypeFontControls(textItem);
    }
}

// --- LINE TOOL (\) ---
function handleLineMouseDown(event) {
    deselectAll();
    activePath = new paper.Path.Line({
        from: event.point,
        to: event.point
    });
    setupShapeStyles(activePath);
    activePath.selected = true;
}

function handleLineMouseDrag(event) {
    if (activePath) {
        activePath.remove();
        activePath = new paper.Path.Line({
            from: event.downPoint,
            to: event.point
        });
        setupShapeStyles(activePath);
        activePath.selected = true;
    }
}

function handleLineMouseUp(event) {
    if (activePath) {
        finishActivePath();
    }
}

function openShapeOptionsModal(type, point) {
    shapeClickType = type;
    shapeClickOrigin = point;
    lastSelectedModalUnit = state.artboardUnit;
    
    // Set Title
    document.getElementById('shape-modal-title').innerText = type === 'rect' ? 'Rectangle Options' : 'Ellipse Options';
    
    // Set Unit Dropdown
    const unitSelect = document.getElementById('shape-unit-select');
    unitSelect.value = state.artboardUnit;
    
    // Set default dimensions based on unit
    let defaultW = 100;
    let defaultH = 100;
    if (state.artboardUnit === 'in') {
        defaultW = 1.5;
        defaultH = 1.5;
    } else if (state.artboardUnit === 'cm') {
        defaultW = 4;
        defaultH = 4;
    } else if (state.artboardUnit === 'mm') {
        defaultW = 40;
        defaultH = 40;
    }
    
    const wInput = document.getElementById('shape-width-input');
    const hInput = document.getElementById('shape-height-input');
    wInput.value = defaultW;
    hInput.value = defaultH;
    
    // Set unit labels
    document.querySelectorAll('.shape-unit-label').forEach(el => el.innerText = state.artboardUnit);
    
    // Show Modal
    document.getElementById('shape-options-modal').classList.add('active');
    
    // Focus & select width input
    setTimeout(() => {
        wInput.focus();
        wInput.select();
    }, 50);
}

// --- RECTANGLE TOOL (M) ---
function handleRectMouseDown(event) {
    deselectAll();
    activePath = new paper.Path.Rectangle({
        point: event.point,
        size: [0, 0]
    });
    setupShapeStyles(activePath);
    activePath.selected = true;
}

function handleRectMouseDrag(event) {
    if (activePath) {
        activePath.remove();
        let rectWidth = event.point.x - event.downPoint.x;
        let rectHeight = event.point.y - event.downPoint.y;
        
        if (event.modifiers.shift) {
            const size = Math.max(Math.abs(rectWidth), Math.abs(rectHeight));
            rectWidth = rectWidth < 0 ? -size : size;
            rectHeight = rectHeight < 0 ? -size : size;
        }
        
        activePath = new paper.Path.Rectangle({
            point: event.downPoint,
            size: [rectWidth, rectHeight]
        });
        setupShapeStyles(activePath);
        activePath.selected = true;
    }
}

function handleRectMouseUp(event) {
    if (activePath) {
        const dragDist = event.point.subtract(event.downPoint).length;
        if (dragDist < 3) {
            activePath.remove();
            activePath = null;
            openShapeOptionsModal('rect', event.downPoint);
        } else {
            finishActivePath();
        }
    }
}

// --- ELLIPSE TOOL (L) ---
function handleEllipseMouseDown(event) {
    deselectAll();
    activePath = new paper.Path.Ellipse({
        point: event.point,
        size: [0, 0]
    });
    setupShapeStyles(activePath);
    activePath.selected = true;
}

function handleEllipseMouseDrag(event) {
    if (activePath) {
        activePath.remove();
        let rectWidth = event.point.x - event.downPoint.x;
        let rectHeight = event.point.y - event.downPoint.y;
        
        if (event.modifiers.shift) {
            const size = Math.max(Math.abs(rectWidth), Math.abs(rectHeight));
            rectWidth = rectWidth < 0 ? -size : size;
            rectHeight = rectHeight < 0 ? -size : size;
        }
        
        const rect = new paper.Rectangle(event.downPoint, new paper.Size(rectWidth, rectHeight));
        activePath = new paper.Path.Ellipse(rect);
        setupShapeStyles(activePath);
        activePath.selected = true;
    }
}

function handleEllipseMouseUp(event) {
    if (activePath) {
        const dragDist = event.point.subtract(event.downPoint).length;
        if (dragDist < 3) {
            activePath.remove();
            activePath = null;
            openShapeOptionsModal('ellipse', event.downPoint);
        } else {
            finishActivePath();
        }
    }
}

// --- PENCIL TOOL (B) ---
function handlePencilMouseDown(event) {
    deselectAll();
    activePath = new paper.Path();
    setupShapeStyles(activePath);
    activePath.selected = true;
    activePath.add(event.point);
}

function handlePencilMouseDrag(event) {
    if (activePath) {
        activePath.add(event.point);
    }
}

function handlePencilMouseUp(event) {
    if (activePath) {
        activePath.simplify(2.5);
        activePath.closed = true;
        
        const path = activePath;
        activePath = null; // Clear activePath to bypass standard finishActivePath
        
        path.selected = true;
        path.fullySelected = true;
        
        saveState();
        updateLayersUI();
        paper.view.draw();
    }
}

// --- ERASER TOOL (Shift+E) ---
let eraserPath = null; // dedicated eraser path reference to avoid activePath collision

function handleEraserMouseDown(event) {
    eraserPath = new paper.Path({
        strokeColor: '#777777',
        strokeWidth: 20,
        strokeCap: 'round',
        opacity: 0.5
    });
    eraserPath.add(event.point);
}

function handleEraserMouseDrag(event) {
    if (eraserPath) {
        eraserPath.add(event.point);
    }
}

function handleEraserMouseUp(event) {
    if (!eraserPath) return;
    
    const eraserStroke = eraserPath;
    eraserPath = null;
    eraserStroke.remove();
    
    const drawItems = [...paper.project.activeLayer.children];
    let changed = false;
    
    drawItems.forEach(item => {
        if (!item || !item.isInserted()) return;
        if (item.layer && item.layer.name === 'System Artboard') return;
        
        if (item.bounds && eraserStroke.bounds && item.bounds.intersects(eraserStroke.bounds)) {
            if (item instanceof paper.Path && (item.closed || item.fillColor)) {
                try {
                    const pathOutline = item.subtract(eraserStroke);
                    if (pathOutline && Math.abs((pathOutline.area || 0) - (item.area || 0)) > 1) {
                        item.replaceWith(pathOutline);
                        pathOutline.selected = true;
                        changed = true;
                    }
                } catch(err) {
                    try {
                        if (item.isInserted() && eraserStroke.contains(item.position)) {
                            item.remove();
                            changed = true;
                        }
                    } catch(e2) {}
                }
            } else if (item instanceof paper.Path) {
                try {
                    const intersections = item.getIntersections(eraserStroke);
                    if (intersections.length > 0) {
                        item.remove();
                        changed = true;
                    }
                } catch(e) {}
            } else if (item instanceof paper.PointText) {
                item.remove();
                changed = true;
            }
        }
    });
    
    if (changed) {
        saveState();
    } else {
        onSelectionChanged();
    }
    paper.view.draw();
}

// --- HAND TOOL / PAN (H) ---
function handleHandMouseDown(event) {}

function handleHandMouseDrag(event) {
    const delta = event.point.subtract(event.downPoint);
    paper.view.center = paper.view.center.subtract(delta);
}

function handleHandMouseUp(event) {}

// --- ZOOM TOOL (Z) ---
let zoomStartClientX = 0;
let zoomStartClientY = 0;
let zoomStartLevel = 1;
let zoomStartPoint = null;
let zoomHasDragged = false;

function handleZoomMouseDown(event) {
    applyVirtualModifiers(event);
    
    // Store initial positions in screen/DOM coordinates
    zoomStartClientX = event.event ? event.event.clientX : event.point.x;
    zoomStartClientY = event.event ? event.event.clientY : event.point.y;
    zoomStartLevel = state.zoomLevel;
    zoomStartPoint = event.downPoint;
    zoomHasDragged = false;
}

function handleZoomMouseDrag(event) {
    applyVirtualModifiers(event);
    if (!zoomStartPoint) return;
    
    const clientX = event.event ? event.event.clientX : event.point.x;
    const clientY = event.event ? event.event.clientY : event.point.y;
    
    const dx = clientX - zoomStartClientX;
    const dy = clientY - zoomStartClientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 3) {
        zoomHasDragged = true;
    }
    
    if (zoomHasDragged) {
        // Dragging right zooms in, dragging left zooms out
        const delta = dx; 
        
        // Exponential zoom: 150px drag to double/halve zoom level
        const zoomFactor = Math.pow(2, delta / 150);
        const newZoom = zoomStartLevel * zoomFactor;
        
        setZoomLevel(newZoom, zoomStartPoint);
        paper.view.draw();
    }
}

function handleZoomMouseUp(event) {
    applyVirtualModifiers(event);
    
    // If it was just a click without dragging, perform a standard step zoom
    if (!zoomHasDragged) {
        let factor = 1.3;
        if (event.modifiers.alt) {
            factor = 1 / 1.3;
        }
        const newZoom = state.zoomLevel * factor;
        setZoomLevel(newZoom, event.point);
    }
    
    // Reset state tracking
    zoomStartPoint = null;
    zoomHasDragged = false;
}

// --- ROTATE TOOL (R) ---
let rotatePivot = null;
function handleRotateMouseDown(event) {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 0) {
        let totalBounds = null;
        selection.forEach(item => {
            if (!totalBounds) totalBounds = item.bounds.clone();
            else totalBounds = totalBounds.unite(item.bounds);
        });
        rotatePivot = totalBounds.center;
    }
}

function handleRotateMouseDrag(event) {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 0 && rotatePivot) {
        const prevVector = event.lastPoint.subtract(rotatePivot);
        const currVector = event.point.subtract(rotatePivot);
        const angle = currVector.angle - prevVector.angle;
        
        selection.forEach(item => {
            item.rotate(angle, rotatePivot);
        });
        updateSelectionVisualState();
    }
}

function handleRotateMouseUp(event) {
    if (rotatePivot) {
        saveState();
        rotatePivot = null;
    }
}

// -------------------------------------------------------------
// HELPER FUNCTIONS & STYLING APPLICATION
// -------------------------------------------------------------

function deselectAll() {
    paper.project.selectedItems.forEach(item => {
        item.selected = false;
        item.fullySelected = false;
    });
    onSelectionChanged();
}

let selectionBoxPath = null;
let selectionHandlePaths = [];

function clearSelectionVisuals() {
    if (selectionBoxPath) {
        selectionBoxPath.remove();
        selectionBoxPath = null;
    }
    selectionHandlePaths.forEach(h => h.remove());
    selectionHandlePaths = [];
}

function updateSelectionVisualState() {
    clearSelectionVisuals();
    
    const selected = getSelectedDrawItems();
    const isDirectSelect = (state.activeToolName === 'direct-select');
    
    selected.forEach(item => {
        if (isDirectSelect) {
            item.fullySelected = true;
        } else {
            item.fullySelected = false;
            item.selected = true;
        }
    });

    if (state.activeToolName === 'select' && selected.length > 0) {
        const bounds = getSelectionBounds();
        if (bounds) {
            const prevActiveLayer = paper.project.activeLayer;
            if (artboardLayer) {
                artboardLayer.activate();
                
                selectionBoxPath = new paper.Path.Rectangle({
                    rectangle: bounds,
                    strokeColor: '#00a8ff',
                    strokeWidth: 1.2 / paper.view.zoom,
                    fillColor: null,
                    insert: true
                });
                selectionBoxPath.locked = true;
                selectionBoxPath.data = { isSelectionHelper: true };
                
                const handles = getSelectionHandles(bounds);
                const handleSize = 6 / paper.view.zoom;
                for (const [name, point] of Object.entries(handles)) {
                    const handlePath = new paper.Path.Rectangle({
                        center: point,
                        size: [handleSize, handleSize],
                        fillColor: '#ffffff',
                        strokeColor: '#00a8ff',
                        strokeWidth: 1.2 / paper.view.zoom,
                        insert: true
                    });
                    handlePath.locked = true;
                    handlePath.data = { isSelectionHelper: true };
                    selectionHandlePaths.push(handlePath);
                }
            }
            if (prevActiveLayer) {
                prevActiveLayer.activate();
            }
        }
    }
}

function onSelectionChanged() {
    updateSelectionVisualState();
    updateSelectionInfo();
    syncPropertiesFromSelection();
    updateLayersUI();
    syncArtboardInputs();
}

function convertPixelsToUnit(pixels, unit, ppi) {
    switch (unit) {
        case 'in':
            return parseFloat((pixels / ppi).toFixed(2));
        case 'cm':
            return parseFloat((pixels / (ppi / 2.54)).toFixed(2));
        case 'mm':
            return parseFloat((pixels / (ppi / 25.4)).toFixed(1));
        default: // 'px'
            return Math.round(pixels);
    }
}

function convertUnitToPixels(value, unit, ppi) {
    switch (unit) {
        case 'in':
            return Math.round(value * ppi);
        case 'cm':
            return Math.round(value * (ppi / 2.54));
        case 'mm':
            return Math.round(value * (ppi / 25.4));
        default: // 'px'
            return Math.round(value);
    }
}

function syncArtboardInputs() {
    const wInput = document.getElementById('artboard-w-input');
    const hInput = document.getElementById('artboard-h-input');
    const unitSelect = document.getElementById('artboard-unit-select');
    const resInput = document.getElementById('artboard-res-input');
    
    if (unitSelect) unitSelect.value = state.artboardUnit;
    if (resInput) resInput.value = state.artboardResolution;
    
    if (wInput) {
        wInput.value = convertPixelsToUnit(state.artboardWidth, state.artboardUnit, state.artboardResolution);
    }
    if (hInput) {
        hInput.value = convertPixelsToUnit(state.artboardHeight, state.artboardUnit, state.artboardResolution);
    }
}

function updateArtboardSize(width, height) {
    if (isNaN(width) || width <= 10 || isNaN(height) || height <= 10) return;
    
    state.artboardWidth = width;
    state.artboardHeight = height;
    
    if (artboardLayer) {
        artboardLayer.locked = false;
        artboardLayer.activate();
        
        artboardLayer.data.artboardUnit = state.artboardUnit;
        artboardLayer.data.artboardResolution = state.artboardResolution;
        
        if (artboardShadow) artboardShadow.remove();
        if (artboardRect) artboardRect.remove();
        if (gridGroup) gridGroup.remove();
        
        artboardShadow = new paper.Path.Rectangle({
            point: [204, 154],
            size: [state.artboardWidth, state.artboardHeight],
            fillColor: '#121212',
            opacity: 0.4
        });
        artboardShadow.name = 'artboardShadow';
        
        artboardRect = new paper.Path.Rectangle({
            point: [200, 150],
            size: [state.artboardWidth, state.artboardHeight],
            fillColor: state.artboardBgColor || '#ffffff',
            strokeColor: '#555555',
            strokeWidth: 1
        });
        artboardRect.name = 'artboardRect';
        
        gridGroup = new paper.Group();
        gridGroup.name = 'gridGroup';
        
        const gridSpacing = 50;
        
        for (let x = 200 + gridSpacing; x < 200 + state.artboardWidth; x += gridSpacing) {
            let line = new paper.Path.Line({
                from: [x, 150],
                to: [x, 150 + state.artboardHeight],
                strokeColor: '#f0f0f0',
                strokeWidth: 1
            });
            gridGroup.addChild(line);
        }
        for (let y = 150 + gridSpacing; y < 150 + state.artboardHeight; y += gridSpacing) {
            let line = new paper.Path.Line({
                from: [200, y],
                to: [200 + state.artboardWidth, y],
                strokeColor: '#f0f0f0',
                strokeWidth: 1
            });
            gridGroup.addChild(line);
        }
        
        artboardLayer.addChild(artboardShadow);
        artboardLayer.addChild(artboardRect);
        artboardLayer.addChild(gridGroup);
        
        // Sync window references so PDF export and artboard tool always see the current rect
        window.artboardRect   = artboardRect;
        window.artboardShadow = artboardShadow;
        window.gridGroup      = gridGroup;

        // Update isMain entry in multiArtboards if present
        if (window.multiArtboards) {
            const mainEntry = window.multiArtboards.find(a => a.isMain);
            if (mainEntry) {
                mainEntry.rect   = artboardRect;
                mainEntry.shadow = artboardShadow;
                mainEntry.grid   = gridGroup;
            }
        }

        artboardLayer.locked = true;
        
        if (drawLayer) drawLayer.activate();
        
        paper.view.draw();
        saveState();
    }
}

// Resize a secondary (multi) artboard selected with the Artboard Tool
function resizeSelectedSecondaryArtboard(newW, newH) {
    const ab = window._selectedArtboard;
    if (!ab || !ab.rect || !ab.rect.isInserted()) return;

    const oldBounds = ab.rect.bounds;
    const w = (newW !== null && newW > 0) ? newW : oldBounds.width;
    const h = (newH !== null && newH > 0) ? newH : oldBounds.height;
    const ox = oldBounds.x;
    const oy = oldBounds.y;

    // Unlock artboard layer temporarily so we can add/remove items from it
    const wasLocked = window.artboardLayer ? window.artboardLayer.locked : false;
    if (window.artboardLayer) {
        window.artboardLayer.locked = false;
        window.artboardLayer.activate();
    }

    // Remove old visual parts cleanly
    try { if (ab.shadow && ab.shadow.isInserted()) ab.shadow.remove(); } catch (_) {}
    try { if (ab.rect   && ab.rect.isInserted())   ab.rect.remove();   } catch (_) {}
    try { if (ab.grid   && ab.grid.isInserted())   ab.grid.remove();   } catch (_) {}
    try { if (ab.label  && ab.label.isInserted())  ab.label.remove();  } catch (_) {}

    // Rebuild artboard at same top-left origin, new size
    const shadow = new paper.Path.Rectangle({
        point: [ox + 4, oy + 4],
        size: [w, h],
        fillColor: '#121212',
        opacity: 0.4
    });
    const rect = new paper.Path.Rectangle({
        point: [ox, oy],
        size: [w, h],
        fillColor: '#ffffff',
        strokeColor: '#555555',
        strokeWidth: 1
    });
    rect.name = 'artboardRect';

    // Rebuild grid lines
    const grid = new paper.Group();
    const gs = 50;
    for (let x = ox + gs; x < ox + w; x += gs) {
        grid.addChild(new paper.Path.Line({
            from: [x, oy], to: [x, oy + h],
            strokeColor: '#f0f0f0', strokeWidth: 0.5
        }));
    }
    for (let y = oy + gs; y < oy + h; y += gs) {
        grid.addChild(new paper.Path.Line({
            from: [ox, y], to: [ox + w, y],
            strokeColor: '#f0f0f0', strokeWidth: 0.5
        }));
    }

    // Update the tracked artboard object
    ab.shadow = shadow;
    ab.rect   = rect;
    ab.grid   = grid;
    ab.bounds = rect.bounds;

    // Lock artboard layer again and restore draw layer as active
    if (window.artboardLayer) window.artboardLayer.locked = true;
    const dl = window.drawLayer ||
        paper.project.layers.find(l => !l.locked && l.name !== 'System Artboard');
    if (dl) { dl.locked = false; dl.activate(); window.drawLayer = dl; }

    // Sync inputs to new size
    _syncArtboardInputsToSelected();

    paper.view.draw();
    autoSaveProject();
}

function setupShapeStyles(path) {
    if (state.fillColorNone) {
        path.fillColor = null;
    } else {
        path.fillColor = state.fillColor;
    }
    
    if (state.strokeColorNone || state.strokeWidth <= 0) {
        path.strokeColor = null;
    } else {
        path.strokeColor = state.strokeColor;
        path.strokeWidth = state.strokeWidth;
    }
    
    path.opacity = state.opacity / 100;
}

function applyStylesToSelection() {
    const selected = getSelectedDrawItems();
    if (selected.length === 0) return;
    
    selected.forEach(item => {
        if (state.fillColorNone) {
            item.fillColor = null;
        } else {
            item.fillColor = state.fillColor;
        }
        
        if (state.strokeColorNone || state.strokeWidth <= 0) {
            item.strokeColor = null;
        } else {
            item.strokeColor = state.strokeColor;
            item.strokeWidth = state.strokeWidth;
        }
        
        item.opacity = state.opacity / 100;
    });
    
    paper.view.draw();
    saveState();
}

function getSelectedDrawItems() {
    return paper.project.selectedItems.filter(item => {
        return item.layer.name !== 'System Artboard';
    });
}

function getTopLevelSelectedDrawItems() {
    const selection = getSelectedDrawItems();
    return selection.filter(item => {
        let parent = item.parent;
        while (parent) {
            if (selection.includes(parent)) {
                return false;
            }
            parent = parent.parent;
        }
        return true;
    });
}

function syncPropertiesFromSelection() {
    const selection = getSelectedDrawItems();
    if (selection.length === 0) return;
    
    const item = selection[0];
    
    if (item.fillColor) {
        state.fillColor = item.fillColor.toCSS(true);
        state.fillColorNone = false;
        document.getElementById('fill-color').value = state.fillColor;
        document.getElementById('toolbar-fill-indicator').style.backgroundColor = state.fillColor;
        document.getElementById('toolbar-fill-indicator').classList.remove('none');
        document.getElementById('btn-fill-none').classList.remove('active');
    } else {
        state.fillColorNone = true;
        document.getElementById('toolbar-fill-indicator').classList.add('none');
        document.getElementById('btn-fill-none').classList.add('active');
    }
    
    if (item.strokeColor) {
        state.strokeColor = item.strokeColor.toCSS(true);
        state.strokeColorNone = false;
        document.getElementById('stroke-color').value = state.strokeColor;
        document.getElementById('toolbar-stroke-indicator').style.borderColor = state.strokeColor;
        document.getElementById('toolbar-stroke-indicator').classList.remove('none');
        document.getElementById('btn-stroke-none').classList.remove('active');
    } else {
        state.strokeColorNone = true;
        document.getElementById('toolbar-stroke-indicator').classList.add('none');
        document.getElementById('btn-stroke-none').classList.add('active');
    }
    
    if (item.strokeWidth) {
        state.strokeWidth = item.strokeWidth;
        document.getElementById('stroke-width').value = Math.round(item.strokeWidth);
    }
    
    if (item.opacity !== undefined) {
        state.opacity = Math.round(item.opacity * 100);
        document.getElementById('opacity-slider').value = state.opacity;
        document.getElementById('opacity-val').innerText = `${state.opacity}%`;
    }
    
    document.getElementById('prop-transform-x').value = Math.round(item.bounds.x);
    document.getElementById('prop-transform-y').value = Math.round(item.bounds.y);
    document.getElementById('prop-transform-w').value = Math.round(item.bounds.width);
    document.getElementById('prop-transform-h').value = Math.round(item.bounds.height);
    
    if (item.strokeCap) {
        document.getElementById('prop-stroke-cap').value = item.strokeCap;
    }
    if (item.strokeJoin) {
        document.getElementById('prop-stroke-join').value = item.strokeJoin;
    }
    if (item.dashArray && item.dashArray.length > 0) {
        const styleEl = document.getElementById('stroke-style');
        if (styleEl) styleEl.value = 'dashed';
    } else {
        const styleEl = document.getElementById('stroke-style');
        if (styleEl) styleEl.value = 'solid';
    }

    if (item.data) {
        const startEl = document.getElementById('stroke-arrow-start');
        const endEl   = document.getElementById('stroke-arrow-end');
        if (startEl) startEl.value = item.data.arrowStart || 'none';
        if (endEl)   endEl.value   = item.data.arrowEnd   || 'none';
    }

    if (item.dashArray) {
        document.getElementById('prop-dash-array').value = item.dashArray.join(', ');
    } else {
        document.getElementById('prop-dash-array').value = '';
    }
    
    // Sync font controls for PointText items
    if (item instanceof paper.PointText && window.__syncTypeFontControls) {
        window.__syncTypeFontControls(item);
    }
}

// -------------------------------------------------------------
// ZOOM & PANNING MECHANICS
// -------------------------------------------------------------
function setZoomLevel(level, centerPoint = paper.view.center) {
    const clampedZoom = Math.min(state.maxZoom, Math.max(state.minZoom, level));
    state.zoomLevel = clampedZoom;
    
    const view = paper.view;
    const beta = view.zoom;
    view.zoom = clampedZoom;
    
    const offset = centerPoint.subtract(view.center);
    const newCenter = centerPoint.subtract(offset.multiply(beta / clampedZoom));
    view.center = newCenter;
    
    const zoomPct = Math.round(clampedZoom * 100);
    document.getElementById('zoom-percentage-input').value = `${zoomPct}%`;
    document.querySelector('.doc-tab-title').innerText = `Untitled-1 @ ${zoomPct}% (RGB/Preview)`;
    updateSelectionVisualState();
}

function fitArtboardToScreen() {
    const view = paper.view;
    const viewWidth = view.element.clientWidth;
    const viewHeight = view.element.clientHeight;
    
    view.center = new paper.Point(200 + state.artboardWidth / 2, 150 + state.artboardHeight / 2);
    
    const scaleX = (viewWidth - 100) / state.artboardWidth;
    const scaleY = (viewHeight - 100) / state.artboardHeight;
    const fitZoom = Math.min(scaleX, scaleY, 1.5);
    
    setZoomLevel(fitZoom);
}

// -------------------------------------------------------------
// SELECTION INFO BAR & UI INDICATORS
// -------------------------------------------------------------
function updateSelectionInfo() {
    const selected = getSelectedDrawItems();
    const info = document.getElementById('selection-info');
    
    if (selected.length === 0) {
        info.innerText = "No Selection";
        return;
    }
    
    if (selected.length === 1) {
        const item = selected[0];
        let name = "Item";
        if (item instanceof paper.Path) {
            name = item.closed ? "Path (Closed)" : "Path (Open)";
            if (item.className === 'Rectangle') name = "Rectangle";
            else if (item.className === 'Ellipse') name = "Ellipse";
        } else if (item instanceof paper.PointText) {
            name = "Text Label";
        } else if (item instanceof paper.Group) {
            name = "Group";
        }
        info.innerText = `${name} Selected`;
    } else {
        info.innerText = `${selected.length} Objects Selected`;
    }
}

// -------------------------------------------------------------
// UNDO & REDO CORE (JSON-BASED STATE STACK)
// -------------------------------------------------------------
function saveState() {
    // Clear future Redo history on new action
    state.redoStack = [];
    
    clearSelectionVisuals();
    
    // Export entire project to JSON string
    const jsonString = paper.project.exportJSON();
    state.undoStack.push(jsonString);
    
    if (state.undoStack.length > state.maxHistory) {
        state.undoStack.shift();
    }
    
    onSelectionChanged();
}

function undo() {
    if (state.undoStack.length <= 1) return;
    
    const current = state.undoStack.pop();
    state.redoStack.push(current);
    
    const prevState = state.undoStack[state.undoStack.length - 1];
    loadStateString(prevState);
}

function redo() {
    if (state.redoStack.length === 0) return;
    
    const nextState = state.redoStack.pop();
    state.undoStack.push(nextState);
    loadStateString(nextState);
}

function loadStateString(jsonString) {
    // Clear project
    paper.project.clear();
    
    // Import project
    paper.project.importJSON(jsonString);
    
    // Re-resolve System Artboard variables
    artboardLayer = paper.project.layers.find(l => l.name === 'System Artboard');
    if (artboardLayer) {
        artboardRect = artboardLayer.children['artboardRect'];
        artboardShadow = artboardLayer.children['artboardShadow'];
        gridGroup = artboardLayer.children['gridGroup'];
        
        if (artboardRect) {
            state.artboardWidth = Math.round(artboardRect.bounds.width);
            state.artboardHeight = Math.round(artboardRect.bounds.height);
        }
        
        if (artboardLayer.data) {
            if (artboardLayer.data.artboardUnit) {
                state.artboardUnit = artboardLayer.data.artboardUnit;
            }
            if (artboardLayer.data.artboardResolution) {
                state.artboardResolution = artboardLayer.data.artboardResolution;
            }
        }

        // ── Enforce correct PPI ──────────────────────────────
        // If restored state has wrong PPI (e.g. old 96ppi save),
        // recalculate from actual artboard pixel dimensions.
        // Standard: 8.5in × 11in at 300ppi = 2550 × 3300px
        //           8.5in × 11in at 96ppi  =  816 × 1056px
        if (state.artboardUnit === 'in' || !state.artboardUnit) {
            const w = state.artboardWidth, h = state.artboardHeight;
            // Detect 300ppi letter
            if (Math.abs(w - 2550) < 10 && Math.abs(h - 3300) < 10) {
                state.artboardResolution = 300; state.artboardUnit = 'in';
            }
            // Detect 96ppi letter — upgrade to 300ppi record
            else if (Math.abs(w - 816) < 10 && Math.abs(h - 1056) < 10) {
                state.artboardResolution = 96; state.artboardUnit = 'in';
            }
            // Generic: if ppi stored is clearly wrong (e.g. 0 or 1), use 300
            else if (!state.artboardResolution || state.artboardResolution < 10) {
                state.artboardResolution = 300;
            }
        }
        // Always ensure artboardUnit is set
        if (!state.artboardUnit) state.artboardUnit = 'in';
    }

    // ── Re-sync window globals so PDF export always finds the artboard ──
    window.artboardLayer  = artboardLayer;
    window.artboardRect   = artboardRect;
    window.artboardShadow = artboardShadow;

    // Re-resolve multiArtboards references after importJSON
    if (window.multiArtboards && window.multiArtboards.length > 0) {
        // After importJSON, Paper.js creates new item instances.
        // Re-scan all layers to find secondary artboard rects by name pattern.
        const newAbs = [];
        paper.project.layers.forEach(layer => {
            if (layer.name !== 'System Artboard') return;
            layer.children.forEach(child => {
                if (child.name && child.name.startsWith('artboardRect-')) {
                    // Secondary artboard rect
                    const idx = parseInt(child.name.replace('artboardRect-','')) - 1;
                    if (!isNaN(idx) && window.multiArtboards[idx]) {
                        window.multiArtboards[idx].rect = child;
                    }
                }
            });
        });
    }

    // Re-resolve drawing layer
    const drawingLayers = paper.project.layers.filter(l => l.name !== 'System Artboard');
    if (drawingLayers.length === 0) {
        drawLayer = new paper.Layer();
        drawLayer.name = 'Layer 1';
        drawLayer.activate();
    } else {
        // Active layer is restored by importJSON, make sure it is valid
        drawLayer = paper.project.activeLayer;
        if (drawLayer.name === 'System Artboard') {
            drawLayer = drawingLayers[drawingLayers.length - 1];
            drawLayer.activate();
        }
    }
    
    updateLayersUI();
    deselectAll();
    paper.view.draw();
}

// -------------------------------------------------------------
// EVENT LISTENERS FOR CONTROLS & SIDE PANEL SWITCHES
// -------------------------------------------------------------
function setupUIEventListeners() {
    // --- Toolbar Tool Buttons Click ---
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (state.activeToolName === 'pen' && activePath) {
                finishActivePath();
            }
            
            state.activeToolName = btn.dataset.tool;
            
            // Show gradient tool panel when gradient tool selected, hide otherwise
            if (btn.dataset.tool === 'gradient') {
                if (window.showGradientToolPanel) showGradientToolPanel();
            } else {
                if (window.hideGradientToolPanel) hideGradientToolPanel();
            }

            let toolNiceName = btn.title.split(' (')[0];
            document.getElementById('active-tool-indicator').innerHTML = `${btn.innerHTML} ${toolNiceName}`;
            
            updateSelectionVisualState();
            paper.view.draw();
        });
    });

    // --- Fill & Stroke color picker selectors ---
    document.getElementById('fill-color').addEventListener('input', (e) => {
        state.fillColor = e.target.value;
        state.fillColorNone = false;
        document.getElementById('toolbar-fill-indicator').style.backgroundColor = e.target.value;
        document.getElementById('toolbar-fill-indicator').classList.remove('none');
        document.getElementById('btn-fill-none').classList.remove('active');
        applyStylesToSelection();
    });

    document.getElementById('stroke-color').addEventListener('input', (e) => {
        state.strokeColor = e.target.value;
        state.strokeColorNone = false;
        document.getElementById('toolbar-stroke-indicator').style.borderColor = e.target.value;
        document.getElementById('toolbar-stroke-indicator').classList.remove('none');
        document.getElementById('btn-stroke-none').classList.remove('active');
        applyStylesToSelection();
    });

    document.getElementById('stroke-width').addEventListener('input', (e) => {
        state.strokeWidth = parseFloat(e.target.value) || 0;
        applyStylesToSelection();
    });

    // --- No Fill / No Stroke toggles ---
    document.getElementById('btn-fill-none').addEventListener('click', () => {
        state.fillColorNone = !state.fillColorNone;
        const fillInd = document.getElementById('toolbar-fill-indicator');
        const fillBtn = document.getElementById('btn-fill-none');
        
        if (state.fillColorNone) {
            fillInd.classList.add('none');
            fillBtn.classList.add('active');
        } else {
            fillInd.classList.remove('none');
            fillBtn.classList.remove('active');
        }
        applyStylesToSelection();
    });

    document.getElementById('btn-stroke-none').addEventListener('click', () => {
        state.strokeColorNone = !state.strokeColorNone;
        const strokeInd = document.getElementById('toolbar-stroke-indicator');
        const strokeBtn = document.getElementById('btn-stroke-none');
        
        if (state.strokeColorNone) {
            strokeInd.classList.add('none');
            strokeBtn.classList.add('active');
        } else {
            strokeInd.classList.remove('none');
            strokeBtn.classList.remove('active');
        }
        applyStylesToSelection();
    });

    // --- Opacity slider ---
    document.getElementById('opacity-slider').addEventListener('input', (e) => {
        state.opacity = parseInt(e.target.value);
        document.getElementById('opacity-val').innerText = `${state.opacity}%`;
        // Only change opacity — do NOT call applyStylesToSelection() which
        // would overwrite gradient fills with the plain state.fillColor
        const items = getSelectedDrawItems();
        items.forEach(item => {
            item.opacity = state.opacity / 100;
        });
        paper.view.draw();
        saveState();
    });

    // --- Toolbar color target selection ---
    document.getElementById('toolbar-fill-indicator').addEventListener('click', () => {
        state.activeColorTarget = 'fill';
        document.getElementById('toolbar-fill-indicator').classList.add('active');
        document.getElementById('toolbar-stroke-indicator').classList.remove('active');
    });
    
    document.getElementById('toolbar-fill-indicator').addEventListener('dblclick', () => {
        document.getElementById('fill-color').click();
    });

    document.getElementById('toolbar-stroke-indicator').addEventListener('click', () => {
        state.activeColorTarget = 'stroke';
        document.getElementById('toolbar-stroke-indicator').classList.add('active');
        document.getElementById('toolbar-fill-indicator').classList.remove('active');
    });
    
    document.getElementById('toolbar-stroke-indicator').addEventListener('dblclick', () => {
        document.getElementById('stroke-color').click();
    });

    // --- Swap / Default buttons ---
    document.getElementById('btn-swap-colors').addEventListener('click', swapFillAndStrokeColors);
    document.getElementById('btn-default-colors').addEventListener('click', resetDefaultColors);

    // --- Zoom In/Out Status Bar controls ---
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        setZoomLevel(state.zoomLevel * 1.25);
    });
    
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        setZoomLevel(state.zoomLevel / 1.25);
    });
    
    document.getElementById('zoom-percentage-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
                setZoomLevel(val / 100);
            }
        }
    });

    // --- Artboard Width & Height & Resolution & Unit controls ---
    document.getElementById('artboard-unit-select').addEventListener('change', (e) => {
        state.artboardUnit = e.target.value;
        syncArtboardInputs();
    });

    const handleArtboardResChange = (newRes) => {
        if (isNaN(newRes) || newRes <= 0) {
            syncArtboardInputs();
            return;
        }
        
        const oldRes = state.artboardResolution;
        if (oldRes === newRes) return;
        
        if (state.artboardUnit !== 'px') {
            const wPhysical = convertPixelsToUnit(state.artboardWidth, state.artboardUnit, oldRes);
            const hPhysical = convertPixelsToUnit(state.artboardHeight, state.artboardUnit, oldRes);
            
            const newWPixels = convertUnitToPixels(wPhysical, state.artboardUnit, newRes);
            const newHPixels = convertUnitToPixels(hPhysical, state.artboardUnit, newRes);
            
            state.artboardResolution = newRes;
            updateArtboardSize(newWPixels, newHPixels);
        } else {
            state.artboardResolution = newRes;
            saveState();
        }
    };

    document.getElementById('artboard-res-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = parseInt(e.target.value);
            handleArtboardResChange(val);
            e.target.blur();
        }
    });
    document.getElementById('artboard-res-input').addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        handleArtboardResChange(val);
    });

    const handleArtboardWChange = (val) => {
        if (isNaN(val) || val <= 0) { syncArtboardInputs(); return; }
        const newWPixels = convertUnitToPixels(val, state.artboardUnit, state.artboardResolution);
        const sel = window._selectedArtboard;
        if (state.activeToolName === 'artboard' && sel) {
            if (sel === 'main') {
                // Resize the main artboard
                updateArtboardSize(newWPixels, state.artboardHeight);
            } else if (sel.rect && !sel.isMain) {
                // Resize only the selected secondary artboard
                resizeSelectedSecondaryArtboard(newWPixels, null);
            } else {
                // isMain entry = main artboard reference
                updateArtboardSize(newWPixels, state.artboardHeight);
            }
        } else {
            if (newWPixels !== state.artboardWidth) updateArtboardSize(newWPixels, state.artboardHeight);
        }
    };

    document.getElementById('artboard-w-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const val = parseFloat(e.target.value); handleArtboardWChange(val); e.target.blur(); }
    });
    document.getElementById('artboard-w-input').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value); handleArtboardWChange(val);
    });

    const handleArtboardHChange = (val) => {
        if (isNaN(val) || val <= 0) { syncArtboardInputs(); return; }
        const newHPixels = convertUnitToPixels(val, state.artboardUnit, state.artboardResolution);
        const sel = window._selectedArtboard;
        if (state.activeToolName === 'artboard' && sel) {
            if (sel === 'main') {
                // Resize the main artboard
                updateArtboardSize(state.artboardWidth, newHPixels);
            } else if (sel.rect && !sel.isMain) {
                // Resize only the selected secondary artboard
                resizeSelectedSecondaryArtboard(null, newHPixels);
            } else {
                // isMain entry = main artboard reference
                updateArtboardSize(state.artboardWidth, newHPixels);
            }
        } else {
            if (newHPixels !== state.artboardHeight) updateArtboardSize(state.artboardWidth, newHPixels);
        }
    };

    document.getElementById('artboard-h-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const val = parseFloat(e.target.value); handleArtboardHChange(val); e.target.blur(); }
    });
    document.getElementById('artboard-h-input').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value); handleArtboardHChange(val);
    });

    // --- Menu File actions ---
    document.getElementById('btn-new').addEventListener('click', () => {
        if (confirm("Create a new document? All unsaved work will be cleared.")) {
            const drawLayers = paper.project.layers.filter(l => l.name !== 'System Artboard');
            drawLayers.forEach(l => l.remove());
            
            drawLayer = new paper.Layer();
            drawLayer.name = 'Layer 1';
            drawLayer.activate();
            
            fitArtboardToScreen();
            
            state.undoStack = [];
            state.redoStack = [];
            saveState();
            updateLayersUI();
            deselectAll();
            paper.view.draw();
        }
    });

    document.getElementById('btn-import-svg').addEventListener('click', () => {
        document.getElementById('svg-file-input').click();
    });

    document.getElementById('svg-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                
                // Parse SVG to extract dimensions
                let svgWidth = 800;
                let svgHeight = 600;
                try {
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(text, 'image/svg+xml');
                    const svgElement = svgDoc.documentElement;
                    const viewBox = svgElement.getAttribute('viewBox');
                    
                    if (viewBox) {
                        const parts = viewBox.split(/[ ,]+/);
                        if (parts.length === 4) {
                            svgWidth = parseFloat(parts[2]);
                            svgHeight = parseFloat(parts[3]);
                        }
                    }
                    const widthAttr = svgElement.getAttribute('width');
                    const heightAttr = svgElement.getAttribute('height');
                    if (widthAttr && !widthAttr.includes('%')) {
                        svgWidth = parseFloat(widthAttr);
                    }
                    if (heightAttr && !heightAttr.includes('%')) {
                        svgHeight = parseFloat(heightAttr);
                    }
                } catch (err) {
                    console.error("Error parsing SVG dimensions:", err);
                }
                
                // Reset artboard background color to default white before applying SVG's
                state.artboardBgColor = '#ffffff';
                
                // Update workspace artboard size to match the imported SVG
                updateArtboardSize(svgWidth, svgHeight);
                syncArtboardInputs();
                
                paper.project.importSVG(text, {
                    expandShapes: false,
                    insert: true,
                    onLoad: (item) => {
                        // Align the imported item exactly centered on the resized artboard
                        item.position = new paper.Point(200 + svgWidth / 2, 150 + svgHeight / 2);
                        
                        deselectAll();
                        
                        // If it's a group (representing the root <svg>), ungroup its direct children
                        if (item instanceof paper.Group) {
                            const children = [...item.children];
                            const parent = item.parent;
                            const index = item.index;
                            
                            // Detect if any child acts as a redundant artboard/background
                            let bgItem = null;
                            for (let i = 0; i < children.length; i++) {
                                const child = children[i];
                                if (child instanceof paper.Path && 
                                    Math.abs(child.bounds.width - svgWidth) < 5 && 
                                    Math.abs(child.bounds.height - svgHeight) < 5) {
                                    bgItem = child;
                                    break;
                                }
                            }
                            
                            // If a background item is found, apply its fill to our workspace artboard and remove it
                            if (bgItem) {
                                if (bgItem.fillColor) {
                                    try {
                                        state.artboardBgColor = bgItem.fillColor.toCSS ? bgItem.fillColor.toCSS(true) : bgItem.fillColor;
                                        if (artboardRect) {
                                            artboardRect.fillColor = bgItem.fillColor;
                                        }
                                    } catch (e) {
                                        console.error("Error setting artboard fill:", e);
                                    }
                                }
                                // Remove the background path from the children list
                                const bgIndex = children.indexOf(bgItem);
                                if (bgIndex > -1) {
                                    children.splice(bgIndex, 1);
                                }
                                bgItem.remove();
                            }
                            
                            // Insert remaining children into the parent layer at the group's index
                            parent.insertChildren(index, children);
                            // Remove the empty root <svg> group
                            item.remove();
                            
                            // Select all the imported top-level children
                            children.forEach(c => {
                                c.selected = true;
                            });
                        } else {
                            item.selected = true;
                        }
                        
                        // Adjust zoom to fit the newly resized artboard on screen
                        fitArtboardToScreen();
                        
                        saveState();
                        updateLayersUI();
                        paper.view.draw();
                    }
                });
            };
            reader.readAsText(file);
        }
    });

    // Save SVG file download trigger (clean crop)
    document.getElementById('btn-export-svg').addEventListener('click', () => {
        deselectAll();
        
        // Hide visual artboard helpers for clean SVG content
        const artboardVisible = artboardLayer.visible;
        artboardLayer.visible = false;
        paper.view.draw();
        
        const svgStr = paper.project.exportSVG({
            asString: true,
            bounds: artboardRect.bounds // crop clean
        });
        
        artboardLayer.visible = artboardVisible;
        paper.view.draw();
        
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'vector_drawing.svg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    // Save PNG file download trigger (clean crop)
    document.getElementById('btn-export-png').addEventListener('click', () => {
        deselectAll();
        
        // Hide Artboard shadow & grids for clean PNG export
        const artboardVisible = artboardLayer.visible;
        artboardShadow.visible = false;
        gridGroup.visible = false;
        artboardRect.strokeColor = null;
        paper.view.draw();
        
        const cleanSVGStr = paper.project.exportSVG({
            asString: true,
            bounds: artboardRect.bounds // crop clean
        });
        
        // Restore elements visual status
        artboardShadow.visible = true;
        gridGroup.visible = true;
        artboardRect.strokeColor = '#555555';
        artboardLayer.visible = artboardVisible;
        paper.view.draw();
        
        // Render SVG to temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = state.artboardWidth;
        tempCanvas.height = state.artboardHeight;
        const ctx = tempCanvas.getContext('2d');
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        const img = new Image();
        const svgBlob = new Blob([cleanSVGStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            
            const pngUrl = tempCanvas.toDataURL("image/png");
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = 'vector_drawing.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    });

    // Undo & Redo Actions Menu
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm("Clear all items in the active layer?")) {
            paper.project.activeLayer.clear();
            saveState();
            paper.view.draw();
        }
    });

    // Delete selection actions
    document.getElementById('btn-delete').addEventListener('click', deleteSelectedItems);
    document.getElementById('btn-delete-control').addEventListener('click', deleteSelectedItems);
    
    // Zoom fits controls
    document.getElementById('btn-fit-screen').addEventListener('click', fitArtboardToScreen);
    document.getElementById('btn-fit-screen-control').addEventListener('click', fitArtboardToScreen);
    document.getElementById('btn-zoom-in-menu').addEventListener('click', () => setZoomLevel(state.zoomLevel * 1.25));
    document.getElementById('btn-zoom-out-menu').addEventListener('click', () => setZoomLevel(state.zoomLevel / 1.25));

    // Groups & arrangement actions
    document.getElementById('btn-group').addEventListener('click', groupSelectedItems);
    document.getElementById('btn-ungroup').addEventListener('click', ungroupSelectedItems);
    document.getElementById('btn-bring-to-front').addEventListener('click', bringSelectedToFront);
    document.getElementById('btn-send-to-back').addEventListener('click', sendSelectedToBack);

    // Toggle panels
    document.getElementById('toggle-layers-panel').addEventListener('click', (e) => {
        const panel = document.getElementById('right-panels');
        if (panel.style.display === 'none') {
            panel.style.display = 'flex';
            e.target.innerHTML = '<i class="fa-solid fa-check"></i> Layers Panel';
        } else {
            panel.style.display = 'none';
            e.target.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp; Layers Panel';
        }
    });

    document.getElementById('toggle-properties-panel').addEventListener('click', (e) => {
        const propTab = document.getElementById('tab-properties');
        if (propTab.style.display === 'none') {
            propTab.style.display = 'flex';
            e.target.innerHTML = '<i class="fa-solid fa-check"></i> Properties Panel';
        } else {
            propTab.style.display = 'none';
            e.target.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp; Properties Panel';
        }
    });

    // --- Right Sidebar panel switching ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const panelContents = document.querySelectorAll('.panel-content');
    const stripButtons = document.querySelectorAll('.strip-icon-btn');
    const rightPanels = document.getElementById('right-panels');
    let currentOpenTab = 'layers';

    function switchTab(tabId) {
        // If clicking the same tab that's already open → collapse sidebar
        if (currentOpenTab === tabId && rightPanels && !rightPanels.classList.contains('collapsed')) {
            rightPanels.classList.add('collapsed');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            stripButtons.forEach(s => s.classList.remove('active'));
            currentOpenTab = null;
            return;
        }
        // Expand sidebar and show the clicked tab
        if (rightPanels) rightPanels.classList.remove('collapsed');
        currentOpenTab = tabId;

        tabButtons.forEach(btn => btn.classList.remove('active'));
        panelContents.forEach(p => p.classList.remove('active'));
        stripButtons.forEach(s => s.classList.remove('active'));

        const activeTabBtn   = document.getElementById(`tab-${tabId}`);
        const activeContent  = document.getElementById(`panel-${tabId}-content`);
        const activeStripBtn = document.querySelector(`.strip-icon-btn[data-tab="${tabId}"]`);

        if (activeTabBtn)   activeTabBtn.classList.add('active');
        if (activeContent)  activeContent.classList.add('active');
        if (activeStripBtn) activeStripBtn.classList.add('active');
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.id.replace('tab-', '');
            switchTab(tabId);
        });
    });

    stripButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
        });
    });

    // --- Layers Panel Footer Action Buttons ---
    document.getElementById('layer-new').addEventListener('click', () => {
        const count = paper.project.layers.length;
        const newLayer = new paper.Layer();
        newLayer.name = `Layer ${count}`;
        newLayer.activate();
        updateLayersUI();
    });
    
    document.getElementById('layer-delete').addEventListener('click', () => {
        const selectedItems = getSelectedDrawItems();
        if (selectedItems.length > 0) {
            // Delete the selected drawing items
            selectedItems.forEach(item => item.remove());
            saveState();
            paper.view.draw();
        } else {
            // Delete the active layer
            const activeL = paper.project.activeLayer;
            const drawLayersCount = paper.project.layers.filter(l => l.name !== 'System Artboard').length;
            if (activeL && activeL.name !== 'System Artboard' && drawLayersCount > 1) {
                if (confirm(`Delete layer "${activeL.name}" and all its drawings?`)) {
                    activeL.remove();
                    const remaining = paper.project.layers.filter(l => l.name !== 'System Artboard');
                    remaining[remaining.length - 1].activate();
                    
                    saveState();
                    paper.view.draw();
                }
            } else {
                alert("Cannot delete the only drawing layer!");
            }
        }
    });

    document.getElementById('layer-up').addEventListener('click', () => {
        const activeL = paper.project.activeLayer;
        if (activeL.name === 'System Artboard') return;
        
        const layers = paper.project.layers;
        const idx = layers.indexOf(activeL);
        if (idx < layers.length - 1) {
            activeL.insertAbove(layers[idx + 1]);
            updateLayersUI();
            paper.view.draw();
        }
    });

    document.getElementById('layer-down').addEventListener('click', () => {
        const activeL = paper.project.activeLayer;
        if (activeL.name === 'System Artboard') return;
        
        const layers = paper.project.layers;
        const idx = layers.indexOf(activeL);
        if (idx > 0 && layers[idx - 1].name !== 'System Artboard') {
            activeL.insertBelow(layers[idx - 1]);
            updateLayersUI();
            paper.view.draw();
        }
    });

    // --- Alignment Actions ---
    document.getElementById('align-left').addEventListener('click', () => alignSelection('left'));
    document.getElementById('align-center-h').addEventListener('click', () => alignSelection('centerX'));
    document.getElementById('align-right').addEventListener('click', () => alignSelection('right'));
    document.getElementById('align-top').addEventListener('click', () => alignSelection('top'));
    document.getElementById('align-center-v').addEventListener('click', () => alignSelection('centerY'));
    document.getElementById('align-bottom').addEventListener('click', () => alignSelection('bottom'));

    // --- Properties Panel Input Sync Actions ---
    const transformInputs = ['prop-transform-x', 'prop-transform-y', 'prop-transform-w', 'prop-transform-h'];
    transformInputs.forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const selection = getSelectedDrawItems();
            if (selection.length === 0) return;
            
            const item = selection[0];
            const valX = parseFloat(document.getElementById('prop-transform-x').value);
            const valY = parseFloat(document.getElementById('prop-transform-y').value);
            const valW = parseFloat(document.getElementById('prop-transform-w').value);
            const valH = parseFloat(document.getElementById('prop-transform-h').value);
            
            if (!isNaN(valX) && !isNaN(valY)) {
                item.bounds.x = valX;
                item.bounds.y = valY;
            }
            if (!isNaN(valW) && valW > 0 && !isNaN(valH) && valH > 0) {
                item.bounds.width = valW;
                item.bounds.height = valH;
            }
            
            paper.view.draw();
            saveState();
        });
    });

    document.getElementById('prop-stroke-cap').addEventListener('change', (e) => {
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.strokeCap = e.target.value);
        paper.view.draw();
        saveState();
    });

    document.getElementById('prop-stroke-join').addEventListener('change', (e) => {
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.strokeJoin = e.target.value);
        paper.view.draw();
        saveState();
    });

    document.getElementById('prop-dash-array').addEventListener('change', (e) => {
        const selection = getSelectedDrawItems();
        const val = e.target.value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        selection.forEach(item => item.dashArray = val.length > 0 ? val : null);
        paper.view.draw();
        saveState();
    });

    document.getElementById('btn-duplicate').addEventListener('click', duplicateSelectedItems);
    document.getElementById('btn-rotate-90').addEventListener('click', () => {
        const inputAngle = document.getElementById('input-rotate-angle');
        const angle = inputAngle ? parseFloat(inputAngle.value) || 90 : 90;
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.rotate(angle));
        paper.view.draw();
        saveState();
    });
    document.getElementById('btn-flip-h').addEventListener('click', () => {
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.scale(-1, 1));
        paper.view.draw();
        saveState();
    });
    document.getElementById('btn-flip-v').addEventListener('click', () => {
        const selection = getSelectedDrawItems();
        selection.forEach(item => item.scale(1, -1));
        paper.view.draw();
        saveState();
    });

    // --- Modal dialogue windows (About & Docs) ---
    document.getElementById('btn-about').addEventListener('click', () => {
        document.getElementById('about-modal').classList.add('active');
    });
    document.getElementById('btn-close-about').addEventListener('click', () => {
        document.getElementById('about-modal').classList.remove('active');
    });
    document.getElementById('btn-close-about-ok').addEventListener('click', () => {
        document.getElementById('about-modal').classList.remove('active');
    });
    document.getElementById('btn-docs').addEventListener('click', () => {
        window.open('docs.html', '_blank');
    });

    // --- Custom Shape Dimensions Modal Event Listeners ---
    const shapeModal = document.getElementById('shape-options-modal');
    const shapeWidthInput = document.getElementById('shape-width-input');
    const shapeHeightInput = document.getElementById('shape-height-input');
    const shapeUnitSelect = document.getElementById('shape-unit-select');

    function closeShapeModal() {
        shapeModal.classList.remove('active');
        shapeClickOrigin = null;
        activePath = null;
    }

    document.getElementById('btn-close-shape-modal').addEventListener('click', closeShapeModal);
    document.getElementById('btn-cancel-shape-modal').addEventListener('click', closeShapeModal);

    shapeUnitSelect.addEventListener('change', (e) => {
        const newUnit = e.target.value;
        const oldUnit = lastSelectedModalUnit;
        if (oldUnit === newUnit) return;

        // Convert width value
        const wVal = parseFloat(shapeWidthInput.value);
        if (!isNaN(wVal)) {
            const px = convertUnitToPixels(wVal, oldUnit, state.artboardResolution);
            shapeWidthInput.value = convertPixelsToUnit(px, newUnit, state.artboardResolution);
        }
        // Convert height value
        const hVal = parseFloat(shapeHeightInput.value);
        if (!isNaN(hVal)) {
            const px = convertUnitToPixels(hVal, oldUnit, state.artboardResolution);
            shapeHeightInput.value = convertPixelsToUnit(px, newUnit, state.artboardResolution);
        }

        // Update suffixes
        document.querySelectorAll('.shape-unit-label').forEach(el => el.innerText = newUnit);
        lastSelectedModalUnit = newUnit;
    });

    document.getElementById('btn-ok-shape-modal').addEventListener('click', () => {
        if (!shapeClickOrigin) {
            closeShapeModal();
            return;
        }

        const wVal = parseFloat(shapeWidthInput.value);
        const hVal = parseFloat(shapeHeightInput.value);
        const unit = shapeUnitSelect.value;

        if (isNaN(wVal) || wVal <= 0 || isNaN(hVal) || hVal <= 0) {
            alert('Please enter valid, positive dimensions.');
            return;
        }

        // Convert to pixels
        const wPixels = convertUnitToPixels(wVal, unit, state.artboardResolution);
        const hPixels = convertUnitToPixels(hVal, unit, state.artboardResolution);

        deselectAll();

        if (shapeClickType === 'rect') {
            activePath = new paper.Path.Rectangle({
                point: shapeClickOrigin,
                size: [wPixels, hPixels]
            });
        } else {
            const rect = new paper.Rectangle(shapeClickOrigin, new paper.Size(wPixels, hPixels));
            activePath = new paper.Path.Ellipse(rect);
        }

        setupShapeStyles(activePath);
        activePath.selected = true;

        finishActivePath();
        updateLayersUI();
        paper.view.draw();
        closeShapeModal();
    });

    const handleShapeEnter = (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-ok-shape-modal').click();
        }
    };
    shapeWidthInput.addEventListener('keydown', handleShapeEnter);
    shapeHeightInput.addEventListener('keydown', handleShapeEnter);

    shapeModal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeShapeModal();
        }
    });
    
    // Workspace Zoom using Mouse Wheel (Alt + Scroll)
    const viewport = document.getElementById('canvas-workspace');
    viewport.addEventListener('wheel', (e) => {
        if (e.altKey || state.virtualAlt) {
            e.preventDefault();
            const viewPoint = paper.view.viewToProject(new paper.Point(e.offsetX, e.offsetY));
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            setZoomLevel(state.zoomLevel * factor, viewPoint);
        }
    }, { passive: false });
    
    // --- Virtual Modifier Keys Floating Widget ---
    const ctrlBtn = document.getElementById('btn-virtual-ctrl');
    const altBtn = document.getElementById('btn-virtual-alt');
    const shiftBtn = document.getElementById('btn-virtual-shift');
    const keypad = document.getElementById('virtual-modifiers-container');
    const keypadHandle = document.getElementById('keypad-drag-handle');
    
    if (ctrlBtn) {
        ctrlBtn.addEventListener('click', () => {
            state.virtualCtrl = !state.virtualCtrl;
            if (state.virtualCtrl) {
                ctrlBtn.classList.add('active');
            } else {
                ctrlBtn.classList.remove('active');
            }
        });
    }
    
    if (altBtn) {
        altBtn.addEventListener('click', () => {
            state.virtualAlt = !state.virtualAlt;
            if (state.virtualAlt) {
                altBtn.classList.add('active');
            } else {
                altBtn.classList.remove('active');
            }
        });
    }
    
    if (shiftBtn) {
        shiftBtn.addEventListener('click', () => {
            state.virtualShift = !state.virtualShift;
            if (state.virtualShift) {
                shiftBtn.classList.add('active');
            } else {
                shiftBtn.classList.remove('active');
            }
        });
    }
    
    if (keypad && keypadHandle) {
        makeElementDraggable(keypad, keypadHandle);
    }
}

// Swap color palette targets
function swapFillAndStrokeColors() {
    const tempColor = state.fillColor;
    const tempNone = state.fillColorNone;
    
    state.fillColor = state.strokeColor;
    state.fillColorNone = state.strokeColorNone;
    
    state.strokeColor = tempColor;
    state.strokeColorNone = tempNone;
    
    const fillInd = document.getElementById('toolbar-fill-indicator');
    const strokeInd = document.getElementById('toolbar-stroke-indicator');
    
    if (state.fillColorNone) {
        fillInd.classList.add('none');
        document.getElementById('btn-fill-none').classList.add('active');
    } else {
        fillInd.style.backgroundColor = state.fillColor;
        fillInd.classList.remove('none');
        document.getElementById('btn-fill-none').classList.remove('active');
        document.getElementById('fill-color').value = state.fillColor;
    }
    
    if (state.strokeColorNone) {
        strokeInd.classList.add('none');
        document.getElementById('btn-stroke-none').classList.add('active');
    } else {
        strokeInd.style.borderColor = state.strokeColor;
        strokeInd.classList.remove('none');
        document.getElementById('btn-stroke-none').classList.remove('active');
        document.getElementById('stroke-color').value = state.strokeColor;
    }
    
    applyStylesToSelection();
}

// Reset colors back to black stroke, white fill
function resetDefaultColors() {
    state.fillColor = '#ffffff';
    state.fillColorNone = false;
    state.strokeColor = '#000000';
    state.strokeColorNone = false;
    state.strokeWidth = 2;
    
    const fillInd = document.getElementById('toolbar-fill-indicator');
    const strokeInd = document.getElementById('toolbar-stroke-indicator');
    
    fillInd.style.backgroundColor = '#ffffff';
    fillInd.classList.remove('none');
    document.getElementById('fill-color').value = '#ffffff';
    document.getElementById('btn-fill-none').classList.remove('active');
    
    strokeInd.style.borderColor = '#000000';
    strokeInd.classList.remove('none');
    document.getElementById('stroke-color').value = '#000000';
    document.getElementById('btn-stroke-none').classList.remove('active');
    document.getElementById('stroke-width').value = 2;
    
    applyStylesToSelection();
}

// -------------------------------------------------------------
// SELECTION MANIPULATIONS (DELETE, GROUP, ARRANGEMENTS, ALIGNS)
// -------------------------------------------------------------
function deleteSelectedItems() {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 0) {
        selection.forEach(item => item.remove());
        saveState();
        paper.view.draw();
    }
}

function duplicateSelectedItems() {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 0) {
        deselectAll();
        selection.forEach(item => {
            const clone = item.clone();
            clone.translate(new paper.Point(20, 20));
            clone.selected = true;
        });
        saveState();
        paper.view.draw();
    }
}

function groupSelectedItems() {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length > 1) {
        const group = new paper.Group(selection);
        deselectAll();
        group.selected = true;
        
        saveState();
        paper.view.draw();
    }
}

function ungroupSelectedItems() {
    const selection = getTopLevelSelectedDrawItems();
    let groupedFound = false;
    
    selection.forEach(item => {
        if (item instanceof paper.Group) {
            const children = [...item.children];
            item.parent.insertChildren(item.index, children);
            item.remove();
            children.forEach(c => c.selected = true);
            groupedFound = true;
        }
    });
    
    if (groupedFound) {
        saveState();
        paper.view.draw();
    }
}

function bringSelectedToFront() {
    const selection = getTopLevelSelectedDrawItems();
    selection.forEach(item => item.bringToFront());
    saveState();
    paper.view.draw();
}

function sendSelectedToBack() {
    const selection = getTopLevelSelectedDrawItems();
    selection.forEach(item => {
        item.sendToBack();
    });
    paper.view.draw();
    saveState();
}

function alignSelection(type) {
    const selection = getTopLevelSelectedDrawItems();
    if (selection.length === 0) return;
    
    // Read alignment target from the UI dropdown (defaults to Selection)
    const alignToElement = document.getElementById('align-to-target');
    const alignTo = alignToElement ? alignToElement.value : 'selection';
    
    let bounds = null;
    
    // Determine reference artboard bounds:
    // 1. If artboard tool active and an artboard is selected → use that
    // 2. If alignTo === 'artboard' → find which artboard the items are inside
    // 3. If single item selected → use its containing artboard
    // 4. Fall back to main artboard rect
    function getContainingArtboard(item) {
        // Check secondary artboards
        if (window.multiArtboards) {
            for (const ab of window.multiArtboards) {
                if (ab.isMain) continue;
                if (ab.rect && ab.rect.isInserted() && ab.rect.bounds.intersects(item.bounds)) {
                    return ab.rect.bounds.clone();
                }
            }
        }
        // Fall back to main artboard
        if (window.artboardRect) return window.artboardRect.bounds.clone();
        return paper.view.bounds.clone();
    }

    if (selection.length === 1 || alignTo === 'artboard') {
        // Use selected artboard from artboard tool if active
        if (state.activeToolName === 'artboard' && window._selectedArtboard) {
            if (window._selectedArtboard === 'main' && window.artboardRect) {
                bounds = window.artboardRect.bounds.clone();
            } else if (window._selectedArtboard.rect && window._selectedArtboard.rect.isInserted()) {
                bounds = window._selectedArtboard.rect.bounds.clone();
            }
        }
        // Otherwise detect from first item's position
        if (!bounds) bounds = getContainingArtboard(selection[0]);
        
        selection.forEach(item => {
            switch (type) {
                case 'left':
                    item.bounds.x = bounds.x;
                    break;
                case 'centerX':
                    item.bounds.x = bounds.x + (bounds.width - item.bounds.width) / 2;
                    break;
                case 'right':
                    item.bounds.x = bounds.x + bounds.width - item.bounds.width;
                    break;
                case 'top':
                    item.bounds.y = bounds.y;
                    break;
                case 'centerY':
                    item.bounds.y = bounds.y + (bounds.height - item.bounds.height) / 2;
                    break;
                case 'bottom':
                    item.bounds.y = bounds.y + bounds.height - item.bounds.height;
                    break;
            }
        });
    } else {
        // Align multiple selected items relative to their combined bounds
        selection.forEach(item => {
            if (!bounds) bounds = item.bounds.clone();
            else bounds = bounds.unite(item.bounds);
        });
        
        if (!bounds) return;
        
        selection.forEach(item => {
            switch (type) {
                case 'left':
                    item.bounds.x = bounds.x;
                    break;
                case 'centerX':
                    item.bounds.x = bounds.x + (bounds.width - item.bounds.width) / 2;
                    break;
                case 'right':
                    item.bounds.x = bounds.x + bounds.width - item.bounds.width;
                    break;
                case 'top':
                    item.bounds.y = bounds.y;
                    break;
                case 'centerY':
                    item.bounds.y = bounds.y + (bounds.height - item.bounds.height) / 2;
                    break;
                case 'bottom':
                    item.bounds.y = bounds.y + bounds.height - item.bounds.height;
                    break;
            }
        });
    }
    
    paper.view.draw();
    saveState();
}

// -------------------------------------------------------------
// KEYBOARD SHORTCUTS CONTROLLER
// -------------------------------------------------------------
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        const isInputActive = document.activeElement.tagName === 'INPUT' || 
                              document.activeElement.tagName === 'SELECT' || 
                              document.activeElement.tagName === 'TEXTAREA' ||
                              document.activeElement.readOnly === false;
                              
        if (isInputActive) return;
        
        const key = e.key.toLowerCase();
        
        // Finish Pen tool path on Enter or Escape
        if (e.key === 'Escape' || e.key === 'Enter') {
            if (state.activeToolName === 'pen' && activePath) {
                finishActivePath();
                paper.view.draw();
            }
        }
        
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (state.activeToolName !== 'hand') {
                state.prevToolBeforeSpace = state.activeToolName;
                document.getElementById('tool-hand').click();
            }
        }
        
        // Shortcuts mapping
        if (key === 'v') {
            document.getElementById('tool-select').click();
        } else if (key === 'a' && !e.shiftKey) {
            document.getElementById('tool-direct-select').click();
        } else if (key === 'a' && e.shiftKey) {
            document.getElementById('tool-artboard').click();
        } else if (key === 'p') {
            document.getElementById('tool-pen').click();
        } else if (key === 't') {
            document.getElementById('tool-type').click();
        } else if (e.key === '\\') {
            document.getElementById('tool-line').click();
        } else if (key === 'm') {
            document.getElementById('tool-rectangle').click();
        } else if (key === 'l') {
            document.getElementById('tool-ellipse').click();
        } else if (key === 'b') {
            document.getElementById('tool-pencil').click();
        } else if (key === 'g' && !e.ctrlKey && !e.metaKey) {
            document.getElementById('tool-gradient')?.click();
        } else if (key === 'h') {
            document.getElementById('tool-hand').click();
        } else if (key === 'z') {
            document.getElementById('tool-zoom').click();
        } else if (key === 'r') {
            document.getElementById('tool-rotate').click();
        } else if (key === 'e' && (e.shiftKey || state.virtualShift)) {
            document.getElementById('tool-eraser').click();
        } else if (key === 'x' && (e.shiftKey || state.virtualShift)) {
            swapFillAndStrokeColors();
        } else if (key === 'd') {
            resetDefaultColors();
        }
        
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (state.activeToolName === 'artboard') {
                // Delete selected artboard
                if (_artboardToolSelectedAb && _artboardToolSelectedAb !== 'main' && window.multiArtboards) {
                    if (confirm('Delete this artboard?')) {
                        try { _artboardToolSelectedAb.group?.remove(); } catch(_) {}
                        try { _artboardToolSelectedAb.rect?.remove(); } catch(_) {}
                        try { _artboardToolSelectedAb.shadow?.remove(); } catch(_) {}
                        const idx = window.multiArtboards.indexOf(_artboardToolSelectedAb);
                        if (idx !== -1) window.multiArtboards.splice(idx, 1);
                        _artboardToolSelectedAb = null;
                        const lbl = document.getElementById('artboard-sel-name');
                        if (lbl) lbl.textContent = 'None';
                        paper.view.draw();
                        if (window.saveState) saveState();
                    }
                }
            } else {
                deleteSelectedItems();
            }
        }
        
        if (e.ctrlKey || e.metaKey || state.virtualCtrl) {
            if (key === 'z') {
                e.preventDefault();
                undo();
            } else if (key === 'y') {
                e.preventDefault();
                redo();
            } else if (key === 'g') {
                e.preventDefault();
                if (e.shiftKey || state.virtualShift) {
                    ungroupSelectedItems();
                } else {
                    groupSelectedItems();
                }
            } else if (e.key === '=') {
                e.preventDefault();
                setZoomLevel(state.zoomLevel * 1.25);
            } else if (e.key === '-') {
                e.preventDefault();
                setZoomLevel(state.zoomLevel / 1.25);
            } else if (e.key === '0') {
                e.preventDefault();
                fitArtboardToScreen();
            } else if (e.key === ']') {
                if (e.shiftKey || state.virtualShift) {
                    e.preventDefault();
                    bringSelectedToFront();
                }
            } else if (e.key === '[') {
                if (e.shiftKey || state.virtualShift) {
                    e.preventDefault();
                    sendSelectedToBack();
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.code === 'Space') {
            if (state.prevToolBeforeSpace) {
                const prevBtn = document.querySelector(`.tool-btn[data-tool="${state.prevToolBeforeSpace}"]`);
                if (prevBtn) prevBtn.click();
                state.prevToolBeforeSpace = null;
            }
        }
    });
}

// --- Dragging Helper for Floating Keypad Modifiers ---
function makeElementDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e = e || window.event;
        // Don't drag if clicking buttons
        if (e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        let newTop = element.offsetTop - pos2;
        let newLeft = element.offsetLeft - pos1;
        
        const parentWidth = window.innerWidth;
        const parentHeight = window.innerHeight;
        
        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft + element.offsetWidth > parentWidth) newLeft = parentWidth - element.offsetWidth;
        if (newTop + element.offsetHeight > parentHeight) newTop = parentHeight - element.offsetHeight;
        
        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
        element.style.bottom = "auto";
    }
    
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}


// =====================================================
// SHAPE BUILDER TOOL RESTORED
// =====================================================

let shapeBuilderPreview = null;

function getShapeBuilderItems() {
    return getSelectedDrawItems().filter(item =>
        item instanceof paper.PathItem
    );
}

function clearShapeBuilderPreview() {
    if (shapeBuilderPreview) {
        shapeBuilderPreview.remove();
        shapeBuilderPreview = null;
    }
}

function handleShapeBuilderMouseDown(event) {
    const items = getShapeBuilderItems();

    if (items.length < 2) {
        alert('Select at least 2 overlapping shapes.');
        return;
    }

    let result = items[0];

    for (let i = 1; i < items.length; i++) {
        try {
            result = event.modifiers.alt
                ? result.subtract(items[i])
                : result.unite(items[i]);
        } catch (err) {
            console.warn(err);
        }
    }

    items.forEach(item => {
        if (item !== result) {
            item.remove();
        }
    });

    result.selected = true;

    saveState();
    updateLayersUI();
    paper.view.draw();
}

function handleShapeBuilderMouseDrag(event) {}

function handleShapeBuilderMouseUp(event) {
    clearShapeBuilderPreview();
}

// =====================================================
// TAPERED BRUSH TOOL (Shift+B)
// Draws variable-width strokes that taper to a point.
// Converts to a filled closed vector Path on release.
// =====================================================
let _tapPath = null;
let _tapPoints = [];

function handleTaperedMouseDown(event) {
    _tapPoints = [event.point];
    _tapPath = new paper.Path({
        strokeColor: state.strokeColor || '#000000',
        strokeWidth: 1,
        strokeCap: 'round',
        strokeJoin: 'round',
        opacity: state.strokeColorNone ? 0 : 1
    });
    _tapPath.add(event.point);
}

function handleTaperedMouseDrag(event) {
    if (!_tapPath) return;
    _tapPath.add(event.point);
    _tapPoints.push(event.point);
    paper.view.draw();
}

function handleTaperedMouseUp(event) {
    if (!_tapPath || _tapPoints.length < 2) {
        if (_tapPath) _tapPath.remove();
        _tapPath = null; _tapPoints = [];
        return;
    }
    _tapPath.smooth({ type: 'catmull-rom' });
    const startWidth = Math.max(1, state.strokeWidth || 6);
    const shape = _buildTaperedShape(_tapPoints, startWidth);
    _tapPath.remove();
    _tapPath = null; _tapPoints = [];
    if (shape) {
        shape.fillColor = state.strokeColor || '#000000';
        shape.strokeColor = null;
        shape.selected = true;
        setupShapeStyles(shape);
        shape.fillColor = state.strokeColor || '#000000'; // re-apply after setupShapeStyles
        shape.strokeColor = null;
        saveState();
        onSelectionChanged();
    }
    paper.view.draw();
}

function _buildTaperedShape(points, startWidth) {
    const n = points.length;
    if (n < 2) return null;
    const half = startWidth / 2;
    const upper = [], lower = [];
    for (let i = 0; i < n; i++) {
        const t    = i / (n - 1);
        const w    = half * (1 - t) + 0.3 * t; // taper to 0.3px
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(n - 1, i + 1)];
        const dir  = next.subtract(prev).normalize();
        const perp = new paper.Point(-dir.y, dir.x);
        upper.push(points[i].add(perp.multiply(w)));
        lower.push(points[i].subtract(perp.multiply(w)));
    }
    const shape = new paper.Path();
    upper.forEach(pt => shape.add(pt));
    lower.reverse().forEach(pt => shape.add(pt));
    shape.closed = true;
    shape.smooth({ type: 'catmull-rom' });
    return shape;
}

// =====================================================
// GRADIENT TOOL (G)
// Select objects first, then drag to set direction.
// A floating panel shows color stops + gradient type.
// =====================================================
let _gradToolOrigin = null;
let _gradToolLine   = null;
let _gradStartDot   = null;
let _gradEndDot     = null;

// Gradient tool state — persists across drags
const _gradState = {
    type: 'linear',     // 'linear' | 'radial'
    c1:   '#ff6b6b',
    c2:   '#4ecdc4',
    opacity1: 1,
    opacity2: 1
};

// Build the floating gradient options panel
function buildGradientToolPanel() {
    if (document.getElementById('grad-tool-panel')) return;
    const p = document.createElement('div');
    p.id = 'grad-tool-panel';
    p.style.cssText = [
        'display:none','position:fixed','bottom:70px','left:50%',
        'transform:translateX(-50%)',
        'background:#2b2b2b','border:1px solid #555','border-radius:8px',
        'padding:10px 14px','z-index:9998',
        'box-shadow:0 4px 24px rgba(0,0,0,.7)',
        'font-family:Inter,sans-serif','font-size:11px','color:#ccc',
        'display:none','align-items:center','gap:12px','white-space:nowrap'
    ].join(';');

    p.innerHTML = [
        // Type toggle
        '<div style="display:flex;gap:4px;">',
            '<button id="gtp-linear" style="padding:4px 10px;border:2px solid #f17c22;border-radius:4px;background:#f17c22;color:#000;font-size:10px;font-weight:700;cursor:pointer;">Linear</button>',
            '<button id="gtp-radial" style="padding:4px 10px;border:2px solid #444;border-radius:4px;background:#1e1e1e;color:#888;font-size:10px;cursor:pointer;">Radial</button>',
        '</div>',
        '<div style="width:1px;height:28px;background:#444;"></div>',
        // Color 1
        '<div style="display:flex;align-items:center;gap:5px;">',
            '<span style="color:#888;font-size:10px;">From</span>',
            '<div id="gtp-sw1" style="width:24px;height:24px;border-radius:3px;border:1px solid #666;background:#ff6b6b;cursor:pointer;" title="Click to change color 1"></div>',
            '<input type="color" id="gtp-c1" value="#ff6b6b" style="display:none;">',
            '<input type="range" id="gtp-a1" min="0" max="100" value="100" style="width:52px;" title="Opacity">',
        '</div>',
        // Arrow
        '<span style="color:#555;font-size:14px;">→</span>',
        // Color 2
        '<div style="display:flex;align-items:center;gap:5px;">',
            '<span style="color:#888;font-size:10px;">To</span>',
            '<div id="gtp-sw2" style="width:24px;height:24px;border-radius:3px;border:1px solid #666;background:#4ecdc4;cursor:pointer;" title="Click to change color 2"></div>',
            '<input type="color" id="gtp-c2" value="#4ecdc4" style="display:none;">',
            '<input type="range" id="gtp-a2" min="0" max="100" value="100" style="width:52px;" title="Opacity">',
        '</div>',
        '<div style="width:1px;height:28px;background:#444;"></div>',
        // Live preview
        '<div id="gtp-prev" style="width:80px;height:24px;border-radius:4px;border:1px solid #555;"></div>',
        '<span style="color:#666;font-size:9px;">Drag on canvas</span>'
    ].join('');
    document.body.appendChild(p);

    // Wire type buttons
    document.getElementById('gtp-linear').onclick = function() {
        _gradState.type = 'linear';
        this.style.background='#f17c22'; this.style.borderColor='#f17c22'; this.style.color='#000';
        const rb = document.getElementById('gtp-radial');
        rb.style.background='#1e1e1e'; rb.style.borderColor='#444'; rb.style.color='#888';
        _updateGTPPreview();
    };
    document.getElementById('gtp-radial').onclick = function() {
        _gradState.type = 'radial';
        this.style.background='#f17c22'; this.style.borderColor='#f17c22'; this.style.color='#000';
        const lb = document.getElementById('gtp-linear');
        lb.style.background='#1e1e1e'; lb.style.borderColor='#444'; lb.style.color='#888';
        _updateGTPPreview();
    };

    // Wire color pickers
    document.getElementById('gtp-sw1').onclick = () => document.getElementById('gtp-c1').click();
    document.getElementById('gtp-sw2').onclick = () => document.getElementById('gtp-c2').click();

    document.getElementById('gtp-c1').oninput = function() {
        _gradState.c1 = this.value;
        document.getElementById('gtp-sw1').style.background = this.value;
        _updateGTPPreview();
    };
    document.getElementById('gtp-c2').oninput = function() {
        _gradState.c2 = this.value;
        document.getElementById('gtp-sw2').style.background = this.value;
        _updateGTPPreview();
    };
    document.getElementById('gtp-a1').oninput = function() {
        _gradState.opacity1 = parseInt(this.value) / 100;
        _updateGTPPreview();
    };
    document.getElementById('gtp-a2').oninput = function() {
        _gradState.opacity2 = parseInt(this.value) / 100;
        _updateGTPPreview();
    };

    _updateGTPPreview();
}

function _updateGTPPreview() {
    const prev = document.getElementById('gtp-prev');
    if (!prev) return;
    const c1 = _gradState.c1 || '#ff6b6b';
    const c2 = _gradState.c2 || '#4ecdc4';
    if (_gradState.type === 'radial') {
        prev.style.background = `radial-gradient(circle, ${c1}, ${c2})`;
    } else {
        prev.style.background = `linear-gradient(90deg, ${c1}, ${c2})`;
    }
}

function showGradientToolPanel() {
    buildGradientToolPanel();
    const p = document.getElementById('grad-tool-panel');
    if (p) { p.style.display = 'flex'; _updateGTPPreview(); }
}
function hideGradientToolPanel() {
    const p = document.getElementById('grad-tool-panel');
    if (p) p.style.display = 'none';
}
window.showGradientToolPanel = showGradientToolPanel;
window.hideGradientToolPanel = hideGradientToolPanel;

// Safely convert any color value to a Paper.js-safe hex string
function _safeHex(val, fallback) {
    if (!val) return fallback || '#000000';
    // Already a valid 6-digit hex
    if (/^#[0-9a-fA-F]{6}$/.test(val)) return val;
    // 3-digit hex → expand
    if (/^#[0-9a-fA-F]{3}$/.test(val)) {
        return '#' + val[1]+val[1]+val[2]+val[2]+val[3]+val[3];
    }
    // Try parsing via a canvas
    try {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = val;
        const hex = ctx.fillStyle; // browser normalises to #rrggbb or rgba(...)
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    } catch(_) {}
    return fallback || '#000000';
}

// Build a Paper.js Color with opacity baked in
function _makePaperColor(hex, opacity) {
    const h = _safeHex(hex, '#000000');
    const c = new paper.Color(h);
    c.alpha = (opacity === undefined || isNaN(opacity)) ? 1 : Math.max(0, Math.min(1, opacity));
    return c;
}

function handleGradientToolMouseDown(event) {
    _gradToolOrigin = event.point;
    if (_gradToolLine)  { try { _gradToolLine.remove();  } catch(_){} _gradToolLine  = null; }
    if (_gradStartDot)  { try { _gradStartDot.remove();  } catch(_){} _gradStartDot  = null; }
    if (_gradEndDot)    { try { _gradEndDot.remove();    } catch(_){} _gradEndDot    = null; }

    _gradToolLine = new paper.Path.Line({
        from: event.point, to: event.point,
        strokeColor: new paper.Color('#4a90e2'),
        strokeWidth: 1.5, dashArray: [6, 3]
    });
    _gradToolLine.data = { isGradPreview: true };

    _gradStartDot = new paper.Path.Circle({
        center: event.point, radius: 5,
        fillColor: new paper.Color('#ffffff'),
        strokeColor: new paper.Color('#4a90e2'),
        strokeWidth: 1.5
    });
    _gradStartDot.data = { isGradPreview: true };
}

function handleGradientToolMouseDrag(event) {
    if (!_gradToolOrigin || !_gradToolLine) return;
    _gradToolLine.lastSegment.point = event.point;
    if (_gradEndDot) { try { _gradEndDot.remove(); } catch(_){} }
    _gradEndDot = new paper.Path.Circle({
        center: event.point, radius: 4,
        fillColor: new paper.Color('#4a90e2'),
        strokeColor: new paper.Color('#ffffff'),
        strokeWidth: 1
    });
    _gradEndDot.data = { isGradPreview: true };
    paper.view.draw();
}

function handleGradientToolMouseUp(event) {
    // Remove preview elements
    [_gradToolLine, _gradStartDot, _gradEndDot].forEach(p => {
        if (p) { try { p.remove(); } catch(_){} }
    });
    _gradToolLine = _gradStartDot = _gradEndDot = null;

    const origin = _gradToolOrigin;
    _gradToolOrigin = null;
    if (!origin) return;

    const dest = event.point;
    if (origin.getDistance(dest) < 4) return;

    const isRadial = (_gradState.type === 'radial') ||
                     (event.modifiers && event.modifiers.alt);
    const items = getSelectedDrawItems();
    if (!items.length) {
        showNotification('Select objects first, then drag with the Gradient Tool');
        return;
    }

    // Use colors from the gradient tool panel (validated hex)
    const c1hex = _safeHex(_gradState.c1, '#ff6b6b');
    const c2hex = _safeHex(_gradState.c2, '#4ecdc4');
    const a1    = isNaN(_gradState.opacity1) ? 1 : _gradState.opacity1;
    const a2    = isNaN(_gradState.opacity2) ? 1 : _gradState.opacity2;

    // Build Paper.js color stops with explicit Color objects (avoids hex format errors)
    const stop1 = new paper.Color(c1hex);
    stop1.alpha = a1;
    const stop2 = new paper.Color(c2hex);
    stop2.alpha = a2;

    let applied = 0;
    items.forEach(item => {
        if (!item.bounds) return;
        try {
            if (isRadial) {
                item.fillColor = {
                    gradient: { stops: [stop1, stop2], radial: true },
                    origin:      origin,
                    destination: dest
                };
            } else {
                item.fillColor = {
                    gradient: { stops: [stop1, stop2] },
                    origin:      origin,
                    destination: dest
                };
            }
            applied++;
        } catch(e) { console.warn('Gradient tool err:', e); }
    });

    paper.view.draw();
    saveState();
    if (applied) showNotification((isRadial ? 'Radial' : 'Linear') + ' gradient applied to ' +
        applied + ' object' + (applied > 1 ? 's' : '') + ' ✓');
}

function showNotification(msg, color) {
    const existing = document.getElementById('iguhit-notif');
    if (existing) existing.remove();
    const d = document.createElement('div');
    d.id = 'iguhit-notif';
    d.style.cssText = 'position:fixed;bottom:56px;left:50%;transform:translateX(-50%);' +
        'background:' + (color || '#f17c22') + ';color:#fff;padding:8px 22px;border-radius:6px;font-size:12px;' +
        'font-weight:600;z-index:99999;pointer-events:none;box-shadow:0 2px 14px rgba(0,0,0,.5);' +
        'font-family:Inter,sans-serif;white-space:nowrap;';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 2400);
}
window.showNotification = showNotification;



// =====================================================
// DRAG & DROP IMPORT
// =====================================================

document.addEventListener('dragover', function(e) {
    e.preventDefault();
});

document.addEventListener('drop', function(e) {
    e.preventDefault();

    const file = e.dataTransfer.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(evt) {
        const content = evt.target.result;

        if (file.name.endsWith('.svg')) {
            paper.project.importSVG(content, function(item) {
                item.position = paper.view.center;
                saveState();
                paper.view.draw();
            });
        } else if (
            file.name.endsWith('.png') ||
            file.name.endsWith('.jpg') ||
            file.name.endsWith('.jpeg')
        ) {
            const raster = new paper.Raster({
                source: content,
                position: paper.view.center
            });

            raster.onLoad = function() {
                paper.view.draw();
            };
        }
    };

    reader.readAsDataURL(file);

    if (file.name.endsWith('.svg')) {
        reader.readAsText(file);
    }
});



// =====================================================
// MULTI ARTBOARD SYSTEM
// =====================================================

let artboards = [];
window.multiArtboards = artboards;

// createNewArtboard is now an alias — see addNewArtboardProper below
function createNewArtboard() { addNewArtboardProper(); }



// =====================================================
// CREATE CROPMARKS
// =====================================================

// Build and show cropmarks dialog
function showCropmarksDialog() {
    const items = getSelectedDrawItems();
    if (!items.length) { alert('Select an object first to generate crop marks.'); return; }

    let dlg = document.getElementById('cropmarks-modal');
    if (!dlg) {
        dlg = document.createElement('div');
        dlg.id = 'cropmarks-modal';
        dlg.style.cssText = 'display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
            'background:#2b2b2b;border:1px solid #555;border-radius:8px;padding:20px;width:300px;' +
            'z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.7);font-family:Inter,sans-serif;color:#fff;';
        dlg.innerHTML = [
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">',
                '<span style="font-weight:700;font-size:14px;">Crop Marks</span>',
                '<button id="cm-close" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;">&times;</button>',
            '</div>',
            '<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;">',
                '<span style="color:#aaa;font-size:11px;white-space:nowrap;">Bleed size:</span>',
                '<input type="number" id="cm-bleed" value="0.25" min="0" step="0.125" style="flex:1;background:#1e1e1e;border:1px solid #444;border-radius:4px;color:#fff;padding:6px 8px;font-size:12px;">',
                '<span style="color:#aaa;font-size:11px;">in</span>',
            '</div>',
            '<div style="display:flex;gap:8px;">',
                '<button id="cm-plain" style="flex:1;padding:9px;background:#3a3a3a;border:1px solid #555;border-radius:5px;color:#fff;font-size:12px;cursor:pointer;">Crop Marks</button>',
                '<button id="cm-bleed" style="flex:1;padding:9px;background:#f17c22;border:none;border-radius:5px;color:#000;font-weight:700;font-size:12px;cursor:pointer;">Crop Marks + Bleed</button>',
            '</div>',
        ].join('');
        document.body.appendChild(dlg);
        document.getElementById('cm-close').onclick = () => dlg.style.display = 'none';
        document.getElementById('cm-plain').onclick = () => { _doCropmarks(0); dlg.style.display = 'none'; };
        document.getElementById('cm-bleed').onclick = () => {
            const b = parseFloat(document.getElementById('cm-bleed').value) || 0.25;
            _doCropmarks(b);
            dlg.style.display = 'none';
        };
    }
    dlg.style.display = 'block';
}

function _doCropmarks(bleedInches) {
    const items = getSelectedDrawItems();
    if (!items.length) return;
    const item   = items[0];
    const bounds = item.bounds;

    const PPI    = state.artboardResolution || 300;
    const bleedPx = bleedInches * PPI; // convert inches → paper pixels

    // Shrink bounds inward by bleed/2 on each side
    const half = bleedPx / 2;
    const L = bounds.left   + half;
    const R = bounds.right  - half;
    const T = bounds.top    + half;
    const B = bounds.bottom - half;

    const gap = 8.5;
    const len = 14;
    const sw  = 0.72;

    function mkLine(fx, fy, tx, ty) {
        return new paper.Path.Line({
            from: [fx, fy], to: [tx, ty],
            strokeColor: new paper.Color(0, 0, 0),
            strokeWidth: sw, fillColor: null
        });
    }

    if (window.drawLayer) drawLayer.activate();

    const grp = new paper.Group([
        mkLine(L - gap - len, T, L - gap, T),
        mkLine(L, T - gap - len, L, T - gap),
        mkLine(R + gap, T, R + gap + len, T),
        mkLine(R, T - gap - len, R, T - gap),
        mkLine(L - gap - len, B, L - gap, B),
        mkLine(L, B + gap, L, B + gap + len),
        mkLine(R + gap, B, R + gap + len, B),
        mkLine(R, B + gap, R, B + gap + len)
    ]);

    grp.name = bleedInches > 0 ? `Crop Marks + Bleed (${bleedInches}in)` : 'Crop Marks';
    grp.data = { isCropMarkGroup: true };
    grp.selected = true;
    saveState();
    updateLayersUI();
    paper.view.draw();
}

function createCropmarks() { showCropmarksDialog(); }
document.getElementById('btn-create-cropmarks')?.addEventListener('click', showCropmarksDialog);

// =====================================================
// SAVE / LOAD .iguhit FORMAT
// =====================================================
function saveIguhitFile() {
    // Collect all artboards
    const boardsData = [];
    if (window.artboardRect && window.artboardRect.isInserted()) {
        boardsData.push({
            isMain: true,
            x: window.artboardRect.bounds.x,
            y: window.artboardRect.bounds.y,
            w: window.artboardRect.bounds.width,
            h: window.artboardRect.bounds.height
        });
    }
    if (window.multiArtboards) {
        window.multiArtboards.forEach((ab, i) => {
            if (ab.isMain) return;
            if (ab.rect && ab.rect.isInserted()) {
                boardsData.push({
                    isMain: false,
                    x: ab.rect.bounds.x, y: ab.rect.bounds.y,
                    w: ab.rect.bounds.width, h: ab.rect.bounds.height
                });
            }
        });
    }

    const saveData = {
        version: '1.0',
        format: 'iguhit',
        timestamp: new Date().toISOString(),
        state: {
            artboardWidth:      state.artboardWidth,
            artboardHeight:     state.artboardHeight,
            artboardUnit:       state.artboardUnit,
            artboardResolution: state.artboardResolution,
            fillColor:          state.fillColor,
            strokeColor:        state.strokeColor,
            strokeWidth:        state.strokeWidth,
            opacity:            state.opacity
        },
        artboards: boardsData,
        layers: paper.project.exportJSON({ asString: true })
    };

    const json = JSON.stringify(saveData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'artwork.iguhit';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (window.showNotification) showNotification('Saved as .iguhit ✓');
}

function loadIguhitFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.iguhit,application/json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (data.format !== 'iguhit') { alert('Not a valid .iguhit file.'); return; }

                // Restore state
                if (data.state) {
                    Object.assign(state, data.state);
                    syncArtboardInputs();
                }

                // Restore layers/artwork
                if (data.layers) {
                    // Clear existing draw layers
                    paper.project.layers.forEach(l => {
                        if (l.name !== 'System Artboard') l.remove();
                    });
                    paper.project.importJSON(data.layers);
                }

                // Rebuild artboards
                if (data.artboards) {
                    artboardLayer.locked = false;
                    artboardLayer.activate();
                    // Remove old artboard visuals
                    if (window.artboardRect)   window.artboardRect.remove?.();
                    if (window.artboardShadow) window.artboardShadow.remove?.();
                    if (window.gridGroup)      window.gridGroup.remove?.();
                    window.multiArtboards = [];

                    data.artboards.forEach((ab, idx) => {
                        if (ab.isMain) {
                            // Rebuild main artboard
                            state.artboardWidth  = ab.w;
                            state.artboardHeight = ab.h;
                            updateArtboardSize(ab.w, ab.h);
                        } else {
                            const newAb = createArtboardObject(ab.x, ab.y, ab.w, ab.h);
                            window.multiArtboards.push(newAb);
                        }
                    });
                    artboardLayer.locked = true;
                    if (window.drawLayer) window.drawLayer.activate();
                }

                paper.view.draw();
                updateLayersUI();
                saveState();
                if (window.showNotification) showNotification('Opened ' + file.name + ' ✓');
            } catch (err) {
                alert('Error opening file: ' + err.message);
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// Wire File menu items (added in index.html)
document.getElementById('btn-save-iguhit')?.addEventListener('click', saveIguhitFile);
document.getElementById('btn-open-iguhit')?.addEventListener('click', loadIguhitFile);



// =====================================================
// TRUE MULTI ARTBOARD SYSTEM
// =====================================================

window.multiArtboards = [];

function createArtboardObject(x, y, width, height) {

    const group = new paper.Group();

    const shadow = new paper.Path.Rectangle({
        point: [x + 4, y + 4],
        size: [width, height],
        fillColor: '#111',
        opacity: 0.25
    });

    const rect = new paper.Path.Rectangle({
        point: [x, y],
        size: [width, height],
        fillColor: '#ffffff',
        strokeColor: '#666',
        strokeWidth: 1
    });

    const grid = new paper.Group();

    const spacing = 50;

    for (let gx = x + spacing; gx < x + width; gx += spacing) {
        grid.addChild(new paper.Path.Line({
            from: [gx, y],
            to: [gx, y + height],
            strokeColor: '#f0f0f0',
            strokeWidth: 1
        }));
    }

    for (let gy = y + spacing; gy < y + height; gy += spacing) {
        grid.addChild(new paper.Path.Line({
            from: [x, gy],
            to: [x + width, gy],
            strokeColor: '#f0f0f0',
            strokeWidth: 1
        }));
    }

    group.addChild(shadow);
    group.addChild(rect);
    group.addChild(grid);

    group.locked = true;
    group.guide = true;
    group.data.isArtboard = true;

    return {
        group,
        rect,
        shadow,
        grid
    };
}

function addNewArtboardProper() {
    artboardLayer.locked = false;
    artboardLayer.activate();

    function restoreDrawLayer() {
        artboardLayer.locked = true;
        const dl = window.drawLayer || paper.project.layers.find(l => !l.locked && l.name !== 'System Artboard');
        if (dl) { dl.locked = false; dl.activate(); window.drawLayer = dl; }
    }

    // ── 2-column layout ──────────────────────────────────────────────
    // Column 0 = main artboard (already at x=200, y=150)
    // Column 1 = to the right of main artboard
    // Row increases every 2 artboards (every 2 secondary entries)
    //
    // Layout (index = secondary artboard count before this one):
    //   index 0 → col 1, row 0  (right of main)
    //   index 1 → col 0, row 1  (below main)
    //   index 2 → col 1, row 1  (below index 0)
    //   index 3 → col 0, row 2  ...etc
    //
    // Main artboard origin: (200, 150)
    const SPACING_X = 80;   // horizontal gap between artboards
    const SPACING_Y = 100;  // vertical gap between artboard rows
    const AW = state.artboardWidth;
    const AH = state.artboardHeight;
    const ORIGIN_X = 200;
    const ORIGIN_Y = 150;

    const extraCount = window.multiArtboards.filter(a => !a.isMain).length;

    // Map secondary index to (col, row) in 2-column grid
    // Secondary 0 → (1,0), 1 → (0,1), 2 → (1,1), 3 → (0,2), 4 → (1,2)...
    let col, row;
    if (extraCount === 0) {
        col = 1; row = 0; // first new artboard goes right of main
    } else {
        // After the first secondary, fill pairs: (0,row) then (1,row)
        // secondary 1 → col=0,row=1; secondary 2 → col=1,row=1; etc.
        const pairIndex = extraCount; // 1-based: 1=(0,1), 2=(1,1), 3=(0,2)...
        row = Math.ceil(pairIndex / 2);
        col = (pairIndex % 2 === 1) ? 0 : 1;
    }

    const x = ORIGIN_X + col * (AW + SPACING_X);
    const y = ORIGIN_Y + row * (AH + SPACING_Y);

    const artboard = createArtboardObject(x, y, AW, AH);
    artboard.bounds = artboard.rect.bounds;
    window.multiArtboards.push(artboard);

    restoreDrawLayer();
    paper.project.deselectAll();
    paper.view.draw();
    autoSaveProject();
}

const artboardBtn = document.getElementById('btn-new-artboard');

if (artboardBtn) {
    artboardBtn.onclick = addNewArtboardProper;
}


// =====================================================
// =====================================================
// EXPORT MULTI ARTBOARD PDF — Fixed & Complete
// Handles: paths, compound paths, groups, text,
//          raster images, gradients, opacity, all layers
// =====================================================

function exportAllArtboardsPDF() {

    // ── Robust artboard finder ────────────────────────
    // Searches every possible location the artboard rect could be
    function findMainArtboardRect() {
        // 1. Direct window reference (most common)
        if (window.artboardRect) {
            try { if (window.artboardRect.isInserted()) return window.artboardRect; } catch(_) {}
        }
        // 2. Search artboardLayer children by name
        if (window.artboardLayer) {
            try {
                const kids = window.artboardLayer.children;
                for (let i = 0; i < kids.length; i++) {
                    const c = kids[i];
                    if (c && c.name === 'artboardRect') {
                        try { if (c.isInserted()) { window.artboardRect = c; return c; } } catch(_) {}
                    }
                }
            } catch(_) {}
        }
        // 3. Search ALL layers for any white/near-white filled rectangle named artboardRect
        try {
            for (const layer of paper.project.layers) {
                for (let i = 0; i < layer.children.length; i++) {
                    const c = layer.children[i];
                    if (!c) continue;
                    try {
                        if (c.name === 'artboardRect' && c.isInserted()) {
                            window.artboardRect = c;
                            return c;
                        }
                    } catch(_) {}
                }
            }
        } catch(_) {}
        // 4. Fallback: build a synthetic bounds from state
        if (window.state && window.state.artboardWidth && window.state.artboardHeight) {
            const ox = window.artboardOffsetX || 200;
            const oy = window.artboardOffsetY || 150;
            // Create a synthetic rect-like object with just a bounds property
            return {
                _synthetic: true,
                isInserted: () => true,
                bounds: new paper.Rectangle(ox, oy, window.state.artboardWidth, window.state.artboardHeight)
            };
        }
        return null;
    }

    // ── Collect artboards ────────────────────────────
    const boards = [];
    const mainRect = findMainArtboardRect();
    if (mainRect) {
        boards.push({ rect: mainRect, name: 'Artboard 1' });
    }

    // Add secondary artboards from multiArtboards
    if (window.multiArtboards && window.multiArtboards.length > 0) {
        window.multiArtboards.forEach((ab, i) => {
            if (ab.isMain) return;
            if (ab.rect) {
                try {
                    if (ab.rect.isInserted()) {
                        boards.push({ rect: ab.rect, name: ab.name || ('Artboard ' + (boards.length + 1)) });
                    }
                } catch(_) {}
            }
        });
    }

    if (!boards.length) {
        // Last resort: derive from canvas state
        if (window.state) {
            const ox = 200, oy = 150;
            const w  = window.state.artboardWidth  || 2550;
            const h  = window.state.artboardHeight || 3300;
            boards.push({
                rect: {
                    _synthetic: true,
                    isInserted: () => true,
                    bounds: new paper.Rectangle(ox, oy, w, h)
                },
                name: 'Artboard 1'
            });
        }
        if (!boards.length) {
            alert('No artboard found. Please make sure your document has an artboard.');
            return;
        }
    }

    // ── Helpers ───────────────────────────────────────
    function r4(n) { return +n.toFixed(4); }

    // Paper-pixel → PDF-point coordinate helpers
    // ox,oy = artboard top-left in paper pixels; ph = artboard height in paper pixels
    function tx(px, ox) { return r4(px - ox); }
    function ty(py, oy, ph) { return r4(ph - (py - oy)); }   // flip Y axis

    function paperColorToRGB(c) {
        if (!c) return null;
        if (c.type === 'gradient' || c.gradient) return null;
        try {
            const rgb = c.convert('rgb');
            return [
                Math.max(0, Math.min(1, rgb.red   || 0)),
                Math.max(0, Math.min(1, rgb.green  || 0)),
                Math.max(0, Math.min(1, rgb.blue   || 0))
            ];
        } catch (_) { return null; }
    }
    function safeRGB(c, fallback) {
        return paperColorToRGB(c) || (fallback || [0, 0, 0]);
    }
    function isGradient(c) {
        return c && (c.type === 'gradient' || c.gradient != null);
    }
    function getGradientStops(c) {
        if (!c || !c.gradient || !c.gradient.stops) return [{rgb:[0,0,0],offset:0},{rgb:[1,1,1],offset:1}];
        return c.gradient.stops.map(stop => {
            let color, offset = 0;
            if (Array.isArray(stop))     { color = stop[0]; offset = stop[1] || 0; }
            else if (stop && stop.color !== undefined) { color = stop.color; offset = stop.offset || 0; }
            else                         { color = stop; }
            let rgb = [0,0,0];
            try {
                if (typeof color === 'string') {
                    const pc = new paper.Color(color);
                    rgb = [pc.red||0, pc.green||0, pc.blue||0];
                } else if (color && typeof color === 'object') {
                    const pc = color.convert ? color.convert('rgb') : color;
                    rgb = [pc.red||0, pc.green||0, pc.blue||0];
                }
            } catch(_) {}
            return { rgb, offset: +offset };
        });
    }

    // ── PDF string / byte assembly ────────────────────
    const pdfParts = [];
    let byteOffset = 0;
    const offsets  = [];
    let objNum = 0;

    function wStr(str) { pdfParts.push({ type:'str', data:str }); byteOffset += str.length; }
    function wBin(buf)  { pdfParts.push({ type:'bin', data:buf }); byteOffset += buf.length; }
    function nextObj()  { return ++objNum; }
    function startObj(n){ offsets[n] = byteOffset; wStr(`${n} 0 obj\n`); }
    function endObj()   { wStr('endobj\n'); }

    // ── PDF constants ─────────────────────────────────
    const PDF_PPI  = state.artboardResolution || 300;
    const PX_TO_PT = 72 / PDF_PPI;

    // ── Image XObjects ────────────────────────────────
    // We collect image XObjects globally (they can be referenced across pages)
    const imageXObjects = [];     // { num, width, height, jpegBytes }
    let   imageCounter  = 0;

    function rasterToXObject(item) {
        try {
            // Try to get the image via the Paper.js raster's element or canvas
            let imgEl = item._image || item.image;
            let srcCanvas = null;

            if (imgEl && (imgEl.tagName === 'IMG' || imgEl.tagName === 'CANVAS')) {
                // Draw via native element
                srcCanvas = document.createElement('canvas');
                srcCanvas.width  = Math.max(1, item.width  || item.bounds.width);
                srcCanvas.height = Math.max(1, item.height || item.bounds.height);
                const ctx = srcCanvas.getContext('2d');
                ctx.drawImage(imgEl, 0, 0, srcCanvas.width, srcCanvas.height);
            } else {
                // Fallback: rasterize via Paper.js raster's own canvas element
                // Paper.js Raster stores pixel data in ._canvas or exposes toCanvas()
                const pCanvas = (typeof item.toCanvas === 'function')
                    ? item.toCanvas()
                    : (item._canvas || null);

                if (pCanvas) {
                    srcCanvas = pCanvas;
                } else {
                    // Last resort: crop the main Paper.js view canvas
                    const viewCanvas = paper.view.element;
                    const b  = item.bounds;
                    const vp = paper.view.projectToView(b.topLeft);
                    const z  = paper.view.zoom;
                    const dpr = window.devicePixelRatio || 1;
                    const sw = Math.round(b.width  * z * dpr);
                    const sh = Math.round(b.height * z * dpr);
                    srcCanvas = document.createElement('canvas');
                    srcCanvas.width  = Math.max(1, sw);
                    srcCanvas.height = Math.max(1, sh);
                    const ctx = srcCanvas.getContext('2d');
                    ctx.drawImage(viewCanvas,
                        Math.round(vp.x * dpr), Math.round(vp.y * dpr), sw, sh,
                        0, 0, srcCanvas.width, srcCanvas.height);
                }
            }

            if (!srcCanvas) return null;

            // Convert to JPEG byte array
            const dataURL = srcCanvas.toDataURL('image/jpeg', 0.93);
            const b64     = dataURL.split(',')[1];
            if (!b64) return null;

            const binary = atob(b64);
            const bytes  = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            const xObjNum = nextObj();
            imageXObjects.push({
                num   : xObjNum,
                width : srcCanvas.width,
                height: srcCanvas.height,
                bytes : bytes,
                name  : `Im${++imageCounter}`
            });
            return imageXObjects[imageXObjects.length - 1];
        } catch(e) {
            console.warn('PDF raster export:', e);
            return null;
        }
    }

    // ── Per-page content generation ───────────────────
    // First pass: generate content streams and collect all images / shadings
    const contentStreams  = [];
    const pageShadeObjs   = [];
    const pageImageMaps   = [];   // per page: [ {xobjRef, bounds} ]
    let   shadingCounter  = 0;

    function buildShading(fillColor, item, ox, oy, ph, shadings) {
        if (!isGradient(fillColor)) return null;
        const isRadial = !!(fillColor.gradient && fillColor.gradient.radial);
        const stops    = getGradientStops(fillColor);
        if (!stops || stops.length < 2) return null;
        let x0, y0, x1, y1;
        try {
            x0 = tx(fillColor.origin.x,      ox); y0 = ty(fillColor.origin.y,      oy, ph);
            x1 = tx(fillColor.destination.x, ox); y1 = ty(fillColor.destination.y, oy, ph);
        } catch(_) {
            const b = item.bounds;
            x0 = tx(b.x,           ox); y0 = ty(b.y + b.height, oy, ph);
            x1 = tx(b.x + b.width, ox); y1 = ty(b.y,            oy, ph);
        }
        const shName = `SH${++shadingCounter}`;
        const c0 = stops[0].rgb.map(r4).join(' ');
        const c1 = stops[stops.length - 1].rgb.map(r4).join(' ');
        let dictStr;
        if (isRadial) {
            const r = Math.sqrt((x1-x0)*(x1-x0)+(y1-y0)*(y1-y0));
            dictStr = `<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [${r4(x0)} ${r4(y0)} 0 ${r4(x0)} ${r4(y0)} ${r4(r)}] /Function << /FunctionType 2 /Domain [0 1] /C0 [${c0}] /C1 [${c1}] /N 1 >> /Extend [true true] >>`;
        } else {
            dictStr = `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${r4(x0)} ${r4(y0)} ${r4(x1)} ${r4(y1)}] /Function << /FunctionType 2 /Domain [0 1] /C0 [${c0}] /C1 [${c1}] /N 1 >> /Extend [true true] >>`;
        }
        shadings[shName] = dictStr;
        return shName;
    }

    // Recursively convert a Paper.js item to PDF content stream ops
    function itemToOps(item, ox, oy, ph, shadings, imageMap, depth) {
        depth = depth || 0;
        const ops = [];
        try {
            if (!item.visible || item.opacity === 0) return ops;
        } catch(_) { return ops; }

        const opacity = (item.opacity != null) ? item.opacity : 1;
        const useGS   = opacity < 0.999;
        const gsName  = useGS ? `GS${Math.round(opacity * 100)}` : null;

        if (useGS) {
            ops.push(`q`);
            ops.push(`/${gsName} gs`);
        }

        // ── Path / CompoundPath ──────────────────────
        if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
            const paths = item instanceof paper.CompoundPath ? item.children : [item];
            let pd = '';

            for (const path of paths) {
                if (!path.segments || !path.segments.length) continue;
                const segs = path.segments;
                const fp   = segs[0].point;
                pd += `${tx(fp.x,ox)} ${ty(fp.y,oy,ph)} m\n`;

                for (let s = 1; s < segs.length; s++) {
                    const prev = segs[s-1], curr = segs[s];
                    const ho = prev.handleOut, hi = curr.handleIn;
                    if ((ho && (ho.x||ho.y)) || (hi && (hi.x||hi.y))) {
                        pd += `${tx(prev.point.x+(ho?ho.x:0),ox)} ${ty(prev.point.y+(ho?ho.y:0),oy,ph)} `;
                        pd += `${tx(curr.point.x+(hi?hi.x:0),ox)} ${ty(curr.point.y+(hi?hi.y:0),oy,ph)} `;
                        pd += `${tx(curr.point.x,ox)} ${ty(curr.point.y,oy,ph)} c\n`;
                    } else {
                        pd += `${tx(curr.point.x,ox)} ${ty(curr.point.y,oy,ph)} l\n`;
                    }
                }

                if (path.closed && segs.length > 1) {
                    const last = segs[segs.length-1], first2 = segs[0];
                    const ho = last.handleOut, hi = first2.handleIn;
                    if ((ho && (ho.x||ho.y)) || (hi && (hi.x||hi.y))) {
                        pd += `${tx(last.point.x+(ho?ho.x:0),ox)} ${ty(last.point.y+(ho?ho.y:0),oy,ph)} `;
                        pd += `${tx(first2.point.x+(hi?hi.x:0),ox)} ${ty(first2.point.y+(hi?hi.y:0),oy,ph)} `;
                        pd += `${tx(first2.point.x,ox)} ${ty(first2.point.y,oy,ph)} c\n`;
                    }
                    pd += 'h\n';
                }
            }

            if (!pd.trim()) { if (useGS) ops.push('Q'); return ops; }

            const hasFillGrad = isGradient(item.fillColor);
            const fill        = hasFillGrad ? null : paperColorToRGB(item.fillColor);
            const stroke      = paperColorToRGB(item.strokeColor);
            const sw          = item.strokeWidth || 0;
            const dashArr     = item.dashArray && item.dashArray.length ? `[${item.dashArray.join(' ')}] 0 d\n` : '';
            const cap         = item.strokeCap === 'round' ? '1 J\n' : item.strokeCap === 'square' ? '2 J\n' : '0 J\n';
            const join        = item.strokeJoin === 'round' ? '1 j\n' : item.strokeJoin === 'bevel' ? '2 j\n' : '0 j\n';

            if (hasFillGrad) {
                const shName = buildShading(item.fillColor, item, ox, oy, ph, shadings);
                if (shName) {
                    ops.push(`q\n${pd.trim()}\nW n\n/${shName} sh\nQ`);
                }
                if (stroke && sw > 0) {
                    ops.push(`${pd.trim()}\n${stroke[0]} ${stroke[1]} ${stroke[2]} RG\n${r4(sw)} w\n${cap}${join}${dashArr}S`);
                }
            } else {
                if (fill && stroke && sw > 0) {
                    ops.push(`${pd.trim()}\n${fill[0]} ${fill[1]} ${fill[2]} rg\n${stroke[0]} ${stroke[1]} ${stroke[2]} RG\n${r4(sw)} w\n${cap}${join}${dashArr}B`);
                } else if (fill) {
                    ops.push(`${pd.trim()}\n${fill[0]} ${fill[1]} ${fill[2]} rg\nf`);
                } else if (stroke && sw > 0) {
                    ops.push(`${pd.trim()}\n${stroke[0]} ${stroke[1]} ${stroke[2]} RG\n${r4(sw)} w\n${cap}${join}${dashArr}S`);
                } else {
                    ops.push(`${pd.trim()}\nn`);
                }
            }

        // ── PointText — rasterize to JPEG for pixel-perfect font rendering ──
        // This preserves font family, size, weight, style, and color exactly.
        } else if (item instanceof paper.PointText) {
            try {
                const textContent = item.content || '';
                if (!textContent.trim()) { if (useGS) ops.push('Q'); return ops; }

                const fsPx    = item.fontSize   || 12;
                const ff      = item.fontFamily || 'Inter, sans-serif';
                const fw      = item.fontWeight || '400';
                const fi      = item.fontStyle  || 'normal';
                const fillRGB = safeRGB(item.fillColor, [0, 0, 0]);
                const fillCSS = `rgb(${Math.round(fillRGB[0]*255)},${Math.round(fillRGB[1]*255)},${Math.round(fillRGB[2]*255)})`;
                const fontStr = `${fi} ${fw} ${fsPx}px ${ff}`;
                const lines   = textContent.split('\n');
                const lineH   = fsPx * 1.35;

                // Measure
                const mc  = document.createElement('canvas');
                const mct = mc.getContext('2d');
                mct.font  = fontStr;
                let maxW  = 0;
                lines.forEach(l => { const w = mct.measureText(l).width; if (w > maxW) maxW = w; });
                const pad    = Math.ceil(fsPx * 0.2);
                const totalW = Math.max(1, Math.ceil(maxW) + pad * 2);
                const totalH = Math.max(1, Math.ceil(lineH * lines.length) + pad * 2);

                // Render on white canvas → JPEG
                const tc  = document.createElement('canvas');
                tc.width  = totalW;
                tc.height = totalH;
                const tct = tc.getContext('2d');
                tct.fillStyle = '#ffffff';
                tct.fillRect(0, 0, totalW, totalH);
                tct.font         = fontStr;
                tct.fillStyle    = fillCSS;
                tct.textBaseline = 'alphabetic';
                lines.forEach((line, li) => {
                    tct.fillText(line, pad, pad + fsPx + li * lineH);
                });

                const jpgURL   = tc.toDataURL('image/jpeg', 0.97);
                const jpgB64   = jpgURL.split(',')[1];
                if (!jpgB64) { if (useGS) ops.push('Q'); return ops; }
                const jpgBin   = atob(jpgB64);
                const jpgBytes = new Uint8Array(jpgBin.length);
                for (let bi = 0; bi < jpgBin.length; bi++) jpgBytes[bi] = jpgBin.charCodeAt(bi);

                const xObjNum = nextObj();
                const xName   = `TIm${imageXObjects.length + 1}`;
                imageXObjects.push({ num: xObjNum, width: totalW, height: totalH, bytes: jpgBytes, name: xName });

                // Place at item bounds position (paper-pixel coords → PDF user-space via CTM)
                const ix  = tx(item.bounds.x - pad, ox);
                const iy  = ty(item.bounds.y + totalH - pad, oy, ph);
                ops.push('q');
                ops.push(`${r4(totalW)} 0 0 ${r4(totalH)} ${r4(ix)} ${r4(iy)} cm`);
                ops.push(`/${xName} Do`);
                ops.push('Q');
                imageMap.push({ xobj: imageXObjects[imageXObjects.length - 1] });

            } catch(textErr) {
                console.warn('PDF text raster error:', textErr);
            }

        // ── Raster image ─────────────────────────────
        } else if (item instanceof paper.Raster) {
            const xobj = rasterToXObject(item);
            if (xobj) {
                const b  = item.bounds;
                const ix = tx(b.x,            ox);
                const iy = ty(b.y + b.height,  oy, ph);   // bottom-left in PDF coords
                const iw = r4(b.width);
                const ih = r4(b.height);
                // Apply transform: position + scale image
                ops.push(`q`);
                ops.push(`${iw} 0 0 ${ih} ${ix} ${iy} cm`);
                ops.push(`/${xobj.name} Do`);
                ops.push(`Q`);
                imageMap.push({ xobj, ix, iy, iw, ih });
            }

        // ── Group (recurse) ───────────────────────────
        } else if (item instanceof paper.Group) {
            ops.push('q');
            const children = item.children || [];
            for (const child of children) {
                if (child.visible !== false) {
                    ops.push(...itemToOps(child, ox, oy, ph, shadings, imageMap, depth+1));
                }
            }
            ops.push('Q');

        // ── SymbolItem ────────────────────────────────
        } else if (item.className === 'SymbolItem' && item.definition) {
            ops.push('q');
            const def = item.definition.item;
            if (def) {
                ops.push(...itemToOps(def, ox, oy, ph, shadings, imageMap, depth+1));
            }
            ops.push('Q');
        }

        if (useGS) ops.push('Q');
        return ops;
    }

    // Safe isInserted check — never throws even after undo/redo
    function safeIsInserted(item) {
        try { return item && item.isInserted && item.isInserted(); } catch(_) { return false; }
    }

    // Safe bounds getter
    function safeBounds(item) {
        try { return item && item.bounds ? item.bounds : null; } catch(_) { return null; }
    }

    // Build content streams for each artboard
    for (let i = 0; i < boards.length; i++) {
        // Safely get bounds — may fail if the rect was affected by undo
        let bounds;
        try {
            bounds = boards[i].rect.bounds;
        } catch(_) {
            // Try re-finding the main artboard rect
            const refound = findMainArtboardRect();
            if (refound) {
                try { bounds = refound.bounds; } catch(_2) { continue; }
            } else { continue; }
        }
        if (!bounds) continue;

        const W  = bounds.width;
        const H  = bounds.height;
        const ox = bounds.x;
        const oy = bounds.y;

        const shadings = {};
        const imageMap = [];
        const ops = [];

        // Global CTM: paper-pixels → PDF points
        ops.push(`${r4(PX_TO_PT)} 0 0 ${r4(PX_TO_PT)} 0 0 cm`);

        // White artboard background
        ops.push('q\n1 1 1 rg\n0 0 ' + r4(W) + ' ' + r4(H) + ' re\nf\nQ');

        // Walk ALL visible layers (skip the locked artboard/system layer)
        try {
            paper.project.layers.forEach(layer => {
                try {
                    if (layer === window.artboardLayer) return;
                    if (layer.name === 'System Artboard') return;
                    if (layer.visible === false) return;

                    const kids = layer.children;
                    for (let k = 0; k < kids.length; k++) {
                        const child = kids[k];
                        if (!child) continue;
                        if (!safeIsInserted(child)) continue;
                        if (child.visible === false) continue;

                        // Include if overlaps or touches the artboard (generous 10px margin)
                        const cb = safeBounds(child);
                        if (cb) {
                            const pad = 10;
                            const outside = (cb.right  < bounds.left   - pad ||
                                             cb.left   > bounds.right  + pad ||
                                             cb.bottom < bounds.top    - pad ||
                                             cb.top    > bounds.bottom + pad);
                            if (outside) continue;
                        }

                        try {
                            ops.push('q');
                            ops.push(...itemToOps(child, ox, oy, H, shadings, imageMap, 0));
                            ops.push('Q');
                        } catch(itemErr) {
                            console.warn('PDF: skipping item due to error:', itemErr);
                        }
                    }
                } catch(layerErr) {
                    console.warn('PDF: skipping layer due to error:', layerErr);
                }
            });
        } catch(allLayersErr) {
            console.warn('PDF: layer iteration error:', allLayersErr);
        }

        contentStreams.push(ops.join('\n'));
        pageShadeObjs.push(shadings);
        pageImageMaps.push(imageMap);
    }

    // ── Write all PDF objects ─────────────────────────
    wStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    const catNum   = nextObj();   // catalog
    const pagesNum = nextObj();   // pages dict
    const fontNum  = nextObj();   // Helvetica font

    // Reserve object numbers for pages and content streams
    const pageNums    = boards.map(() => nextObj());
    const contentNums = boards.map(() => nextObj());

    // Write catalog
    startObj(catNum);
    wStr(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>\n`);
    endObj();

    // Write pages parent
    startObj(pagesNum);
    wStr(`<< /Type /Pages /Kids [${pageNums.map(n=>n+' 0 R').join(' ')}] /Count ${boards.length} >>\n`);
    endObj();

    // Write font
    startObj(fontNum);
    wStr(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n`);
    endObj();

    // Write image XObjects (all stored as JPEG — DCTDecode)
    for (const xobj of imageXObjects) {
        startObj(xobj.num);
        wStr(`<< /Type /XObject /Subtype /Image /Width ${xobj.width} /Height ${xobj.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${xobj.bytes.length} >>\nstream\n`);
        wBin(xobj.bytes);
        wStr('\nendstream\n');
        endObj();
    }

    // Write each page + content stream
    for (let i = 0; i < boards.length; i++) {
        const bounds   = boards[i].rect.bounds;
        const W_pt     = r4(bounds.width  * PX_TO_PT);
        const H_pt     = r4(bounds.height * PX_TO_PT);
        const shadings = pageShadeObjs[i];
        const imageMap = pageImageMaps[i];

        // Build opacity graphics state resources (for items with opacity < 1)
        const gsEntries = [];
        for (let op = 1; op <= 99; op++) {
            gsEntries.push(`/GS${op} << /Type /ExtGState /ca ${r4(op/100)} /CA ${r4(op/100)} >>`);
        }
        const gsResource = '/ExtGState <<\n' + gsEntries.join('\n') + '\n>>';

        // Shading resources
        const shadeKeys = Object.keys(shadings);
        const shadeResource = shadeKeys.length
            ? '/Shading <<\n' + shadeKeys.map(k => `/${k} ${shadings[k]}`).join('\n') + '\n>>'
            : '';

        // Image XObject resources — include all images referenced on this page
        const imgResources = [];
        for (const entry of imageMap) {
            imgResources.push(`/${entry.xobj.name} ${entry.xobj.num} 0 R`);
        }
        const imgResource = imgResources.length
            ? '/XObject <<\n' + imgResources.join('\n') + '\n>>'
            : '';

        // Page dictionary
        startObj(pageNums[i]);
        wStr(`<< /Type /Page\n`);
        wStr(`   /Parent ${pagesNum} 0 R\n`);
        wStr(`   /MediaBox [0 0 ${W_pt} ${H_pt}]\n`);
        wStr(`   /Contents ${contentNums[i]} 0 R\n`);
        wStr(`   /Resources <<\n`);
        wStr(`      /Font << /F1 ${fontNum} 0 R >>\n`);
        wStr(`      ${gsResource}\n`);
        if (shadeResource) wStr(`      ${shadeResource}\n`);
        if (imgResource)   wStr(`      ${imgResource}\n`);
        wStr(`   >>\n>>\n`);
        endObj();

        // Content stream
        const streamStr = contentStreams[i];
        const streamBytes = new TextEncoder().encode(streamStr);
        startObj(contentNums[i]);
        wStr(`<< /Length ${streamBytes.length} >>\nstream\n`);
        wBin(streamBytes);
        wStr('\nendstream\n');
        endObj();
    }

    // ── Cross-reference table ─────────────────────────
    const xrefOffset = byteOffset;
    const totalObjs  = objNum + 1;
    let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
    for (let n = 1; n <= objNum; n++) {
        xref += `${String(offsets[n] || 0).padStart(10,'0')} 00000 n \n`;
    }
    wStr(xref);
    wStr(`trailer\n<< /Size ${totalObjs} /Root ${catNum} 0 R >>\n`);
    wStr(`startxref\n${xrefOffset}\n%%EOF\n`);

    // ── Assemble binary output ────────────────────────
    // Calculate total byte length
    let totalLen = 0;
    for (const part of pdfParts) totalLen += part.data.length;

    const finalBytes = new Uint8Array(totalLen);
    let pos = 0;
    for (const part of pdfParts) {
        if (part.type === 'str') {
            for (let i = 0; i < part.data.length; i++)
                finalBytes[pos++] = part.data.charCodeAt(i) & 0xff;
        } else {
            finalBytes.set(part.data, pos);
            pos += part.data.length;
        }
    }

    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'iGuhit-export.pdf' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// Single authoritative PDF export — iguhit-enhancements.js btn-export-pdf listener is disabled
document.getElementById('btn-export-pdf')?.addEventListener('click', exportAllArtboardsPDF);

// Wire File-menu buttons that delegate to iguhit-features.js
document.getElementById('btn-export-png-artboards')?.addEventListener('click', () => {
    if (window.exportPNGPerArtboard) window.exportPNGPerArtboard();
});
document.getElementById('btn-embed-image-menu')?.addEventListener('click', () => {
    if (window.openImageEmbed) window.openImageEmbed();
});


// =====================================================
// STROKE STYLE PANEL
// =====================================================

function applyStrokeProperties() {
    const items = getSelectedDrawItems();
    const style      = document.getElementById('stroke-style')?.value;
    const startArrow = document.getElementById('stroke-arrow-start')?.value || 'none';
    const endArrow   = document.getElementById('stroke-arrow-end')?.value   || 'none';

    items.forEach(item => {
        if (!(item instanceof paper.Path)) return;

        if (style === 'dashed') {
            item.dashArray = [10, 6];
        } else {
            item.dashArray = [];
        }

        if (!item.data) item.data = {};
        item.data.arrowStart = startArrow;
        item.data.arrowEnd   = endArrow;
    });

    saveState();
    autoSaveProject();

    // Trigger arrowhead redraw in enhancements
    if (window.redrawAllArrows) {
        setTimeout(window.redrawAllArrows, 20);
    }
    paper.view.draw();
}

document.getElementById('stroke-style')?.addEventListener(
    'change',
    applyStrokeProperties
);

document.getElementById('stroke-arrow-start')?.addEventListener(
    'change',
    applyStrokeProperties
);

document.getElementById('stroke-arrow-end')?.addEventListener(
    'change',
    applyStrokeProperties
);


// =====================================================
// AUTOSAVE
// =====================================================

function autoSaveProject() {
    try {
        localStorage.setItem(
            'iguhit-project-autosave',
            paper.project.exportJSON({ asString: true })
        );
    } catch (e) {
        console.warn(e);
    }
}

function restoreAutoSavedProject() {
    try {

        const saved = localStorage.getItem(
            'iguhit-project-autosave'
        );

        if (saved) {
            paper.project.importJSON(saved);
        }

    } catch (e) {
        console.warn(e);
    }
}

setInterval(autoSaveProject, 10000);

window.addEventListener('beforeunload', autoSaveProject);


// =====================================================
// EXPOSE GLOBALS FOR AI AGENT
// =====================================================
window.updateLayersUI         = updateLayersUI;
window.deselectAll            = deselectAll;
window.onSelectionChanged     = onSelectionChanged;
window.applyStylesToSelection = applyStylesToSelection;
window.getSelectedDrawItems   = getSelectedDrawItems;
window.getTopLevelSelectedDrawItems = getTopLevelSelectedDrawItems;
window.fitArtboardToScreen    = fitArtboardToScreen;
window.deleteSelectedItems    = deleteSelectedItems;
window.groupSelectedItems     = groupSelectedItems;
window.ungroupSelectedItems   = ungroupSelectedItems;
window.bringSelectedToFront   = bringSelectedToFront;
window.sendSelectedToBack     = sendSelectedToBack;
window.alignSelection         = alignSelection;
window.setZoomLevel           = setZoomLevel;
