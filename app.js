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
    artboardBgColor: '#ffffff'
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
            if (window.__iguhitShouldSkipDragFor && window.__iguhitShouldSkipDragFor(item, selection)) return;
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

            // Keep "Type on Circle" text glued to its path live, mid-drag —
            // not just after releasing the mouse.
            if (window.__iguhitRelayoutTypeOnPathFor) window.__iguhitRelayoutTypeOnPathFor(newScaledItem);
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
                    if (window.__iguhitHandleTypeOnPathClone) window.__iguhitHandleTypeOnPathClone(item, clone);
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
            if (window.__iguhitShouldSkipDragFor && window.__iguhitShouldSkipDragFor(item, selectedItems)) return;
            item.position = item.position.add(event.delta);
            // Keep "Type on Circle" text glued to its path live while dragging.
            if (window.__iguhitRelayoutTypeOnPathFor) window.__iguhitRelayoutTypeOnPathFor(item, event.delta);
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
        tolerance: 15,
        match: (hit) => hit.item.layer.name !== 'System Artboard' && !hit.item.layer.locked
    });
    
    if (hitResult) {
        const item = hitResult.item;
        item.selected = true;
        item.layer.activate();
        
        if (hitResult.type === 'segment' && !event.modifiers.alt && !event.modifiers.shift && !event.modifiers.control) {
            dragTargetSegment = hitResult.segment;
        } else if (hitResult.type === 'handle-out') {
            dragTargetHandle = hitResult.segment.handleOut;
        } else if (hitResult.type === 'handle-in') {
            dragTargetHandle = hitResult.segment.handleIn;

        } else if (event.modifiers.alt && event.modifiers.shift && !event.modifiers.control && hitResult.type === 'segment') {
            hitResult.segment.smooth();
        } else if (event.modifiers.alt && !event.modifiers.control && hitResult.type === 'segment') {
            hitResult.segment.handleIn = null;
        } else if (event.modifiers.shift && !event.modifiers.control && hitResult.type === 'segment') {
            hitResult.segment.handleOut = null;
        } else if (event.modifiers.control && !event.modifiers.shift && !event.modifiers.alt && hitResult.type === 'segment') {
            hitResult.segment.remove();
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
            handles: true,
            tolerance: 20
        });
        
        if (hitResult && hitResult.item === activePath && hitResult.segment === activePath.segments[0]) {
            activePath.closed = true;
            activePath.fullySelected = false;
            activePath.selected = true;
            finishActivePath();
        }else if(event.modifiers.alt){
            // hold alt then click anywhere to remove the handleOut
            //alert('you hit the alt');
            activePath.lastSegment.handleOut = null; 
        }else if(event.modifiers.shift){
            // if shift + x inside pen tool remove the last segment
            activePath.lastSegment.handleIn = null; 
        }else if(event.modifiers.control){
            // if shift + x inside pen tool remove the last segment
            activePath.lastSegment.remove(); 
        }else{    
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
function handleTypeMouseDown(event) {
    // Clicking on top of an existing text item edits it in place instead of
    // creating a new one (matches Illustrator's Type tool behavior).
    const existing = window.__iguhitFindTextAt ? window.__iguhitFindTextAt(event.point) : null;
    if (existing) {
        deselectAll();
        existing.selected = true;
        onSelectionChanged();
        if (window.__startTypeEditing) {
            window.__startTypeEditing(existing, { isNew: false });
        }
        return;
    }

    deselectAll();

    // Prefer the full Type window's current settings (family, weight,
    // italic, size, leading, tracking, alignment, color) when available so
    // a new text item picks up whatever the person last configured there;
    // otherwise fall back to the quick control bar.
    const defaults = window.__iguhitGetTypeDefaults ? window.__iguhitGetTypeDefaults() : null;

    const fontFamilyEl = document.getElementById('ctrl-font-family');
    const fontSizeEl = document.getElementById('ctrl-font-size');
    const fontWeightEl = document.getElementById('ctrl-font-weight');
    const fontStyleEl = document.getElementById('ctrl-font-style');

    const fontFamily = defaults ? defaults.fontFamily : (fontFamilyEl ? fontFamilyEl.value : 'Inter, sans-serif');
    const fontSize = defaults ? defaults.fontSize : (fontSizeEl ? (parseFloat(fontSizeEl.value) || 24) : 24);
    const fontWeightBase = defaults ? defaults.fontWeight : (fontWeightEl ? fontWeightEl.value : '600');
    const italic = defaults ? defaults.italic : (fontStyleEl ? fontStyleEl.value === 'italic' : false);
    const fontWeight = window.__composeFontWeight ? window.__composeFontWeight(fontWeightBase, italic) : fontWeightBase;
    const leadingAuto = defaults ? defaults.leadingAuto : true;
    const leading = (defaults && !leadingAuto && defaults.leading) ? defaults.leading : fontSize * 1.2;
    const tracking = defaults ? defaults.tracking : 0;
    const justification = defaults ? defaults.justification : 'left';

    // Create an empty text item and let the person type directly on the
    // canvas (in-place editor), Illustrator-style, instead of a browser prompt().
    const textItem = new paper.PointText({
        point: event.point,
        content: '',
        fontSize: fontSize,
        fontFamily: fontFamily,
        fontWeight: fontWeight,
        leading: leading,
        justification: justification
    });
    textItem.data = textItem.data || {};
    textItem.data.leadingAuto = leadingAuto;
    textItem.data.tracking = tracking;

    setupShapeStyles(textItem);
    if (defaults && defaults.fillColorHex && !state.fillColorNone) {
        textItem.fillColor = defaults.fillColorHex;
    }
    textItem.selected = true;

    onSelectionChanged();

    // Sync font controls with new item
    if (window.__syncTypeFontControls) window.__syncTypeFontControls(textItem);

    if (window.__startTypeEditing) {
        window.__startTypeEditing(textItem, { isNew: true });
    } else {
        // Fallback in case the type-panel addon failed to load
        const textVal = prompt("Enter text:", "iGuhit Vector");
        if (textVal) {
            textItem.content = textVal;
            saveState();
        } else {
            textItem.remove();
        }
    }
}

// --- LINE TOOL (\) ---
// Snaps `point` so the line from `origin` to it lands on the nearest 45°
// increment (horizontal, vertical, or diagonal) — same distance from origin,
// just rounded to the nearest of those 8 directions.
function constrainPointToAxis(origin, point) {
    const delta = point.subtract(origin);
    const distance = delta.length;
    if (distance === 0) return point;
    const angle = Math.round(delta.angle / 45) * 45;
    const rad = angle * Math.PI / 180;
    return origin.add(new paper.Point(Math.cos(rad), Math.sin(rad)).multiply(distance));
}

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
        let endPoint = event.point;
        if (event.modifiers && event.modifiers.shift) {
            endPoint = constrainPointToAxis(event.downPoint, event.point);
        }
        activePath.remove();
        activePath = new paper.Path.Line({
            from: event.downPoint,
            to: endPoint
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

    // Converts an SVG length string ("210mm", "8.5in", "595.28pt", "600",
    // "600px"...) to CSS pixels (the standard 96px/inch reference SVG and
    // CSS both use). Without this, a width like "210mm" — completely
    // typical from Illustrator/Inkscape/Figma exports — was being read as
    // a bare number and misinterpreted as 210 raw pixels instead of ~794.
    function parseSvgLength(str) {
        if (!str) return null;
        const m = /^\s*([\-\d.eE+]+)\s*(px|pt|pc|in|mm|cm|em|ex|%)?\s*$/.exec(str);
        if (!m) return null;
        const num = parseFloat(m[1]);
        if (!isFinite(num)) return null;
        const unit = (m[2] || 'px').toLowerCase();
        switch (unit) {
            case 'px': return num;
            case 'in': return num * 96;
            case 'cm': return num * 96 / 2.54;
            case 'mm': return num * 96 / 25.4;
            case 'pt': return num * 96 / 72;
            case 'pc': return num * 16;
            case '%':  return null; // relative — can't resolve without a reference size
            default:   return num;  // em/ex — not reliably resolvable, best-effort as px
        }
    }

    function parseSvgDimensions(svgText) {
        let svgWidth = 800, svgHeight = 600;
        let viewBoxWidth = null, viewBoxHeight = null;
        try {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgElement = svgDoc.documentElement;
            const viewBox = svgElement.getAttribute('viewBox');

            // Start from the viewBox's own coordinate size — the right
            // fallback for SVGs with no absolute width/height (or a
            // percentage one), which is common for programmatically
            // generated SVGs and this app's own exports.
            if (viewBox) {
                const parts = viewBox.split(/[ ,]+/);
                if (parts.length === 4) {
                    const vbW = parseFloat(parts[2]), vbH = parseFloat(parts[3]);
                    if (isFinite(vbW) && vbW > 0) { viewBoxWidth = vbW; svgWidth = vbW; }
                    if (isFinite(vbH) && vbH > 0) { viewBoxHeight = vbH; svgHeight = vbH; }
                }
            }

            // width/height — properly unit-converted — represent the SVG's
            // intended physical canvas size and take priority when given as
            // an absolute length. Note this can be a DIFFERENT numeric scale
            // than the viewBox (e.g. viewBox="0 0 100 100" width="500px") —
            // paper.js's importer uses the viewBox's raw numbers as the
            // imported content's actual size and does not itself apply this
            // scaling, so we correct for it after import (see below).
            const parsedW = parseSvgLength(svgElement.getAttribute('width'));
            const parsedH = parseSvgLength(svgElement.getAttribute('height'));
            if (parsedW && parsedW > 0) svgWidth = parsedW;
            if (parsedH && parsedH > 0) svgHeight = parsedH;
        } catch (err) {
            console.error("Error parsing SVG dimensions:", err);
        }
        if (!isFinite(svgWidth) || svgWidth <= 0) svgWidth = 800;
        if (!isFinite(svgHeight) || svgHeight <= 0) svgHeight = 600;
        return { width: svgWidth, height: svgHeight, viewBoxWidth, viewBoxHeight };
    }
    window.__iguhitParseSvgDimensions = parseSvgDimensions;

    // paper.js's SVG importer positions/sizes content using the viewBox's
    // raw coordinate numbers as-is — it does NOT itself apply the standard
    // viewBox→width/height scale an SVG declares (e.g. viewBox="0 0 100 100"
    // width="500px" should render 5x larger than the raw 100×100 numbers).
    // Without this correction, importing such a file produces a correctly
    // life-size ARTBOARD but tiny/oversized CONTENT. Uses "meet" scaling
    // (uniform, fits within bounds) to match the SVG default preserveAspectRatio.
    function correctSvgImportScale(item, dims) {
        if (!item || !dims || !dims.viewBoxWidth || !dims.viewBoxHeight) return;
        const scaleX = dims.width / dims.viewBoxWidth;
        const scaleY = dims.height / dims.viewBoxHeight;
        const uniformScale = Math.min(scaleX, scaleY);
        if (isFinite(uniformScale) && uniformScale > 0 && Math.abs(uniformScale - 1) > 0.01) {
            item.scale(uniformScale);
        }
    }
    window.__iguhitCorrectSvgImportScale = correctSvgImportScale;

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
                const dims = parseSvgDimensions(text);
                const svgWidth = dims.width, svgHeight = dims.height;
                
                // Reset artboard background color to default white before applying SVG's
                state.artboardBgColor = '#ffffff';
                
                // Update workspace artboard size to match the imported SVG
                updateArtboardSize(svgWidth, svgHeight);
                syncArtboardInputs();
                
                paper.project.importSVG(text, {
                    expandShapes: false,
                    insert: true,
                    onLoad: (item) => {
                        // Correct for paper.js importing at the SVG's raw
                        // viewBox coordinate scale instead of its declared
                        // physical size — must happen before anything below
                        // compares the item's bounds to svgWidth/svgHeight.
                        correctSvgImportScale(item, dims);

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

    // paper.js's exportSVG() has two problems with our text items:
    //  1. A PointText's raw content goes straight into one <text> node, and
    //     SVG doesn't treat embedded "\n" as a line break, so multi-line
    //     text collapses onto a single line.
    //  2. It serializes whatever item.fontFamily/fontWeight happen to be —
    //     but our italic support works by composing italic into the
    //     fontWeight string ("italic 600") for canvas's benefit, which is
    //     not a valid SVG font-weight value, and custom-imported/Google
    //     Fonts may not round-trip through its default serialization.
    // Fixed by temporarily expanding every PointText into one clone per
    // line (correctly offset along the text's own rotation), each tagged
    // with a throwaway name so paper.js writes it out as an id we can find
    // afterward, then explicitly setting a correct font-family / numeric
    // font-weight / font-style on each one directly in the SVG DOM.
    function withTextExportFixes(svgOptions) {
        const restorations = [];
        const fixups = []; // { id, fontFamily, weight, italic, colorHex }
        let tempIdCounter = 0;

        try {
            const allText = paper.project.getItems({ class: paper.PointText });
            allText.forEach(item => {
                const content = item.content || '';
                const lines = content.indexOf('\n') !== -1 ? content.split('\n') : [content];
                const leading = item.leading || (item.fontSize * 1.2);
                const parent = item.parent;
                if (!parent) return;
                const index = parent.children.indexOf(item);

                const decomposed = window.__decomposeFontWeight
                    ? window.__decomposeFontWeight(item.fontWeight)
                    : { weight: item.fontWeight, italic: false };
                const colorHex = item.fillColor ? item.fillColor.toCSS(true) : '#000000';

                let scaleY = 1, rotation = 0;
                try {
                    if (item.matrix && typeof item.matrix.decompose === 'function') {
                        const dec = item.matrix.decompose();
                        if (dec) {
                            scaleY = (dec.scaling && typeof dec.scaling.y === 'number') ? dec.scaling.y : 1;
                            rotation = dec.rotation || 0;
                        }
                    }
                } catch (e) {}

                const group = new paper.Group();
                lines.forEach((line, i) => {
                    const lineItem = item.clone({ insert: false });
                    lineItem.content = line;
                    lineItem.fontWeight = decomposed.weight; // strip the italic hack — plain numeric weight only
                    if (i > 0) {
                        const localOffset = new paper.Point(0, i * leading * scaleY);
                        lineItem.translate(localOffset.rotate(rotation));
                    }
                    const tempId = '__iguhit_txt_' + (tempIdCounter++);
                    lineItem.name = tempId;
                    fixups.push({ id: tempId, fontFamily: item.fontFamily, weight: decomposed.weight, italic: decomposed.italic, colorHex });
                    group.addChild(lineItem);
                });

                parent.insertChild(index, group);
                item.remove();
                restorations.push({ group, original: item, parent, index });
            });

            const svgEl = paper.project.exportSVG(Object.assign({}, svgOptions, { asString: false }));

            fixups.forEach(f => {
                const escId = (window.CSS && CSS.escape) ? CSS.escape(f.id) : f.id;
                const el = svgEl.querySelector ? svgEl.querySelector('#' + escId) : null;
                if (!el) return;
                const family = String(f.fontFamily || 'sans-serif').replace(/"/g, "'");
                const style = 'font-family:' + family + ';' +
                    'font-weight:' + f.weight + ';' +
                    'font-style:' + (f.italic ? 'italic' : 'normal') + ';' +
                    'fill:' + f.colorHex + ';';
                el.setAttribute('style', style);
                el.setAttribute('font-family', family);
                el.setAttribute('font-weight', f.weight);
                if (f.italic) el.setAttribute('font-style', 'italic');
                el.removeAttribute('id');
            });

            return new XMLSerializer().serializeToString(svgEl);
        } finally {
            restorations.forEach(r => {
                r.group.remove();
                r.parent.insertChild(r.index, r.original);
            });
        }
    }
    window.__iguhitWithTextExportFixes = withTextExportFixes;

    // Save SVG file download trigger (clean crop)
    document.getElementById('btn-export-svg').addEventListener('click', () => {
        deselectAll();
        
        // Hide visual artboard helpers for clean SVG content
        const artboardVisible = artboardLayer.visible;
        artboardLayer.visible = false;
        paper.view.draw();
        
        const svgStr = withTextExportFixes({
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
        
        const cleanSVGStr = withTextExportFixes({
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
            if (window.__iguhitHandleTypeOnPathClone) window.__iguhitHandleTypeOnPathClone(item, clone);
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
var baseItem = null;

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

    var hitResult = paper.project.hitTest(event.point, {
        fill: true,
        stroke: true,
        tolerance: 2
    });

    if (hitResult && hitResult.item && !event.modifiers.alt) {
        var hitItem = hitResult.item;
        // Verify the clicked item is in your array
        if (items.indexOf(hitItem) !== -1) {
            baseItem = hitItem;
           // baseItem.fillColor = 'red'; // Active color feedback
        }
    }else if(hitResult && hitResult.item && event.modifiers.alt){
        var hitItem = hitResult.item;
        // Verify the clicked item is in your array
        if (items.indexOf(hitItem) !== -1) {
            baseItem = hitItem;
            //alert('alt detected',baseItem);
           // baseItem.fillColor = 'red'; // Active color feedback
            console.log(items,baseItem);
            items.forEach((item)=>{
                if (item !== baseItem){
                    item.subtract(baseItem);
                    item.remove();
                }
            });
        }
    }
}

function handleShapeBuilderMouseDrag(event) {
    const items = getShapeBuilderItems();
    // If they didn't start the drag on a valid path, don't do anything
    if (!baseItem) return;

    var hitResult = paper.project.hitTest(event.point, {
        fill: true,
        stroke: true,
        tolerance: 5 // Slightly higher tolerance makes dragging over items easier
    });

    if (!hitResult || !hitResult.item) return;

    var hitItem = hitResult.item;
    var itemIndex = items.indexOf(hitItem);

    // If we drag over a valid path in our array that isn't our current base
    if (itemIndex !== -1 && hitItem !== baseItem) {
        
        // Merge them together
        var unitedPath = baseItem.unite(hitItem);

        // Clean up the old geometry from the canvas canvas
        baseItem.remove();
        hitItem.remove();

        // Remove the consumed item from the tracking array
        items.splice(itemIndex, 1);

        // Update our base reference to the newly expanded shape
        baseItem = unitedPath;
        //baseItem.fillColor = 'red'; 

        // Keep the tracking array updated with the new path shape
        var baseIndex = items.indexOf(baseItem);
        if (baseIndex === -1) {
            items.push(baseItem);
        }
    }
}

function handleShapeBuilderMouseUp(event) {
    if (baseItem) {
        //baseItem.fillColor = 'blue'; // Reset to finished state color
        baseItem = null; // Clear reference until the next click-and-drag
    }

    saveState();
    updateLayersUI();
    paper.view.draw();

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
            const dims = window.__iguhitParseSvgDimensions ? window.__iguhitParseSvgDimensions(content) : null;
            if (dims && window.updateArtboardSize) {
                state.artboardBgColor = state.artboardBgColor || '#ffffff';
                updateArtboardSize(dims.width, dims.height);
                if (window.syncArtboardInputs) syncArtboardInputs();
            }
            paper.project.importSVG(content, {
                expandShapes: false,
                onLoad: (item) => {
                    if (dims && window.__iguhitCorrectSvgImportScale) window.__iguhitCorrectSvgImportScale(item, dims);
                    item.position = dims
                        ? new paper.Point(200 + dims.width / 2, 150 + dims.height / 2)
                        : paper.view.center;
                    if (window.fitArtboardToScreen) fitArtboardToScreen();
                    saveState();
                    paper.view.draw();
                }
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
function buildIguhitFileBlob() {
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
    return new Blob([json], { type: 'application/json' });
}

function saveIguhitFile() {
    const blob = buildIguhitFileBlob();
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

                // Restore layers/artwork — remove EVERY existing layer first
                // (including the old "System Artboard" layer) so importJSON
                // rebuilds the whole project fresh from the file, rather
                // than leaving a stale pre-load layer sitting alongside a
                // freshly-imported one of the same name.
                if (data.layers) {
                    paper.project.layers.slice().forEach(l => l.remove());
                    paper.project.importJSON(data.layers);
                }

                // Re-link this app's layer/artboard bookkeeping to whatever
                // importJSON actually restored, instead of creating brand
                // new artboard objects on top of it — those would never get
                // inserted into the right layer and would silently vanish
                // from things like PDF export while still LOOKING fine
                // (since the real, correctly-restored ones render normally).
                artboardLayer = paper.project.layers.find(l => l.name === 'System Artboard') || artboardLayer;
                window.artboardLayer = artboardLayer;
                drawLayer = paper.project.layers.find(l => l.name !== 'System Artboard') || drawLayer;
                window.drawLayer = drawLayer;

                if (data.artboards && artboardLayer) {
                    artboardLayer.locked = false;

                    let mainRect = artboardLayer.children.find
                        ? artboardLayer.children.find(c => c.name === 'artboardRect')
                        : null;
                    if (!mainRect) {
                        const named = paper.project.getItems({ match: (i) => i.name === 'artboardRect' });
                        mainRect = named && named.length ? named[0] : null;
                    }
                    if (mainRect) {
                        window.artboardRect = mainRect;
                        window.artboardShadow = artboardLayer.children.find
                            ? artboardLayer.children.find(c => c.name === 'artboardShadow')
                            : window.artboardShadow;
                        window.gridGroup = artboardLayer.children.find
                            ? artboardLayer.children.find(c => c.name === 'gridGroup')
                            : window.gridGroup;
                        state.artboardWidth = mainRect.bounds.width;
                        state.artboardHeight = mainRect.bounds.height;
                    } else {
                        // Truly nothing restored (very old/corrupt file) — fall
                        // back to building a fresh main artboard.
                        const mainMeta = data.artboards.find(ab => ab.isMain);
                        updateArtboardSize((mainMeta && mainMeta.w) || state.artboardWidth, (mainMeta && mainMeta.h) || state.artboardHeight);
                    }

                    window.multiArtboards = [];
                    const restoredGroups = paper.project.getItems({ match: (i) => i.data && i.data.isArtboard });
                    restoredGroups.forEach((g) => {
                        const rect = (g.children && g.children.length > 1) ? g.children[1] : null;
                        if (!rect || rect === mainRect) return; // the main artboard isn't one of these groups
                        window.multiArtboards.push({ group: g, rect: rect, shadow: g.children[0], grid: g.children[2] });
                    });

                    artboardLayer.locked = true;
                    if (drawLayer) drawLayer.activate();
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

// Shared 2-column grid layout used for placing secondary artboards —
// column 1 = right of main, then rows fill left-then-right below it. Used
// by both the "Add Artboard" button and PDF import, so artboards from
// either source always line up consistently and continue from wherever
// the other left off.
function computeNextArtboardGridPosition(extraCount, cellW, cellH) {
    const SPACING_X = 80, SPACING_Y = 100;
    const ORIGIN_X = 200, ORIGIN_Y = 150;
    let col, row;
    if (extraCount === 0) {
        col = 1; row = 0; // first secondary goes right of main
    } else {
        const pairIndex = extraCount;
        row = Math.ceil(pairIndex / 2);
        col = (pairIndex % 2 === 1) ? 0 : 1;
    }
    return { x: ORIGIN_X + col * (cellW + SPACING_X), y: ORIGIN_Y + row * (cellH + SPACING_Y) };
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
    const AW = state.artboardWidth;
    const AH = state.artboardHeight;

    const extraCount = window.multiArtboards.filter(a => !a.isMain).length;
    const { x, y } = computeNextArtboardGridPosition(extraCount, AW, AH);

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
// EXPORT MULTI ARTBOARD PDF — Pure-JS Raw Vector PDF
// Writes real PDF path operators (m l c h S f etc.)
// directly from Paper.js path data. No external library
// beyond jsPDF for the file wrapper. Opens in Illustrator
// as fully editable vector objects.
// =====================================================

function buildPdfBlob() {
    // ── Collect artboards ──────────────────────────────
    const boards = [];

    // Always find the main artboard fresh from the layer to avoid stale references
    const mainRect = window.artboardRect && window.artboardRect.isInserted()
        ? window.artboardRect
        : (window.artboardLayer
            ? window.artboardLayer.children['artboardRect'] || 
              window.artboardLayer.children.find?.(c => c.name === 'artboardRect')
            : null);

    if (mainRect && mainRect.isInserted()) {
        boards.push({ rect: mainRect, name: 'Artboard 1' });
    }
    if (window.multiArtboards && window.multiArtboards.length > 0) {
        window.multiArtboards.forEach((ab, i) => {
            if (ab.isMain) return; // skip isMain alias — main artboard already added above
            if (ab.rect && ab.rect.isInserted())
                boards.push({ rect: ab.rect, name: 'Artboard ' + (i + 2) });
        });
    }
    if (!boards.length) {
        // Bookkeeping (window.artboardRect / window.multiArtboards) can go
        // stale after undo/redo or layer changes. Fall back to scanning the
        // live document directly for anything flagged as an artboard.
        try {
            const artboardGroups = paper.project.getItems({ match: (i) => i.data && i.data.isArtboard });
            artboardGroups.forEach((g, idx) => {
                // Artboard groups are built as [shadow, rect, grid] (see createArtboardObject)
                const rect = (g.children && g.children.length > 1) ? g.children[1] : null;
                if (rect && rect.isInserted()) boards.push({ rect, name: 'Artboard ' + (idx + 1) });
            });
        } catch (e) {}
    }

    if (!boards.length) {
        // Still nothing on the page — auto-create a default artboard sized
        // to fit whatever artwork already exists, instead of blocking export.
        try {
            const contentItems = paper.project.getItems({
                match: (i) => !i.guide && !(i.data && i.data.isArtboard) && !(i.data && i.data.isSelectionHelper) &&
                               i.bounds && i.bounds.width > 0 && i.bounds.height > 0 &&
                               (i instanceof paper.Path || i instanceof paper.CompoundPath ||
                                i instanceof paper.PointText || i instanceof paper.Raster ||
                                (i instanceof paper.Group && i.parent && i.parent === (window.drawLayer || i.parent)))
            });
            let bx = 0, by = 0, bw = state.artboardWidth || 800, bh = state.artboardHeight || 600;
            if (contentItems.length) {
                let unionBounds = contentItems[0].bounds.clone();
                contentItems.forEach(i => { unionBounds = unionBounds.unite(i.bounds); });
                const pad = 40;
                bx = unionBounds.x - pad;
                by = unionBounds.y - pad;
                bw = Math.max(50, unionBounds.width + pad * 2);
                bh = Math.max(50, unionBounds.height + pad * 2);
            }
            const created = createArtboardObject(bx, by, bw, bh);
            created.rect.name = 'artboardRect';
            if (window.artboardLayer) {
                const wasLocked = window.artboardLayer.locked;
                window.artboardLayer.locked = false;
                window.artboardLayer.addChild(created.group);
                window.artboardLayer.locked = wasLocked;
            } else {
                paper.project.activeLayer.addChild(created.group);
            }
            window.artboardRect = created.rect;
            paper.view.draw();
            boards.push({ rect: created.rect, name: 'Artboard 1' });
        } catch (e) {
            console.warn('Auto-artboard creation failed:', e);
        }
    }

    if (!boards.length) { alert('No artboard found. Please check your artboard is visible.'); return; }

    // ── Colour helpers ─────────────────────────────────
    function paperColorToRGB(c) {
        if (!c) return null;
        // Gradient colour — cannot convert directly
        if (c.type === 'gradient' || (c.gradient)) return null;
        try {
            const rgb = c.convert('rgb');
            return [
                Math.max(0, Math.min(1, rgb.red   || 0)),
                Math.max(0, Math.min(1, rgb.green  || 0)),
                Math.max(0, Math.min(1, rgb.blue   || 0))
            ];
        } catch (_) { return null; }
    }

    // Resolve any Paper.js Color to an RGB triple safely
    function safeRGB(c, fallback) {
        const r = paperColorToRGB(c);
        return r || (fallback || [0, 0, 0]);
    }

    function r3(n) { return +n.toFixed(4); }
    function tx(px, ox) { return r3(px - ox); }
    function ty(py, oy, ph) { return r3(ph - (py - oy)); }

    // Check if a Paper.js Color is a gradient
    function isGradient(c) {
        return c && (c.type === 'gradient' || c.gradient != null);
    }

    // Extract gradient stops as [[r,g,b], offset] pairs
    function getGradientStops(c) {
        if (!c || !c.gradient || !c.gradient.stops) return [[0,0,0],[1,1,1]];
        return c.gradient.stops.map(stop => {
            let color, offset;
            if (Array.isArray(stop)) {
                color  = stop[0];
                offset = stop[1] != null ? stop[1] : 0;
            } else if (stop && stop.color !== undefined) {
                color  = stop.color;
                offset = stop.offset != null ? stop.offset : 0;
            } else {
                color  = stop;
                offset = 0;
            }
            let rgb = [0, 0, 0];
            try {
                if (typeof color === 'string') {
                    const pc = new paper.Color(color);
                    rgb = [pc.red || 0, pc.green || 0, pc.blue || 0];
                } else if (color && typeof color === 'object') {
                    const pc = color.convert ? color.convert('rgb') : color;
                    rgb = [pc.red || 0, pc.green || 0, pc.blue || 0];
                }
            } catch(_) {}
            return { rgb, offset: +offset };
        });
    }

    // ── PDF SHading (gradient) support ─────────────────
    // We collect shading dicts and XObjects per page, then embed them.
    let shadingCounter = 0;
    const pageShading = []; // per-board: { dicts: {}, ops: [] }

    // Build a PDF Shading dict string and return a /SH name
    function buildShading(fillColor, item, ox, oy, ph, shadings) {
        if (!isGradient(fillColor)) return null;
        const isRadial = fillColor.gradient && fillColor.gradient.radial;
        const stops    = getGradientStops(fillColor);
        if (!stops || stops.length < 2) return null;

        // Get origin and destination in PDF coords
        let x0, y0, x1, y1;
        try {
            x0 = tx(fillColor.origin.x,      ox);
            y0 = ty(fillColor.origin.y,      oy, ph);
            x1 = tx(fillColor.destination.x, ox);
            y1 = ty(fillColor.destination.y, oy, ph);
        } catch(_) {
            // Fall back to item bounding box
            const b = item.bounds;
            x0 = tx(b.x,           ox); y0 = ty(b.y + b.height, oy, ph);
            x1 = tx(b.x + b.width, ox); y1 = ty(b.y,            oy, ph);
        }

        const shName = `SH${++shadingCounter}`;

        // Build a Function type 3 (stitching) or type 2 (single interval)
        // For simplicity we use type 2 between first and last stop
        const c0 = stops[0].rgb.map(r3).join(' ');
        const c1 = stops[stops.length - 1].rgb.map(r3).join(' ');

        let dictStr;
        if (isRadial) {
            const r = Math.sqrt((x1-x0)*(x1-x0)+(y1-y0)*(y1-y0));
            dictStr = [
                `<< /ShadingType 3`,
                `/ColorSpace /DeviceRGB`,
                `/Coords [${r3(x0)} ${r3(y0)} 0 ${r3(x0)} ${r3(y0)} ${r3(r)}]`,
                `/Function << /FunctionType 2 /Domain [0 1] /C0 [${c0}] /C1 [${c1}] /N 1 >>`,
                `/Extend [true true]`,
                `>>`
            ].join('\n');
        } else {
            dictStr = [
                `<< /ShadingType 2`,
                `/ColorSpace /DeviceRGB`,
                `/Coords [${r3(x0)} ${r3(y0)} ${r3(x1)} ${r3(y1)}]`,
                `/Function << /FunctionType 2 /Domain [0 1] /C0 [${c0}] /C1 [${c1}] /N 1 >>`,
                `/Extend [true true]`,
                `>>`
            ].join('\n');
        }

        shadings[shName] = dictStr;
        return shName;
    }

    // ── PDF font mapping ───────────────────────────────
    // Standard PDF base-14 fonts need no embedding and are always available
    // in any PDF viewer. We map each text item's family/weight/italic onto
    // the closest match so bold, italic, and serif/sans/monospace choices
    // all survive export (full custom-font embedding is out of scope here).
    const PDF_BASE_FONTS = [
        'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
        'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
        'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'
    ];

    function resolvePdfFont(item) {
        const family = (item.fontFamily || '').toLowerCase();
        const decomposed = window.__decomposeFontWeight
            ? window.__decomposeFontWeight(item.fontWeight)
            : { weight: item.fontWeight, italic: false };
        const weightNum = parseInt(decomposed.weight, 10) || 400;
        const isBold = weightNum >= 700; // Bold/Black map to a true Bold PDF font
        const isItalic = !!decomposed.italic;

        let group = 'Helvetica';
        if (/times|georgia|palatino|garamond|playfair|serif/.test(family)) {
            group = 'Times';
        } else if (/courier|monospace/.test(family)) {
            group = 'Courier';
        }

        let baseFont;
        if (group === 'Times') {
            baseFont = isBold && isItalic ? 'Times-BoldItalic' : isBold ? 'Times-Bold' : isItalic ? 'Times-Italic' : 'Times-Roman';
        } else if (group === 'Courier') {
            baseFont = isBold && isItalic ? 'Courier-BoldOblique' : isBold ? 'Courier-Bold' : isItalic ? 'Courier-Oblique' : 'Courier';
        } else {
            baseFont = isBold && isItalic ? 'Helvetica-BoldOblique' : isBold ? 'Helvetica-Bold' : isItalic ? 'Helvetica-Oblique' : 'Helvetica';
        }

        const idx = PDF_BASE_FONTS.indexOf(baseFont);
        return { resource: 'F' + (idx + 1), baseFont: baseFont };
    }

    // Approximate on-screen line width (for center/right alignment) using
    // the same font the person picked, via an offscreen canvas. The PDF's
    // substituted base-14 font has slightly different metrics, but this is
    // close enough to keep multi-line alignment visually correct.
    const __pdfMeasureCanvas = document.createElement('canvas');
    const __pdfMeasureCtx = __pdfMeasureCanvas.getContext('2d');
    function measureLineWidth(text, item) {
        try {
            const decomposed = window.__decomposeFontWeight
                ? window.__decomposeFontWeight(item.fontWeight)
                : { weight: item.fontWeight, italic: false };
            const style = decomposed.italic ? 'italic ' : '';
            __pdfMeasureCtx.font = `${style}${decomposed.weight} ${item.fontSize || 12}px ${item.fontFamily || 'sans-serif'}`;
            return __pdfMeasureCtx.measureText(text).width;
        } catch (e) {
            return text.length * (item.fontSize || 12) * 0.55;
        }
    }

    // ── Text rasterization (font fidelity) ─────────────
    // PDF's built-in fonts are limited to 14 standard faces with no
    // embedding here, so a custom/web font (Poppins, Playfair, etc.) can
    // never be reproduced with real PDF text. Instead we render the text
    // exactly as the browser draws it — same font, weight, italic,
    // tracking, leading, and alignment — onto an offscreen canvas, and
    // embed that as an image. This guarantees the export always matches
    // what's on the canvas, at the cost of the text no longer being
    // selectable in the PDF.
    //
    // The supersample factor is computed relative to PDF_PPI (declared
    // further below, but available here via closure by the time this
    // actually runs) rather than fixed, because canvas-pixel units are
    // scaled down by PX_TO_PT = 72/PDF_PPI on export. A fixed low factor
    // looked crisp on a 300ppi artboard but soft on anything set lower —
    // this guarantees a solid target resolution either way.
    const PDF_TEXT_TARGET_DPI = 900;

    function getTextSupersampleFactor() {
        const ppi = (typeof PDF_PPI !== 'undefined' && PDF_PPI) ? PDF_PPI : (state.artboardResolution || 300);
        return Math.min(12, Math.max(4, Math.ceil(PDF_TEXT_TARGET_DPI / ppi)));
    }

    function bytesToBinaryString(bytes) {
        let result = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            result += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return result;
    }

    function rasterizeTextItem(item) {
        try {
            let QS = getTextSupersampleFactor();
            const fontSize = item.fontSize || 12;
            const leading = item.leading || (fontSize * 1.2);
            const lines = String(item.content || '').split('\n');
            if (!lines.length || lines.every(l => !l)) return null;

            const decomposed = window.__decomposeFontWeight
                ? window.__decomposeFontWeight(item.fontWeight)
                : { weight: item.fontWeight, italic: false };
            const style = decomposed.italic ? 'italic ' : '';
            const justification = item.justification || 'left';
            const tracking = (item.data && item.data.tracking) || 0;
            const measureCtx = __pdfMeasureCtx;
            const letterSpacingSupported = 'letterSpacing' in measureCtx;

            // Safety cap: keeps any single text item's raster — and by
            // extension the whole assembled PDF's total size — from
            // ballooning out of control on long/large text combined with
            // high supersampling. This is also what keeps a multi-artboard
            // export well clear of the "Invalid string length" ceiling on
            // the final assembled file. Bounded to 2 attempts: measure once,
            // shrink QS proportionally if too big, measure again.
            const MAX_RASTER_PIXELS = 6000000; // ~2450×2450

            let canvasW, canvasH, ascent, padX, padTop, trackPx, fontStr;
            for (let attempt = 0; attempt < 2; attempt++) {
                fontStr = `${style}${decomposed.weight} ${fontSize * QS}px ${item.fontFamily || 'sans-serif'}`;
                measureCtx.font = fontStr;
                trackPx = tracking ? (tracking / 1000) * fontSize * QS : 0;
                if (letterSpacingSupported) {
                    try { measureCtx.letterSpacing = trackPx + 'px'; } catch (e) {}
                }

                let maxWidth = 0;
                lines.forEach(line => { maxWidth = Math.max(maxWidth, measureCtx.measureText(line || ' ').width); });
                const firstMetrics = measureCtx.measureText(lines[0] || 'Mg');
                ascent = firstMetrics.actualBoundingBoxAscent || fontSize * QS * 0.8;
                const descentLast = fontSize * QS * 0.35; // room for descenders on the last line

                padX = fontSize * QS * 0.15;
                padTop = fontSize * QS * 0.12;
                canvasW = Math.max(1, Math.ceil(maxWidth + padX * 2));
                canvasH = Math.max(1, Math.ceil(ascent + padTop + leading * QS * (lines.length - 1) + descentLast));

                const area = canvasW * canvasH;
                if (area <= MAX_RASTER_PIXELS || attempt === 1) break;
                QS = Math.max(2, Math.floor(QS * Math.sqrt(MAX_RASTER_PIXELS / area)));
            }

            const canvas = document.createElement('canvas');
            canvas.width = canvasW;
            canvas.height = canvasH;
            const ctx = canvas.getContext('2d');
            ctx.font = fontStr;
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = justification === 'center' ? 'center' : justification === 'right' ? 'right' : 'left';
            if (letterSpacingSupported) {
                try { ctx.letterSpacing = trackPx + 'px'; } catch (e) {}
            }
            const fill = safeRGB(item.fillColor, [0, 0, 0]);
            ctx.fillStyle = `rgb(${Math.round(fill[0] * 255)}, ${Math.round(fill[1] * 255)}, ${Math.round(fill[2] * 255)})`;

            const anchorX = justification === 'center' ? canvasW / 2 : justification === 'right' ? (canvasW - padX) : padX;
            const anchorY = padTop + ascent;


            lines.forEach((line, i) => {
                ctx.fillText(line, anchorX, anchorY + i * leading * QS);
            });

            const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
            const src = imgData.data; // RGBA, row-major, top row first
            const pixelCount = canvasW * canvasH;
            const rgb = new Uint8Array(pixelCount * 3);
            const alpha = new Uint8Array(pixelCount);
            for (let p = 0, s = 0; p < pixelCount; p++, s += 4) {
                rgb[p * 3] = src[s];
                rgb[p * 3 + 1] = src[s + 1];
                rgb[p * 3 + 2] = src[s + 2];
                alpha[p] = src[s + 3];
            }

            return {
                rw: canvasW,
                rh: canvasH,
                rgbBytes: bytesToBinaryString(rgb),
                alphaBytes: bytesToBinaryString(alpha),
                localAnchorX: anchorX / QS,
                localAnchorY: anchorY / QS,
                localW: canvasW / QS,
                localH: canvasH / QS
            };
        } catch (e) {
            console.warn('Text rasterization failed, falling back to vector text:', e);
            return null;
        }
    }

    // ── PDF coordinate transform ───────────────────────
    // ── Convert one Paper.js item to PDF content stream ops ──
    function itemToOps(item, ox, oy, ph, shadings, images) {
        const ops = [];

        if (!item.visible || item.opacity === 0) return ops;

        const opacity = item.opacity != null ? item.opacity : 1;
        if (opacity < 1) ops.push(`q\n/GS${Math.round(opacity * 100)} gs`);

        if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
            const paths = item instanceof paper.CompoundPath
                ? item.children : [item];

            // Build path data
            let pd = '';
            for (const path of paths) {
                if (!path.segments || !path.segments.length) continue;
                const segs = path.segments;
                const fp = segs[0].point;
                pd += `${tx(fp.x, ox)} ${ty(fp.y, oy, ph)} m\n`;

                for (let s = 1; s < segs.length; s++) {
                    const prev = segs[s - 1];
                    const curr = segs[s];
                    const ho   = prev.handleOut;
                    const hi   = curr.handleIn;
                    if ((ho && (ho.x !== 0 || ho.y !== 0)) ||
                        (hi && (hi.x !== 0 || hi.y !== 0))) {
                        const c1x = tx(prev.point.x + (ho ? ho.x : 0), ox);
                        const c1y = ty(prev.point.y + (ho ? ho.y : 0), oy, ph);
                        const c2x = tx(curr.point.x + (hi ? hi.x : 0), ox);
                        const c2y = ty(curr.point.y + (hi ? hi.y : 0), oy, ph);
                        const ex  = tx(curr.point.x, ox);
                        const ey  = ty(curr.point.y, oy, ph);
                        pd += `${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey} c\n`;
                    } else {
                        pd += `${tx(curr.point.x, ox)} ${ty(curr.point.y, oy, ph)} l\n`;
                    }
                }

                if (path.closed && segs.length > 1) {
                    const last   = segs[segs.length - 1];
                    const first2 = segs[0];
                    const ho = last.handleOut;
                    const hi = first2.handleIn;
                    if ((ho && (ho.x !== 0 || ho.y !== 0)) ||
                        (hi && (hi.x !== 0 || hi.y !== 0))) {
                        const c1x = tx(last.point.x + (ho ? ho.x : 0), ox);
                        const c1y = ty(last.point.y + (ho ? ho.y : 0), oy, ph);
                        const c2x = tx(first2.point.x + (hi ? hi.x : 0), ox);
                        const c2y = ty(first2.point.y + (hi ? hi.y : 0), oy, ph);
                        const ex  = tx(first2.point.x, ox);
                        const ey  = ty(first2.point.y, oy, ph);
                        pd += `${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey} c\n`;
                    }
                    pd += 'h\n';
                }
            }

            if (!pd.trim()) { if (opacity < 1) ops.push('Q'); return ops; }

            const hasFillGrad   = isGradient(item.fillColor);
            const fill          = hasFillGrad ? null : paperColorToRGB(item.fillColor);
            const stroke        = paperColorToRGB(item.strokeColor);
            const sw            = item.strokeWidth || 0;

            if (hasFillGrad) {
                // Render gradient fill via PDF shading:
                // 1. Clip to path, 2. Paint shading, 3. Restore
                const shName = buildShading(item.fillColor, item, ox, oy, ph, shadings);
                if (shName) {
                    ops.push('q');            // save
                    ops.push(pd.trim());      // path
                    ops.push('W n');          // clip to path, no fill
                    ops.push(`/${shName} sh`);// paint shading
                    ops.push('Q');            // restore
                }
                // Now draw stroke if any
                if (stroke && sw > 0) {
                    ops.push(pd.trim());
                    ops.push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG`);
                    ops.push(`${r3(sw)} w`);
                    if (item.dashArray && item.dashArray.length) {
                        ops.push(`[${item.dashArray.join(' ')}] 0 d`);
                    }
                    ops.push('S');
                }
            } else {
                ops.push(pd.trim());
                if (fill && stroke && sw > 0) {
                    ops.push(`${fill[0]} ${fill[1]} ${fill[2]} rg`);
                    ops.push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG`);
                    ops.push(`${r3(sw)} w`);
                    if (item.dashArray && item.dashArray.length) {
                        ops.push(`[${item.dashArray.join(' ')}] 0 d`);
                    }
                    ops.push('B');
                } else if (fill) {
                    ops.push(`${fill[0]} ${fill[1]} ${fill[2]} rg`);
                    ops.push('f');
                } else if (stroke && sw > 0) {
                    ops.push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG`);
                    ops.push(`${r3(sw)} w`);
                    if (item.dashArray && item.dashArray.length) {
                        ops.push(`[${item.dashArray.join(' ')}] 0 d`);
                    }
                    ops.push('S');
                } else {
                    ops.push('n');
                }
            }

        } else if (item instanceof paper.PointText) {
            // Decompose the item's own transform (rotation/scale applied via
            // the selection tool's handles) so it survives export — PointText
            // keeps these in a separate matrix rather than baking them into
            // fontSize/geometry like Path items do.
            let scaleX = 1, scaleY = 1, rotation = 0;
            try {
                if (item.matrix && typeof item.matrix.decompose === 'function') {
                    const dec = item.matrix.decompose();
                    if (dec) {
                        scaleX = (dec.scaling && typeof dec.scaling.x === 'number') ? dec.scaling.x : 1;
                        scaleY = (dec.scaling && typeof dec.scaling.y === 'number') ? dec.scaling.y : 1;
                        rotation = dec.rotation || 0;
                    }
                }
            } catch (e) {}

            // PDF glyphs/images are already right-side-up in PDF's Y-up page
            // space (unlike vector path points, which genuinely need a Y
            // flip). Reproducing the SAME visual rotation the person sees on
            // the Y-down canvas therefore means negating the angle here, not
            // flipping the matrix rows — flipping the rows is what caused
            // text to render mirrored.
            const rad = ((-rotation) * Math.PI) / 180;
            const cosR = Math.cos(rad), sinR = Math.sin(rad);
            const a = scaleX * cosR, b = scaleX * sinR, c = -scaleY * sinR, d = scaleY * cosR;

            const baseE = tx(item.point.x, ox);
            const baseF = ty(item.point.y, oy, ph);

            const raster = rasterizeTextItem(item);

            if (raster) {
                // Place the rasterized text block: map its four corners
                // (relative to its own local text-anchor point) through the
                // same rotation/scale matrix used above, then solve for the
                // single affine `cm` matrix PDF needs for image placement.
                // Note: v must be up-positive here (matching how `d`/`c` were
                // derived above), which is the opposite of the raster's own
                // top-down pixel-row convention — hence localAnchorY - localH
                // rather than localH - localAnchorY.
                const u_bl = -raster.localAnchorX, v_bl = raster.localAnchorY - raster.localH;
                const A = a * raster.localW;
                const B = b * raster.localW;
                const C = c * raster.localH;
                const D = d * raster.localH;
                const E = baseE + a * u_bl + c * v_bl;
                const F = baseF + b * u_bl + d * v_bl;

                const name = 'TX' + (Object.keys(images).length + 1);
                images[name] = { rw: raster.rw, rh: raster.rh, rgbBytes: raster.rgbBytes, alphaBytes: raster.alphaBytes };

                ops.push('q');
                ops.push(`${r3(A)} ${r3(B)} ${r3(C)} ${r3(D)} ${r3(E)} ${r3(F)} cm`);
                ops.push(`/${name} Do`);
                ops.push('Q');
            } else {
                // Fallback: vector text via a standard PDF base-14 font.
                // Won't match a custom web font exactly, but degrades
                // gracefully if rasterization ever fails (e.g. empty text).
                const fill = safeRGB(item.fillColor, [0,0,0]);
                const fs   = item.fontSize || 12;
                const leading = item.leading || (fs * 1.2);
                const lines = String(item.content || '').split('\n');
                const escape = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
                const justification = item.justification || 'left';
                const fontInfo = resolvePdfFont(item);

                ops.push('BT');
                ops.push(`/${fontInfo.resource} ${r3(fs)} Tf`);
                ops.push(`${fill[0]} ${fill[1]} ${fill[2]} rg`);

                lines.forEach((line, i) => {
                    const lineWidth = measureLineWidth(line, item);
                    let alignOffsetX = 0;
                    if (justification === 'center') alignOffsetX = -lineWidth / 2;
                    else if (justification === 'right') alignOffsetX = -lineWidth;

                    const localY = -leading * i;
                    const dX = a * alignOffsetX + c * localY;
                    const dY = b * alignOffsetX + d * localY;

                    ops.push(`${r3(a)} ${r3(b)} ${r3(c)} ${r3(d)} ${r3(baseE + dX)} ${r3(baseF + dY)} Tm`);
                    ops.push(`(${escape(line)}) Tj`);
                });
                ops.push('ET');
            }

        } else if (item instanceof paper.Raster) {
            try {
                // Native/original pixel size — this is what item.position
                // and item.matrix are calibrated against, so placement math
                // must use these even if we embed a downscaled copy below.
                const srcW = Math.max(1, Math.round(item.width));
                const srcH = Math.max(1, Math.round(item.height));

                // Cap the embedded resolution so a large photo doesn't
                // balloon the exported file — downscaling the embedded
                // pixels doesn't change where/how big it's placed, only how
                // sharp it looks at that size.
                const MAX_IMAGE_PIXELS = 16000000; // ~4000×4000
                let rw = srcW, rh = srcH, sourceCanvas;
                const nativeCtx = item.getContext(false);
                if (srcW * srcH > MAX_IMAGE_PIXELS) {
                    const shrink = Math.sqrt(MAX_IMAGE_PIXELS / (srcW * srcH));
                    rw = Math.max(1, Math.round(srcW * shrink));
                    rh = Math.max(1, Math.round(srcH * shrink));
                    const tmp = document.createElement('canvas');
                    tmp.width = rw; tmp.height = rh;
                    const tmpCtx = tmp.getContext('2d');
                    tmpCtx.drawImage(nativeCtx.canvas, 0, 0, srcW, srcH, 0, 0, rw, rh);
                    sourceCanvas = tmp;
                } else {
                    sourceCanvas = nativeCtx.canvas;
                }

                const imgCtx = (sourceCanvas === nativeCtx.canvas) ? nativeCtx : sourceCanvas.getContext('2d');
                const imgData = imgCtx.getImageData(0, 0, rw, rh);
                const src = imgData.data;
                const pixelCount = rw * rh;
                const rgb = new Uint8Array(pixelCount * 3);
                const alpha = new Uint8Array(pixelCount);
                for (let p = 0, s = 0; p < pixelCount; p++, s += 4) {
                    rgb[p * 3] = src[s]; rgb[p * 3 + 1] = src[s + 1]; rgb[p * 3 + 2] = src[s + 2];
                    alpha[p] = src[s + 3];
                }

                // Same rotation/scale decomposition and placement math as
                // rasterized text — see that branch above for the full
                // derivation/reasoning behind the sign conventions.
                let scaleX = 1, scaleY = 1, rotation = 0;
                try {
                    if (item.matrix && typeof item.matrix.decompose === 'function') {
                        const dec = item.matrix.decompose();
                        if (dec) {
                            scaleX = (dec.scaling && typeof dec.scaling.x === 'number') ? dec.scaling.x : 1;
                            scaleY = (dec.scaling && typeof dec.scaling.y === 'number') ? dec.scaling.y : 1;
                            rotation = dec.rotation || 0;
                        }
                    }
                } catch (e) {}

                const rad = ((-rotation) * Math.PI) / 180;
                const cosR = Math.cos(rad), sinR = Math.sin(rad);
                const a = scaleX * cosR, b = scaleX * sinR, c = -scaleY * sinR, d = scaleY * cosR;

                const baseE = tx(item.position.x, ox);
                const baseF = ty(item.position.y, oy, ph);

                // Raster geometry is centered at its own local origin
                // (position), unlike text which anchors at a baseline —
                // so its bottom-left corner is simply -half width/height.
                const u_bl = -srcW / 2, v_bl = -srcH / 2;
                const A = a * srcW, B = b * srcW, C = c * srcH, D = d * srcH;
                const E = baseE + a * u_bl + c * v_bl;
                const F = baseF + b * u_bl + d * v_bl;

                const name = 'IMG' + (Object.keys(images).length + 1);
                images[name] = { rw, rh, rgbBytes: bytesToBinaryString(rgb), alphaBytes: bytesToBinaryString(alpha) };

                ops.push('q');
                ops.push(`${r3(A)} ${r3(B)} ${r3(C)} ${r3(D)} ${r3(E)} ${r3(F)} cm`);
                ops.push(`/${name} Do`);
                ops.push('Q');
            } catch (e) { console.warn('Raster PDF export error:', e); }

        } else if (item instanceof paper.Group) {
            ops.push('q');
            item.children.forEach(child => {
                ops.push(...itemToOps(child, ox, oy, ph, shadings, images));
            });
            ops.push('Q');
        }

        if (opacity < 1) ops.push('Q');
        return ops;
    }

    // ── Build raw PDF bytes ────────────────────────────
    // We write a minimal but spec-compliant PDF manually.
    // Structure: header, objects (pages, content streams), xref, trailer.

    const pdfParts = []; // array of strings/Uint8Arrays
    let offset = 0;
    const offsets = [];

    function w(str) {
        pdfParts.push(str);
        offset += str.length;
    }

    // Write header
    w('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); // magic bytes signal binary content

    // Object counter (1-based)
    let objNum = 0;
    function nextObj() { return ++objNum; }

    const catNum   = nextObj(); // 1 - catalog
    const pagesNum = nextObj(); // 2 - pages dict
    const fontNums = PDF_BASE_FONTS.map(() => nextObj()); // one object per base-14 font

    // We'll fill page object numbers after we know how many pages
    const pageNums = boards.map(() => nextObj());

    // Content stream object numbers
    const contentNums = boards.map(() => nextObj());

    // Write font object
    function writeObj(num, content) {
        offsets[num] = offset;
        w(`${num} 0 obj\n${content}\nendobj\n`);
    }

    // ── PPI → PDF points conversion ───────────────────
    // PDF uses points (1/72 inch). Our artboard is in paper-pixels at state.artboardResolution ppi.
    // Scale factor: 72 / PPI converts paper-pixels → PDF points.
    const PDF_PPI  = state.artboardResolution || 300;
    const PX_TO_PT = 72 / PDF_PPI; // e.g. 72/300 = 0.24 pt per pixel

    // ── Per-page content streams ──────────────────────
    // Each page gets its own shadings dict so shading names don't conflict
    const contentStreams = [];
    const pageShadeObjs = []; // array of {name: dictStr} per page
    const pageImageObjs = []; // array of {name: {rw, rh, rgbBytes, alphaBytes}} per page

    for (let i = 0; i < boards.length; i++) {
        const bounds = boards[i].rect.bounds;
        const W = bounds.width, H = bounds.height;
        const ox = bounds.x,    oy = bounds.y;

        // Per-page shadings dict — populated by itemToOps via buildShading
        const shadings = {};
        // Per-page rasterized-text images (font fidelity workaround — see
        // rasterizeTextItem below) — populated by itemToOps
        const images = {};

        const ops = [];
        // Scale all subsequent coordinates from paper-pixels to PDF points.
        // This single cm transform handles everything: paths, text, shadings.
        ops.push(`${r3(PX_TO_PT)} 0 0 ${r3(PX_TO_PT)} 0 0 cm`);

        // White page background (in paper-pixel coords — will be scaled by cm)
        ops.push('q');
        ops.push('1 1 1 rg');
        ops.push(`0 0 ${r3(W)} ${r3(H)} re`);
        ops.push('f');
        ops.push('Q');

        // Draw all items from draw layers
        paper.project.layers.forEach(layer => {
            if (layer === window.artboardLayer) return;
            if (layer.name === 'System Artboard') return;
            layer.children.forEach(child => {
                if (!child.isInserted() || !child.visible) return;
                if (child.bounds && child.bounds.intersects(bounds)) {
                    ops.push('q');
                    ops.push(...itemToOps(child, ox, oy, H, shadings, images));
                    ops.push('Q');
                }
            });
        });

        contentStreams.push(ops.join('\n'));
        pageShadeObjs.push(shadings);
        pageImageObjs.push(images);
    }

    // ── Write objects ─────────────────────────────────

    // Catalog
    writeObj(catNum,
        `<< /Type /Catalog\n   /Pages ${pagesNum} 0 R\n>>`
    );

    // Pages (parent)
    const kidsStr = pageNums.map(n => `${n} 0 R`).join(' ');
    writeObj(pagesNum,
        `<< /Type /Pages\n   /Kids [${kidsStr}]\n   /Count ${boards.length}\n>>`
    );

    // Fonts (standard PDF base-14 fonts — always available, no embedding needed)
    PDF_BASE_FONTS.forEach((baseFont, i) => {
        writeObj(fontNums[i],
            `<< /Type /Font\n   /Subtype /Type1\n   /BaseFont /${baseFont}\n   /Encoding /WinAnsiEncoding\n>>`
        );
    });

    // Write each page + its content stream
    for (let i = 0; i < boards.length; i++) {
        const bounds = boards[i].rect.bounds;
        // MediaBox must be in PDF points: paper-pixels × (72/PPI)
        const W_pt = r3(bounds.width  * PX_TO_PT);
        const H_pt = r3(bounds.height * PX_TO_PT);
        const cNum = contentNums[i];
        const pNum = pageNums[i];
        const stream = contentStreams[i];
        const shadings = pageShadeObjs[i];
        const images = pageImageObjs[i];

        // Build Shading resource dict if this page has gradients
        const shadeKeys = Object.keys(shadings);
        let shadeResource = '';
        if (shadeKeys.length > 0) {
            const shEntries = shadeKeys.map(k => `/${k} ${shadings[k]}`).join('\n');
            shadeResource = `\n   /Shading << ${shEntries} >>`;
        }

        // Write each rasterized-text image (+ its alpha mask) as a real PDF
        // image XObject, and build the page's /XObject resource entries.
        const imgKeys = Object.keys(images);
        let xobjResource = '';
        if (imgKeys.length > 0) {
            const xEntries = imgKeys.map(k => {
                const img = images[k];
                const maskNum = nextObj();
                const maskDict =
                    `<< /Type /XObject\n   /Subtype /Image\n   /Width ${img.rw}\n   /Height ${img.rh}\n` +
                    `   /ColorSpace /DeviceGray\n   /BitsPerComponent 8\n   /Length ${img.alphaBytes.length}\n>>`;
                offsets[maskNum] = offset;
                w(`${maskNum} 0 obj\n${maskDict}\nstream\n`);
                w(img.alphaBytes);
                w('\nendstream\nendobj\n');

                const imgNum = nextObj();
                const imgDict =
                    `<< /Type /XObject\n   /Subtype /Image\n   /Width ${img.rw}\n   /Height ${img.rh}\n` +
                    `   /ColorSpace /DeviceRGB\n   /BitsPerComponent 8\n   /SMask ${maskNum} 0 R\n   /Length ${img.rgbBytes.length}\n>>`;
                offsets[imgNum] = offset;
                w(`${imgNum} 0 obj\n${imgDict}\nstream\n`);
                w(img.rgbBytes);
                w('\nendstream\nendobj\n');

                return `/${k} ${imgNum} 0 R`;
            }).join(' ');
            xobjResource = `\n   /XObject << ${xEntries} >>`;
        }

        // Page object — MediaBox in PDF points (8.5×11in = 612×792pt)
        const fontResourceEntries = PDF_BASE_FONTS.map((_, fi) => `/F${fi + 1} ${fontNums[fi]} 0 R`).join(' ');
        writeObj(pNum,
            `<< /Type /Page\n   /Parent ${pagesNum} 0 R\n` +
            `   /MediaBox [0 0 ${W_pt} ${H_pt}]\n` +
            `   /Contents ${cNum} 0 R\n` +
            `   /Resources << /Font << ${fontResourceEntries} >>${shadeResource}${xobjResource} >>\n>>`
        );

        // Content stream object
        const streamBytes = new TextEncoder().encode(stream);
        const slen = streamBytes.length;
        offsets[cNum] = offset;
        w(`${cNum} 0 obj\n<< /Length ${slen} >>\nstream\n`);
        w(stream);
        w('\nendstream\nendobj\n');
    }

    // ── Cross-reference table ─────────────────────────
    const xrefOffset = offset;
    const totalObjs = objNum + 1; // +1 for object 0

    let xref = `xref\n0 ${totalObjs}\n`;
    xref += `0000000000 65535 f \n`; // object 0 (free)
    for (let n = 1; n <= objNum; n++) {
        const off = offsets[n] || 0;
        xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    w(xref);

    // ── Trailer ───────────────────────────────────────
    w(`trailer\n<< /Size ${totalObjs}\n   /Root ${catNum} 0 R\n>>\n`);
    w(`startxref\n${xrefOffset}\n%%EOF\n`);

    // ── Assemble ───────────────────────────────────────
    // IMPORTANT: don't do `pdfParts.join('')` here — for a multi-artboard
    // export with several rasterized text images, the combined PDF can
    // exceed the JS engine's ~1GB max string length (RangeError: Invalid
    // string length). Converting each piece to raw bytes individually and
    // handing the array straight to Blob avoids ever holding the whole
    // file as one JS string; Blob is bounded by memory, not that limit.
    const byteParts = pdfParts.map(part => {
        const arr = new Uint8Array(part.length);
        for (let i = 0; i < part.length; i++) arr[i] = part.charCodeAt(i) & 0xff;
        return arr;
    });

    return new Blob(byteParts, { type: 'application/pdf' });
}
window.__iguhitBuildPdfBlob = buildPdfBlob;

// Builds the PDF and triggers a local download — the original entry point,
// kept as a thin wrapper so existing callers (the Export PDF button) don't
// need to change. Google Drive export reuses buildPdfBlob() directly instead.
function exportAllArtboardsPDF() {
    const blob = buildPdfBlob();
    if (!blob) return; // buildPdfBlob() already alerted the person why
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
        href: url, download: 'iGuhit-export.pdf'
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// High-res raster fallback (kept for reference, not used by main export)
async function addHighResImagePage(pdf, bounds) {
    const W = Math.round(bounds.width);
    const H = Math.round(bounds.height);
    const DPR = 4;
    const abVis = window.artboardLayer?.visible ?? true;
    if (window.artboardLayer) window.artboardLayer.visible = false;
    paper.view.draw();
    const zoom = paper.view.zoom, deviceDPR = window.devicePixelRatio || 1;
    const vp = paper.view.projectToView(bounds.topLeft);
    const tc = document.createElement('canvas');
    tc.width = W * DPR; tc.height = H * DPR;
    const ctx = tc.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tc.width, tc.height);
    ctx.scale(DPR, DPR);
    ctx.drawImage(paper.view.element,
        Math.round(vp.x * deviceDPR), Math.round(vp.y * deviceDPR),
        Math.round(bounds.width * zoom * deviceDPR), Math.round(bounds.height * zoom * deviceDPR),
        0, 0, W, H);
    pdf.addImage(tc.toDataURL('image/png', 1.0), 'PNG', 0, 0,
        bounds.width, bounds.height, undefined, 'FAST');
    if (window.artboardLayer) window.artboardLayer.visible = abVis;
    paper.view.draw();
}

// ── Busy overlay (PDF export/import can take a moment) ──
function showBusyOverlay(message) {
    const overlay = document.getElementById('iguhit-busy-overlay');
    const msgEl = document.getElementById('iguhit-busy-message');
    if (msgEl) msgEl.textContent = message || 'Working…';
    if (overlay) overlay.style.display = 'flex';
}
function hideBusyOverlay() {
    const overlay = document.getElementById('iguhit-busy-overlay');
    if (overlay) overlay.style.display = 'none';
}
// Runs `fn` after giving the browser a chance to actually paint the busy
// overlay first — a plain synchronous call would block the render before
// the overlay ever becomes visible, since JS is single-threaded.
function runWithBusyOverlay(message, fn) {
    showBusyOverlay(message);
    setTimeout(() => {
        // One more frame so the overlay reliably paints even on fast machines
        requestAnimationFrame(() => {
            try {
                fn();
            } catch (e) {
                console.error(e);
                alert('Something went wrong: ' + (e && e.message ? e.message : e));
            } finally {
                hideBusyOverlay();
            }
        });
    }, 30);
}
window.__iguhitRunWithBusyOverlay = runWithBusyOverlay;

// Async counterpart to runWithBusyOverlay — for flows involving Promises
// (Google Drive's sign-in popup and upload requests), where the plain
// synchronous version's try/finally would hide the overlay before the
// actual work finishes.
function runWithBusyOverlayAsync(message, asyncFn) {
    showBusyOverlay(message);
    setTimeout(async () => {
        try {
            await asyncFn();
        } catch (e) {
            console.error(e);
            alert('Something went wrong: ' + (e && e.message ? e.message : e));
        } finally {
            hideBusyOverlay();
        }
    }, 30);
}
window.__iguhitRunWithBusyOverlayAsync = runWithBusyOverlayAsync;

// ── "Save to Google Drive" ──────────────────────────────
// A web app can't silently write to someone's Google Drive without the
// app's developer registering real OAuth credentials with Google, tied to
// the exact domain it's hosted on — that's not something that can be made
// to "just work" from here. Instead, this uses the File System Access API
// (showSaveFilePicker), which opens the browser's own native save dialog —
// zero setup required. If Google Drive for Desktop is installed (or on
// ChromeOS, where Drive is built into the Files app), Drive shows up as a
// regular folder the person can navigate to and save straight into.
// Supported in Chrome/Edge; falls back to a normal download elsewhere.
async function saveBlobToDiskOrDrive(blob, suggestedName, mimeType, extension, description) {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: suggestedName,
                types: [{ description: description, accept: { [mimeType]: ['.' + extension] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return 'saved';
        } catch (err) {
            if (err && err.name === 'AbortError') return 'cancelled'; // person closed the dialog — not an error
            throw err;
        }
    }
    return 'unsupported';
}

function downloadBlob(blob, filename) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

document.getElementById('btn-save-iguhit-drive')?.addEventListener('click', () => {
    runWithBusyOverlayAsync('Preparing file…', async () => {
        const blob = buildIguhitFileBlob();
        const result = await saveBlobToDiskOrDrive(blob, 'artwork.iguhit', 'application/json', 'iguhit', 'iGuhit Project File');
        if (result === 'saved') {
            if (window.showNotification) showNotification('Saved ✓ — pick your Google Drive folder in the dialog to save straight there.');
        } else if (result === 'unsupported') {
            downloadBlob(blob, 'artwork.iguhit');
            alert('Your browser doesn\'t support choosing a save location directly (this needs Chrome or Edge). The file downloaded normally instead — you can upload it to Google Drive from there.');
        }
    });
});

document.getElementById('btn-export-pdf-drive')?.addEventListener('click', () => {
    runWithBusyOverlayAsync('Generating PDF…', async () => {
        const blob = buildPdfBlob();
        if (!blob) return; // buildPdfBlob() already alerted why (e.g. no artboard)
        const result = await saveBlobToDiskOrDrive(blob, 'iGuhit-export.pdf', 'application/pdf', 'pdf', 'PDF Document');
        if (result === 'saved') {
            if (window.showNotification) showNotification('Saved ✓ — pick your Google Drive folder in the dialog to save straight there.');
        } else if (result === 'unsupported') {
            downloadBlob(blob, 'iGuhit-export.pdf');
            alert('Your browser doesn\'t support choosing a save location directly (this needs Chrome or Edge). The PDF downloaded normally instead — you can upload it to Google Drive from there.');
        }
    });
});

// Single authoritative PDF export — iguhit-enhancements.js btn-export-pdf listener is disabled
document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    runWithBusyOverlay('Generating PDF, please wait…', exportAllArtboardsPDF);
});

// ── Open PDF (as Artboards) ────────────────────────────
// Lightweight, dependency-free page-count/size detector: scans the raw PDF
// bytes for "/Type /Page" object dictionaries and their "/MediaBox", rather
// than fully parsing/rendering the file (which would need a much heavier
// library). This reliably works for PDFs this app itself exports, and for
// many "plain" PDFs from other tools — but PDFs using compressed
// cross-reference/object streams (common in some modern generators) may not
// be readable this way, in which case it falls back to a single default
// Letter-size artboard rather than failing outright.
function scanPdfPages(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const CHUNK = 2 * 1024 * 1024;   // 2MB per chunk
    const OVERLAP = 2000;            // > the lookahead window below, so a
                                      // dictionary spanning a chunk boundary
                                      // still gets matched whole at least once
    const seenPageMarkers = new Set();
    const seenPairedMarkers = new Set();
    const sizesByPos = [];
    let anyMediaBox = null;

    const pairedRe = /\/Type\s*\/Page(?!s)\b[\s\S]{0,1800}?\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g;
    const countRe  = /\/Type\s*\/Page(?!s)\b/g;
    const anyBoxRe = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/;

    for (let offset = 0; offset < bytes.length; offset += (CHUNK - OVERLAP)) {
        const end = Math.min(bytes.length, offset + CHUNK);
        const slice = bytes.subarray(offset, end);
        let str = '';
        for (let i = 0; i < slice.length; i += 8192) {
            str += String.fromCharCode.apply(null, slice.subarray(i, Math.min(slice.length, i + 8192)));
        }

        countRe.lastIndex = 0;
        let cm;
        while ((cm = countRe.exec(str))) seenPageMarkers.add(offset + cm.index);

        pairedRe.lastIndex = 0;
        let pm;
        while ((pm = pairedRe.exec(str))) {
            const pos = offset + pm.index;
            if (!seenPairedMarkers.has(pos)) {
                seenPairedMarkers.add(pos);
                const w = Math.abs(parseFloat(pm[3]) - parseFloat(pm[1]));
                const h = Math.abs(parseFloat(pm[4]) - parseFloat(pm[2]));
                if (w > 1 && h > 1) sizesByPos.push({ pos, width: w, height: h });
            }
        }

        if (!anyMediaBox) {
            const bm = anyBoxRe.exec(str);
            if (bm) {
                const w = Math.abs(parseFloat(bm[3]) - parseFloat(bm[1]));
                const h = Math.abs(parseFloat(bm[4]) - parseFloat(bm[2]));
                if (w > 1 && h > 1) anyMediaBox = { width: w, height: h };
            }
        }

        if (end >= bytes.length) break;
    }

    sizesByPos.sort((a, b) => a.pos - b.pos);
    const pageCount = Math.max(seenPageMarkers.size, sizesByPos.length);
    const pages = [];
    for (let i = 0; i < pageCount; i++) {
        const found = sizesByPos[i];
        pages.push(found ? { width: found.width, height: found.height } : (anyMediaBox || { width: 612, height: 792 }));
    }
    return pages;
}

function createArtboardsFromPdfPages(pages, fileName) {
    if (!window.paper || !pages.length) return;

    const PT_TO_PX = (state.artboardResolution || 300) / 72;

    artboardLayer.locked = false;

    // Start fresh from the imported PDF's page structure.
    if (window.multiArtboards) {
        window.multiArtboards.forEach(ab => { try { ab.group.remove(); } catch (e) {} });
    }
    window.multiArtboards = [];

    // Uniform grid cell size = the largest page across the whole document,
    // so artboards never overlap even when page sizes vary — each artboard
    // still gets its own true size, only the grid SPACING is uniform.
    let maxW = 1, maxH = 1;
    pages.forEach(p => {
        const w = Math.max(1, Math.round(p.width * PT_TO_PX));
        const h = Math.max(1, Math.round(p.height * PT_TO_PX));
        if (w > maxW) maxW = w;
        if (h > maxH) maxH = h;
    });

    pages.forEach((p, idx) => {
        const w = Math.max(1, Math.round(p.width * PT_TO_PX));
        const h = Math.max(1, Math.round(p.height * PT_TO_PX));

        if (idx === 0) {
            state.artboardWidth = w;
            state.artboardHeight = h;
            updateArtboardSize(w, h);
        } else {
            const extraCount = window.multiArtboards.filter(a => !a.isMain).length;
            const pos = computeNextArtboardGridPosition(extraCount, maxW, maxH);
            const created = createArtboardObject(pos.x, pos.y, w, h);
            created.bounds = created.rect.bounds;
            artboardLayer.addChild(created.group);
            window.multiArtboards.push(created);
        }
    });

    artboardLayer.locked = true;
    if (window.drawLayer) window.drawLayer.activate();

    paper.view.draw();
    updateLayersUI();
    saveState();

    const label = pages.length + ' artboard' + (pages.length > 1 ? 's' : '') + ' from ' + fileName;
    if (window.showNotification) showNotification('Created ' + label + ' ✓');
}

// Renders every page of a loaded PDF onto its own correctly-sized artboard
// using pdf.js — this actually places each page's visual content (text,
// graphics, images all flattened together), not just an empty same-size
// artboard. Runs pages one at a time so the busy overlay can show progress
// and the tab doesn't lock up on larger documents.
async function importPdfWithContent(arrayBuffer, fileName) {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const PT_TO_PX = (state.artboardResolution || 300) / 72;
    const RENDER_SCALE = Math.min(PT_TO_PX, 4); // cap render resolution to keep memory/time sane

    // Pre-pass: read every page's size before laying anything out. The grid
    // cell size is based on the LARGEST page across the whole document, so
    // artboards never overlap even when pages vary in size — each artboard
    // still gets its own true size, only the grid SPACING is uniform.
    showBusyOverlay('Reading page sizes…');
    await new Promise(resolve => setTimeout(resolve, 0));
    const pageSizes = [];
    let maxWPx = 1, maxHPx = 1;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const vp = page.getViewport({ scale: 1 });
        const wPx = Math.max(1, Math.round(vp.width * PT_TO_PX));
        const hPx = Math.max(1, Math.round(vp.height * PT_TO_PX));
        pageSizes.push({ wPx, hPx });
        if (wPx > maxWPx) maxWPx = wPx;
        if (hPx > maxHPx) maxHPx = hPx;
    }

    artboardLayer.locked = false;
    if (window.multiArtboards) {
        window.multiArtboards.forEach(ab => { try { ab.group.remove(); } catch (e) {} });
    }
    window.multiArtboards = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        showBusyOverlay('Importing page ' + pageNum + ' of ' + numPages + '…');
        await new Promise(resolve => setTimeout(resolve, 0)); // let the overlay message repaint

        const { wPx, hPx } = pageSizes[pageNum - 1];
        const page = await pdfDoc.getPage(pageNum);
        const renderViewport = page.getViewport({ scale: RENDER_SCALE });
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = Math.max(1, Math.round(renderViewport.width));
        pageCanvas.height = Math.max(1, Math.round(renderViewport.height));
        await page.render({ canvasContext: pageCanvas.getContext('2d'), viewport: renderViewport }).promise;

        let x, y;
        if (pageNum === 1) {
            state.artboardWidth = wPx;
            state.artboardHeight = hPx;
            updateArtboardSize(wPx, hPx);
            x = window.artboardRect ? window.artboardRect.bounds.x : 200;
            y = window.artboardRect ? window.artboardRect.bounds.y : 150;
        } else {
            // Same 2-column grid the "Add Artboard" button uses (uniform
            // cell size from the pre-pass above), so pages line up left/
            // right without overlapping, and clicking "Add Artboard"
            // afterward continues in the correct next slot. The person can
            // always drag individual artboards to reposition them further
            // with the Artboard tool if they want a different arrangement.
            const extraCount = window.multiArtboards.filter(a => !a.isMain).length;
            const pos = computeNextArtboardGridPosition(extraCount, maxWPx, maxHPx);
            x = pos.x; y = pos.y;
            const created = createArtboardObject(x, y, wPx, hPx);
            created.bounds = created.rect.bounds;
            artboardLayer.addChild(created.group);
            window.multiArtboards.push(created);
        }

        await new Promise((resolve, reject) => {
            const raster = new paper.Raster({
                source: pageCanvas.toDataURL('image/png'),
                position: new paper.Point(x + wPx / 2, y + hPx / 2)
            });
            raster.onLoad = function () {
                raster.bounds = new paper.Rectangle(x, y, wPx, hPx);
                if (window.drawLayer) window.drawLayer.addChild(raster);
                resolve();
            };
            raster.onError = reject;
        });
    }

    artboardLayer.locked = true;
    if (window.drawLayer) window.drawLayer.activate();

    paper.view.draw();
    updateLayersUI();
    saveState();

    const label = numPages + ' page' + (numPages > 1 ? 's' : '') + ' from ' + fileName;
    if (window.showNotification) showNotification('Imported ' + label + ' ✓');
}

document.getElementById('btn-open-pdf')?.addEventListener('click', () => {
    document.getElementById('pdf-file-input')?.click();
});

document.getElementById('pdf-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    showBusyOverlay('Reading ' + file.name + '…');
    const reader = new FileReader();

    // Fallback: page-count/size only (no rendered content), used if pdf.js
    // itself isn't available or the full content import throws.
    function fallbackArtboardsOnly(arrayBuffer, reason) {
        let pages = [];
        try { pages = scanPdfPages(arrayBuffer); } catch (err) { console.error(err); }
        if (!pages.length) pages = [{ width: 612, height: 792 }];
        createArtboardsFromPdfPages(pages, file.name);
        setTimeout(() => alert(reason + ' Created artboard(s) matching the page size(s) instead, without the page content.'), 50);
    }

    reader.onload = async (ev) => {
        const originalBuffer = ev.target.result;
        try {
            if (window.pdfjsLib) {
                showBusyOverlay('Opening ' + file.name + '…');
                await new Promise(resolve => setTimeout(resolve, 0));
                try {
                    // pdf.js's worker may transfer/detach the buffer it's
                    // given, so hand it a copy and keep the original intact
                    // in case we need to fall back.
                    await importPdfWithContent(originalBuffer.slice(0), file.name);
                } catch (err) {
                    console.error('PDF content import failed, falling back to page sizes only:', err);
                    fallbackArtboardsOnly(originalBuffer, 'Could not fully import this PDF\'s content (' + (err && err.message ? err.message : err) + ').');
                }
            } else {
                fallbackArtboardsOnly(originalBuffer, 'The PDF import library failed to load (check your internet connection).');
            }
        } catch (err) {
            console.error(err);
            alert('Could not process that PDF: ' + (err && err.message ? err.message : err));
        } finally {
            hideBusyOverlay();
        }
    };
    reader.onerror = () => {
        hideBusyOverlay();
        alert('Could not read that file.');
    };
    reader.readAsArrayBuffer(file);
});


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

